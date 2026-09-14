from datetime import UTC, date, datetime
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.infra.db import get_db
from app.infra.models.group import (
    Group,
    GroupState,
)
from app.infra.models.scheduling import (
    Proposal,
    ProposalOrigin,
)
from app.infra.models.user import User
from app.main import app
from app.services.export import ConfirmedEvent

client = TestClient(app)


def make_user() -> User:
    return User(
        id=uuid4(),
        email="alex@example.com",
        display_name="Alex",
        timezone="Europe/Stockholm",
        notify_email_default=True,
        created_at=datetime.now(
            UTC
        ),
    )


def make_confirmed_event(
    user: User,
) -> ConfirmedEvent:
    proposal_id = uuid4()

    group = Group(
        id=uuid4(),
        slug="7fQ2mXk9Lp3R",
        name="Project meeting",
        description="Discuss the project",
        owner_id=user.id,
        timezone="Europe/Stockholm",
        date_start=date(
            2026,
            10,
            1,
        ),
        date_end=date(
            2026,
            10,
            7,
        ),
        window_start_minute=480,
        window_end_minute=1020,
        slot_minutes=30,
        state=GroupState.CONFIRMED,
        confirmed_proposal_id=proposal_id,
        invite_token_hash="invite",
        feed_token_hash="feed",
        version=1,
        created_at=datetime.now(
            UTC
        ),
        updated_at=datetime.now(
            UTC
        ),
    )

    proposal = Proposal(
        id=proposal_id,
        group_id=group.id,
        start_at=datetime(
            2026,
            10,
            5,
            8,
            0,
            tzinfo=UTC,
        ),
        end_at=datetime(
            2026,
            10,
            5,
            9,
            0,
            tzinfo=UTC,
        ),
        origin=ProposalOrigin.MANUAL,
        created_by=user.id,
        created_at=datetime.now(
            UTC
        ),
    )

    return ConfirmedEvent(
        group=group,
        proposal=proposal,
    )


def override_db():
    yield MagicMock()


def test_event_ics(monkeypatch) -> None:
    user = make_user()
    event = make_confirmed_event(user)

    app.dependency_overrides[
        get_current_user
    ] = lambda: user

    app.dependency_overrides[
        get_db
    ] = override_db

    monkeypatch.setattr(
        "app.api.export.get_confirmed_event",
        lambda *args, **kwargs: event,
    )

    response = client.get(
        "/api/v1/groups/"
        "7fQ2mXk9Lp3R/event.ics"
    )

    assert response.status_code == 200
    assert response.headers[
        "content-type"
    ].startswith("text/calendar")

    assert "BEGIN:VCALENDAR" in response.text
    assert "BEGIN:VEVENT" in response.text
    assert "Project meeting" in response.text

    app.dependency_overrides.clear()


def test_event_ics_requires_auth() -> None:
    response = client.get(
        "/api/v1/groups/"
        "7fQ2mXk9Lp3R/event.ics"
    )

    assert response.status_code == 401


def test_calendar_feed_does_not_require_bearer(
    monkeypatch,
) -> None:
    user = make_user()
    event = make_confirmed_event(user)

    app.dependency_overrides[
        get_db
    ] = override_db

    monkeypatch.setattr(
        "app.api.export.get_feed_event",
        lambda *args, **kwargs: event,
    )

    response = client.get(
        "/api/v1/groups/"
        "7fQ2mXk9Lp3R/feed.ics",
        params={
            "token": "x" * 32,
        },
    )

    assert response.status_code == 200
    assert "BEGIN:VCALENDAR" in response.text

    app.dependency_overrides.clear()


def test_calendar_feed_requires_token() -> None:
    response = client.get(
        "/api/v1/groups/"
        "7fQ2mXk9Lp3R/feed.ics"
    )

    assert response.status_code == 400