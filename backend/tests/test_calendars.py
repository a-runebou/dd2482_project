from datetime import UTC, datetime
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
        last_polled_at=datetime.now(
            UTC
        ),
        last_error_code=None,
        etag=None,
        event_count=1,
        created_at=datetime.now(
            UTC
        ),
    )


def override_db():
    yield MagicMock()


def test_upload_calendar(monkeypatch) -> None:
    user = make_user()
    source = make_source()

    app.dependency_overrides[
        get_current_user
    ] = lambda: user

    app.dependency_overrides[
        get_db
    ] = override_db

    monkeypatch.setattr(
        "app.api.me.upload_calendar",
        lambda *args, **kwargs: source,
    )

    response = client.post(
        "/api/v1/me/calendar-sources/upload",
        files={
            "file": (
                "schedule.ics",
                (
                    b"BEGIN:VCALENDAR\r\n"
                    b"END:VCALENDAR\r\n"
                ),
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
                (
                    b"BEGIN:VCALENDAR\r\n"
                    b"END:VCALENDAR\r\n"
                ),
                "text/calendar",
            )
        },
    )

    assert response.status_code == 401