from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.infra.db import get_db
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


def test_get_me() -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user

    response = client.get("/api/v1/me")

    assert response.status_code == 200
    assert response.json()["email"] == "alex@example.com"
    assert response.json()["display_name"] == "Alex"

    app.dependency_overrides.clear()


def test_get_me_without_token_returns_401() -> None:
    response = client.get("/api/v1/me")

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


def test_patch_me() -> None:
    user = make_user()
    db = MagicMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db

    response = client.patch(
        "/api/v1/me",
        json={
            "display_name": "Alexander",
            "timezone": "Europe/Stockholm",
            "notify_email_default": False,
        },
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "Alexander"
    assert response.json()["notify_email_default"] is False

    app.dependency_overrides.clear()
