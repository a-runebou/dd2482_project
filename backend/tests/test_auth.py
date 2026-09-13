from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from app.infra.db import get_db
from app.infra.models.user import User
from app.main import app
from app.services.auth import CreatedSession, InvalidMagicLink

client = TestClient(app)


def override_get_db():
    yield MagicMock()


def test_request_magic_link_returns_202(monkeypatch) -> None:
    app.dependency_overrides[get_db] = override_get_db

    mock_request = MagicMock()

    monkeypatch.setattr(
        "app.api.auth.request_magic_link",
        mock_request,
    )

    response = client.post(
        "/api/v1/auth/magic-link",
        json={
            "email": "alex@example.com",
            "redirect_path": "/groups",
        },
    )

    assert response.status_code == 202
    mock_request.assert_called_once()

    app.dependency_overrides.clear()


def test_request_magic_link_rejects_invalid_email() -> None:
    response = client.post(
        "/api/v1/auth/magic-link",
        json={"email": "not-an-email"},
    )

    assert response.status_code in {400, 422}


def test_create_session(monkeypatch) -> None:
    app.dependency_overrides[get_db] = override_get_db

    user = User(
        id=uuid4(),
        email="alex@example.com",
        display_name="Alex",
        timezone="Europe/Stockholm",
        created_at=datetime.now(UTC),
    )

    monkeypatch.setattr(
        "app.api.auth.create_session",
        lambda db, token: CreatedSession(
            access_token="access-token",
            refresh_token="refresh-token",
            user=user,
        ),
    )

    response = client.post(
        "/api/v1/auth/session",
        json={"token": "x" * 32},
    )

    assert response.status_code == 200
    assert response.json()["access_token"] == "access-token"
    assert response.json()["token_type"] == "Bearer"
    assert response.json()["user"]["email"] == "alex@example.com"

    assert "refresh_token=" in response.headers["set-cookie"]
    assert "HttpOnly" in response.headers["set-cookie"]

    app.dependency_overrides.clear()


def test_create_session_rejects_invalid_magic_link(monkeypatch) -> None:
    app.dependency_overrides[get_db] = override_get_db

    def fail(db, token):
        raise InvalidMagicLink

    monkeypatch.setattr(
        "app.api.auth.create_session",
        fail,
    )

    response = client.post(
        "/api/v1/auth/session",
        json={"token": "x" * 32},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"

    app.dependency_overrides.clear()


def test_refresh_without_cookie_returns_401() -> None:
    response = client.post("/api/v1/auth/refresh")

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


def test_logout_returns_204(monkeypatch) -> None:
    app.dependency_overrides[get_db] = override_get_db

    mock_logout = MagicMock()

    monkeypatch.setattr(
        "app.api.auth.logout_session",
        mock_logout,
    )

    response = client.delete(
        "/api/v1/auth/session",
        cookies={"refresh_token": "test-token"},
    )

    assert response.status_code == 204

    app.dependency_overrides.clear()
