from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.infra.db import get_db
from app.infra.models.calendar import (
    CalendarSource,
    CalendarSourceKind,
    CalendarSourceStatus,
)
from app.infra.models.user import User
from app.main import app
from app.services.calendars import CalendarSourceLimitReached

client = TestClient(app)


def make_user() -> User:
    return User(
        id=uuid4(),
        email="alex@example.com",
        display_name="Alex",
        timezone="Europe/Stockholm",
        notify_email_default=True,
        created_at=datetime.now(UTC),
    )


def make_source() -> CalendarSource:
    return CalendarSource(
        id=uuid4(),
        user_id=uuid4(),
        kind=CalendarSourceKind.UPLOAD,
        url=None,
        label="schedule.ics",
        status=CalendarSourceStatus.OK,
        last_polled_at=datetime.now(UTC),
        last_error_code=None,
        etag=None,
        event_count=1,
        created_at=datetime.now(UTC),
    )


def override_db():
    yield MagicMock()


def test_upload_calendar(monkeypatch) -> None:
    user = make_user()
    source = make_source()

    app.dependency_overrides[get_current_user] = lambda: user

    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.me.upload_calendar",
        lambda *args, **kwargs: source,
    )

    response = client.post(
        "/api/v1/me/calendar-sources/upload",
        files={
            "file": (
                "schedule.ics",
                (b"BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"),
                "text/calendar",
            )
        },
    )

    assert response.status_code == 201
    assert response.json()["kind"] == "upload"

    app.dependency_overrides.clear()


def test_upload_requires_auth() -> None:
    response = client.post(
        "/api/v1/me/calendar-sources/upload",
        files={
            "file": (
                "schedule.ics",
                (b"BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"),
                "text/calendar",
            )
        },
    )

    assert response.status_code == 401


def test_create_calendar_subscription(
    monkeypatch,
) -> None:
    user = make_user()
    source = make_source()

    source.kind = CalendarSourceKind.URL
    source.url = "https://example.com/schedule.ics"
    source.status = CalendarSourceStatus.PENDING

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.me.create_calendar_source",
        lambda *args, **kwargs: source,
    )

    response = client.post(
        "/api/v1/me/calendar-sources",
        json={
            "url": "https://example.com/schedule.ics",
            "label": "KTH",
        },
    )

    assert response.status_code == 201
    assert response.json()["kind"] == "url"
    assert response.json()["status"] == "pending"

    app.dependency_overrides.clear()


def test_list_calendar_sources(
    monkeypatch,
) -> None:
    user = make_user()
    source = make_source()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.me.list_calendar_sources",
        lambda *args, **kwargs: [source],
    )

    response = client.get("/api/v1/me/calendar-sources")

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1

    app.dependency_overrides.clear()


def test_upload_calendar_source_limit_returns_contract_code(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(
        "app.api.me.upload_calendar",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            CalendarSourceLimitReached()
        ),
    )

    response = client.post(
        "/api/v1/me/calendar-sources/upload",
        files={
            "file": (
                "schedule.ics",
                b"BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
                "text/calendar",
            )
        },
    )

    assert response.status_code == 409
    assert response.json()["code"] == "calendar_source_limit_reached"
    app.dependency_overrides.clear()


def test_url_calendar_source_limit_returns_contract_code(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(
        "app.api.me.create_calendar_source",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            CalendarSourceLimitReached()
        ),
    )

    response = client.post(
        "/api/v1/me/calendar-sources",
        json={"url": "https://example.com/schedule.ics"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "calendar_source_limit_reached"
    app.dependency_overrides.clear()


def test_calendar_refresh_rate_limit_has_retry_after(monkeypatch) -> None:
    user = make_user()
    source = make_source()
    source.kind = CalendarSourceKind.URL

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(
        "app.api.me.refresh_calendar_source",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            RuntimeError("rate_limited")
        ),
    )

    response = client.post(
        f"/api/v1/me/calendar-sources/{source.id}/refresh",
    )

    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    assert response.headers["retry-after"] == "300"
    app.dependency_overrides.clear()


def make_busy_block(
    start_at: datetime,
    end_at: datetime,
) -> SimpleNamespace:
    return SimpleNamespace(
        start_at=start_at,
        end_at=end_at,
        source_id=uuid4(),
    )


def test_busy_intervals_are_merged_and_paginated(monkeypatch) -> None:
    user = make_user()
    start = datetime(2026, 9, 16, 8, tzinfo=UTC)
    blocks = [
        make_busy_block(start.replace(hour=10), start.replace(hour=11)),
        make_busy_block(start.replace(hour=8), start.replace(hour=9)),
        make_busy_block(
            start.replace(hour=8, minute=30),
            start.replace(hour=10, minute=30),
        ),
        make_busy_block(start.replace(hour=12), start.replace(hour=13)),
    ]

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(
        "app.api.me.get_busy_blocks",
        lambda *args, **kwargs: blocks,
    )

    first = client.get(
        "/api/v1/me/busy",
        params={
            "from": start.isoformat(),
            "to": start.replace(hour=14).isoformat(),
            "limit": 1,
        },
    )

    assert first.status_code == 200
    assert first.json()["data"] == [
        {
            "start_at": "2026-09-16T08:00:00Z",
            "end_at": "2026-09-16T11:00:00Z",
            "source_id": None,
        }
    ]
    assert first.json()["next_cursor"]

    second = client.get(
        "/api/v1/me/busy",
        params={
            "from": start.isoformat(),
            "to": start.replace(hour=14).isoformat(),
            "limit": 1,
            "cursor": first.json()["next_cursor"],
        },
    )

    assert second.status_code == 200
    assert second.json()["data"] == [
        {
            "start_at": "2026-09-16T12:00:00Z",
            "end_at": "2026-09-16T13:00:00Z",
            "source_id": None,
        }
    ]
    assert second.json()["next_cursor"] is None
    app.dependency_overrides.clear()


def test_busy_invalid_cursor_returns_validation_problem(monkeypatch) -> None:
    user = make_user()
    start = datetime(2026, 9, 16, 8, tzinfo=UTC)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(
        "app.api.me.get_busy_blocks",
        lambda *args, **kwargs: [
            make_busy_block(start, start.replace(hour=9)),
        ],
    )

    response = client.get(
        "/api/v1/me/busy",
        params={
            "from": start.isoformat(),
            "to": start.replace(hour=10).isoformat(),
            "cursor": "invalid",
        },
    )

    assert response.status_code == 400
    assert response.json()["code"] == "validation_failed"
    app.dependency_overrides.clear()
