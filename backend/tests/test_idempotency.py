from datetime import UTC, datetime
from uuid import uuid4

from app.api.idempotency import (
    hash_request_body,
    request_matches,
)
from app.infra.models.idempotency import (
    IdempotencyRecord,
)


def test_request_body_hash_is_stable() -> None:
    body = b'{"name":"group"}'

    assert hash_request_body(body) == hash_request_body(body)


def test_idempotency_record_matches_request() -> None:
    body = b'{"name":"group"}'

    record = IdempotencyRecord(
        key=uuid4(),
        method="POST",
        path="/api/v1/groups",
        request_hash=hash_request_body(body),
        status_code=201,
        response_body="{}",
        response_headers={},
        created_at=datetime.now(UTC),
    )

    assert request_matches(
        record,
        method="POST",
        path="/api/v1/groups",
        request_hash=hash_request_body(body),
    )


def test_idempotency_record_rejects_other_body() -> None:
    record = IdempotencyRecord(
        key=uuid4(),
        method="POST",
        path="/api/v1/groups",
        request_hash=hash_request_body(b'{"name":"first"}'),
        status_code=201,
        response_body="{}",
        response_headers={},
        created_at=datetime.now(UTC),
    )

    assert not request_matches(
        record,
        method="POST",
        path="/api/v1/groups",
        request_hash=hash_request_body(b'{"name":"second"}'),
    )
