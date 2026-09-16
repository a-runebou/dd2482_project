from collections.abc import Mapping
from dataclasses import dataclass

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.infra.circuit import CircuitOpenError


@dataclass(frozen=True)
class FieldError:
    field: str
    message: str


class ProblemException(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: str | None = None,
        errors: list[FieldError] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(detail or title)

        self.status_code = status_code
        self.code = code
        self.title = title
        self.detail = detail
        self.errors = errors
        self.headers = headers


def problem_response(
    *,
    request: Request,
    status_code: int,
    code: str,
    title: str,
    detail: str | None = None,
    errors: list[FieldError] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    content: dict[str, object] = {
        "type": "about:blank",
        "title": title,
        "status": status_code,
        "code": code,
        "instance": request.url.path,
    }

    if detail is not None:
        content["detail"] = detail

    if errors is not None:
        content["errors"] = [
            {
                "field": error.field,
                "message": error.message,
            }
            for error in errors
        ]

    response_headers = dict(headers) if headers is not None else None

    return JSONResponse(
        status_code=status_code,
        content=content,
        headers=response_headers,
        media_type="application/problem+json",
    )


def problem_exception_handler(
    request: Request,
    exc: ProblemException,
) -> JSONResponse:
    return problem_response(
        request=request,
        status_code=exc.status_code,
        code=exc.code,
        title=exc.title,
        detail=exc.detail,
        errors=exc.errors,
        headers=exc.headers,
    )


def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    errors: list[FieldError] = []

    for error in exc.errors():
        location = error.get("loc", ())

        field_parts = [
            str(part)
            for part in location
            if part
            not in {
                "body",
                "query",
                "path",
                "header",
            }
        ]

        field = ".".join(field_parts)

        if not field:
            field = "request"

        errors.append(
            FieldError(
                field=field,
                message=str(
                    error.get(
                        "msg",
                        "Invalid value",
                    )
                ),
            )
        )

    return problem_response(
        request=request,
        status_code=400,
        code="validation_failed",
        title="Validation failed",
        detail="One or more request fields are invalid.",
        errors=errors,
    )


def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    if exc.status_code == 401:
        code = "unauthenticated"
        title = "Unauthenticated"
    elif exc.status_code == 403:
        code = "forbidden"
        title = "Forbidden"
    elif exc.status_code == 404:
        code = "not_found"
        title = "Not found"
    elif exc.status_code == 405:
        code = "validation_failed"
        title = "Method not allowed"
    else:
        code = "validation_failed"
        title = "Request failed"

    detail = exc.detail if isinstance(exc.detail, str) else None

    return problem_response(
        request=request,
        status_code=exc.status_code,
        code=code,
        title=title,
        detail=detail,
        headers=exc.headers,
    )


def unhandled_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    del exc

    return problem_response(
        request=request,
        status_code=500,
        code="internal_error",
        title="Internal server error",
        detail="An unexpected error occurred.",
    )


def circuit_open_exception_handler(
    request: Request,
    exc: CircuitOpenError,
) -> JSONResponse:
    del exc

    return problem_response(
        request=request,
        status_code=503,
        code="db_circuit_open",
        title="Database temporarily unavailable",
        detail=(
            "Database requests are temporarily disabled while the service recovers."
        ),
        headers={
            "Retry-After": "30",
        },
    )
