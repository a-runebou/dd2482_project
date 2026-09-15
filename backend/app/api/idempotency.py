import hashlib
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import Request, Response
from starlette.middleware.base import (
    BaseHTTPMiddleware,
    RequestResponseEndpoint,
)
from starlette.responses import StreamingResponse

from app.api.errors import problem_response
from app.infra.db import SessionLocal
from app.infra.models.idempotency import IdempotencyRecord

IDEMPOTENCY_TTL = timedelta(hours=24)

MUTATING_METHODS = {
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
}

IGNORED_RESPONSE_HEADERS = {
    "content-length",
    "transfer-encoding",
}


def hash_request_body(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def request_matches(
    record: IdempotencyRecord,
    *,
    method: str,
    path: str,
    request_hash: str,
) -> bool:
    return (
        record.method == method
        and record.path == path
        and record.request_hash == request_hash
    )


def replay_response(
    record: IdempotencyRecord,
) -> Response:
    return Response(
        content=record.response_body,
        status_code=record.status_code,
        headers=record.response_headers,
    )


async def read_response_body(
    response: Response,
) -> bytes:
    if isinstance(response, StreamingResponse):
        chunks: list[bytes] = []

        async for chunk in response.body_iterator:
            if isinstance(chunk, str):
                chunks.append(chunk.encode())
            elif isinstance(chunk, memoryview):
                chunks.append(chunk.tobytes())
            else:
                chunks.append(chunk)

        return b"".join(chunks)

    body = response.body

    if isinstance(body, memoryview):
        return body.tobytes()

    return body


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        if request.method not in MUTATING_METHODS:
            return await call_next(request)

        raw_key = request.headers.get("Idempotency-Key")

        if raw_key is None:
            return await call_next(request)

        try:
            key = UUID(raw_key)
        except ValueError:
            return problem_response(
                request=request,
                status_code=400,
                code="validation_failed",
                title="Invalid Idempotency-Key",
                detail=("Idempotency-Key must be a UUID."),
            )

        body = await request.body()
        request_hash = hash_request_body(body)

        now = datetime.now(UTC)

        with SessionLocal() as db:
            record = db.get(
                IdempotencyRecord,
                key,
            )

            if record is not None and now - record.created_at > IDEMPOTENCY_TTL:
                db.delete(record)
                db.commit()
                record = None

            if record is not None:
                if not request_matches(
                    record,
                    method=request.method,
                    path=request.url.path,
                    request_hash=request_hash,
                ):
                    return problem_response(
                        request=request,
                        status_code=409,
                        code="idempotency_key_reuse",
                        title="Idempotency key reused",
                        detail=(
                            "The idempotency key was "
                            "already used for a "
                            "different request."
                        ),
                    )

                return replay_response(record)

        response = await call_next(request)

        response_body = await read_response_body(response)

        response_headers = {
            header_name.lower(): header_value
            for header_name, header_value in response.headers.items()
            if header_name.lower() not in IGNORED_RESPONSE_HEADERS
        }

        if response.status_code < 500:
            with SessionLocal() as db:
                db.add(
                    IdempotencyRecord(
                        key=key,
                        method=request.method,
                        path=request.url.path,
                        request_hash=request_hash,
                        status_code=response.status_code,
                        response_body=(
                            response_body.decode(
                                "utf-8",
                                errors="replace",
                            )
                        ),
                        response_headers=response_headers,
                        created_at=now,
                    )
                )

                db.commit()

        return Response(
            content=response_body,
            status_code=response.status_code,
            headers=response_headers,
            background=response.background,
        )
