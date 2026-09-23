from datetime import UTC, datetime
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.api.idempotency import (
    hash_request_body,
    request_matches,
)
from app.infra.db import get_db
from app.infra.models.group import (
    Group,
    GroupState,
    MembershipRole,
)
from app.infra.models.idempotency import (
    IdempotencyRecord,
)
from app.infra.models.user import User
from app.main import app
from app.services.groups import GroupView

client = TestClient(app)


class FakeIdempotencyDatabase:
    def __init__(self) -> None:
        self.records: dict[object, IdempotencyRecord] = {}

    def get(
        self,
        model: type[IdempotencyRecord],
        key: object,
    ) -> IdempotencyRecord | None:
        del model
        return self.records.get(key)

    def add(self, record: IdempotencyRecord) -> None:
        self.records[record.key] = record

    def commit(self) -> None:
        return None

    def delete(self, record: IdempotencyRecord) -> None:
        del self.records[record.key]


class FakeDatabaseContext:
    def __init__(self, database: FakeIdempotencyDatabase) -> None:
        self.database = database

    def __enter__(self) -> FakeIdempotencyDatabase:
        return self.database

    def __exit__(self, *args: object) -> None:
        return None


def make_group_view() -> GroupView:
    now = datetime.now(UTC)
    user = User(
        id=uuid4(),
        email="owner@example.com",
        display_name="Owner",
        timezone="Europe/Stockholm",
        notify_email_default=True,
        created_at=now,
    )
    group = Group(
        id=uuid4(),
        slug="7fQ2mXk9Lp3R",
        name="Project group",
        description=None,
        owner_id=user.id,
        timezone="Europe/Stockholm",
        date_start=datetime(2026, 10, 1, tzinfo=UTC).date(),
        date_end=datetime(2026, 10, 7, tzinfo=UTC).date(),
        window_start_minute=480,
        window_end_minute=1020,
        slot_minutes=30,
        state=GroupState.OPEN,
        invite_token_hash="invite",
        feed_token_hash="feed",
        version=1,
        created_at=now,
        updated_at=now,
    )
    return GroupView(
        group=group,
        member_count=1,
        my_role=MembershipRole.OWNER,
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


def test_http_idempotency_captures_and_replays_group_response() -> None:
    user = User(
        id=uuid4(),
        email="owner@example.com",
        display_name="Owner",
        timezone="Europe/Stockholm",
        notify_email_default=True,
        created_at=datetime.now(UTC),
    )
    database = FakeIdempotencyDatabase()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: object()
    view = make_group_view()

    with (
        patch(
            "app.api.idempotency.guarded_session",
            side_effect=lambda: FakeDatabaseContext(database),
        ),
        patch(
            "app.api.groups.create_group",
            return_value=(view, "test-invite-token"),
        ),
        patch(
            "app.api.groups.get_settings",
            return_value=type(
                "Settings",
                (),
                {"public_app_url": "http://localhost:8080"},
            )(),
        ),
    ):
        key = str(uuid4())
        body = {
            "name": "Project group",
            "date_start": "2026-10-01",
            "date_end": "2026-10-07",
            "window_start_minute": 480,
            "window_end_minute": 1020,
        }

        first = client.post(
            "/api/v1/groups",
            json=body,
            headers={"Idempotency-Key": key},
        )
        replay = client.post(
            "/api/v1/groups",
            json=body,
            headers={"Idempotency-Key": key},
        )

        assert first.status_code == 201
        assert replay.status_code == first.status_code
        assert replay.headers["content-type"] == first.headers["content-type"]
        assert replay.json() == first.json()

    app.dependency_overrides.clear()


def test_http_idempotency_rejects_same_key_for_different_group_body() -> None:
    user = User(
        id=uuid4(),
        email="owner@example.com",
        display_name="Owner",
        timezone="Europe/Stockholm",
        notify_email_default=True,
        created_at=datetime.now(UTC),
    )
    database = FakeIdempotencyDatabase()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: object()

    with (
        patch(
            "app.api.idempotency.guarded_session",
            side_effect=lambda: FakeDatabaseContext(database),
        ),
        patch(
            "app.api.groups.create_group",
            return_value=(make_group_view(), "test-invite-token"),
        ),
        patch(
            "app.api.groups.get_settings",
            return_value=type(
                "Settings",
                (),
                {"public_app_url": "http://localhost:8080"},
            )(),
        ),
    ):
        key = str(uuid4())
        first = client.post(
            "/api/v1/groups",
            json={
                "name": "First",
                "date_start": "2026-10-01",
                "date_end": "2026-10-07",
                "window_start_minute": 480,
                "window_end_minute": 1020,
            },
            headers={"Idempotency-Key": key},
        )
        conflict = client.post(
            "/api/v1/groups",
            json={
                "name": "Second",
                "date_start": "2026-10-01",
                "date_end": "2026-10-07",
                "window_start_minute": 480,
                "window_end_minute": 1020,
            },
            headers={"Idempotency-Key": key},
        )

        assert first.status_code == 201
        assert conflict.status_code == 409
        assert conflict.json()["code"] == "idempotency_key_reuse"

    app.dependency_overrides.clear()
