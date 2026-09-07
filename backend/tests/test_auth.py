from datetime import UTC, datetime, timedelta
from unittest.mock import ANY, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.infra.db import get_db
from app.infra.models.user import RefreshToken, User
from app.main import app
from app.services.auth import (
    CreatedSession,
    InvalidMagicLink,
    InvalidRefreshToken,
    hash_token,
    refresh_session,
)

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
    mock_request.assert_called_once_with(
        db=ANY,
        email="alex@example.com",
        redirect_path="/groups",
    )

    app.dependency_overrides.clear()


def test_request_magic_link_rejects_invalid_email() -> None:
    response = client.post(
        "/api/v1/auth/magic-link",
        json={"email": "not-an-email"},
    )

    assert response.status_code in {400, 422}


def test_request_magic_link_rejects_invalid_redirect_path() -> None:
    response = client.post(
        "/api/v1/auth/magic-link",
        json={
            "email": "alex@example.com",
            "redirect_path": "https://evil.example",
        },
    )

    assert response.status_code == 400
    assert response.json()["code"] == "validation_failed"


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


def test_logout_without_cookie_returns_401() -> None:
    app.dependency_overrides[get_db] = override_get_db

    response = client.delete("/api/v1/auth/session")

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"

    app.dependency_overrides.clear()


def test_logout_with_unknown_cookie_returns_401(monkeypatch) -> None:
    app.dependency_overrides[get_db] = override_get_db

    def fail(*args, **kwargs):
        raise InvalidRefreshToken

    monkeypatch.setattr("app.api.auth.logout_session", fail)

    response = client.delete(
        "/api/v1/auth/session",
        cookies={"refresh_token": "unknown-token"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"

    app.dependency_overrides.clear()


class FakeResult:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class RefreshDatabase:
    def __init__(self, stored_token, family_tokens, user):
        self.stored_token = stored_token
        self.family_tokens = family_tokens
        self.user = user
        self.added = []
        self.commit_count = 0
        self.execute_count = 0

    def scalar(self, statement):
        del statement
        return self.stored_token

    def scalars(self, statement):
        del statement
        return FakeResult(self.family_tokens)

    def get(self, model, identifier):
        del model, identifier
        return self.user

    def add(self, value):
        self.added.append(value)
        self.family_tokens.append(value)

    def execute(self, statement):
        del statement
        self.execute_count += 1
        revoked_at = datetime.now(UTC)
        for token in self.family_tokens:
            token.revoked_at = revoked_at

    def commit(self):
        self.commit_count += 1


def make_refresh_token(
    *,
    raw_token: str,
    family_id,
    user_id,
    expires_at: datetime,
    revoked_at: datetime | None,
) -> RefreshToken:
    return RefreshToken(
        id=uuid4(),
        user_id=user_id,
        token_hash=hash_token(raw_token),
        family_id=family_id,
        expires_at=expires_at,
        revoked_at=revoked_at,
    )


def freeze_auth_time(monkeypatch, now: datetime) -> None:
    class FrozenDateTime:
        @classmethod
        def now(cls, tz):
            del tz
            return now

    monkeypatch.setattr("app.services.auth.datetime", FrozenDateTime)


def test_refresh_rotates_token(monkeypatch) -> None:
    now = datetime(2026, 9, 16, 12, tzinfo=UTC)
    user = User(
        id=uuid4(),
        email="alex@example.com",
        display_name="Alex",
        timezone="UTC",
        created_at=now,
    )
    family_id = uuid4()
    stored_token = make_refresh_token(
        raw_token="old-token",
        family_id=family_id,
        user_id=user.id,
        expires_at=now + timedelta(days=1),
        revoked_at=None,
    )
    database = RefreshDatabase(stored_token, [stored_token], user)
    freeze_auth_time(monkeypatch, now)

    session = refresh_session(database, "old-token")

    assert session.refresh_token != "old-token"
    assert stored_token.revoked_at == now
    assert len(database.added) == 1
    assert database.added[0].revoked_at is None
    assert database.added[0].family_id == family_id
    assert database.commit_count == 1


def test_refresh_reuse_of_previous_token_within_grace_does_not_revoke_family(
    monkeypatch,
) -> None:
    now = datetime(2026, 9, 16, 12, 0, 30, tzinfo=UTC)
    user = User(id=uuid4(), email="alex@example.com", timezone="UTC")
    family_id = uuid4()
    previous_token = make_refresh_token(
        raw_token="previous-token",
        family_id=family_id,
        user_id=user.id,
        expires_at=now + timedelta(days=1),
        revoked_at=now.replace(second=0),
    )
    current_token = make_refresh_token(
        raw_token="current-token",
        family_id=family_id,
        user_id=user.id,
        expires_at=now + timedelta(days=1),
        revoked_at=None,
    )
    database = RefreshDatabase(
        previous_token,
        [previous_token, current_token],
        user,
    )
    freeze_auth_time(monkeypatch, now)

    with pytest.raises(InvalidRefreshToken):
        refresh_session(database, "previous-token")

    assert database.execute_count == 0
    assert database.commit_count == 0
    assert current_token.revoked_at is None


def test_refresh_reuse_of_previous_token_after_grace_revokes_family(
    monkeypatch,
) -> None:
    now = datetime(2026, 9, 16, 12, 0, 31, tzinfo=UTC)
    user = User(id=uuid4(), email="alex@example.com", timezone="UTC")
    family_id = uuid4()
    previous_token = make_refresh_token(
        raw_token="previous-token",
        family_id=family_id,
        user_id=user.id,
        expires_at=now + timedelta(days=1),
        revoked_at=now.replace(second=0),
    )
    current_token = make_refresh_token(
        raw_token="current-token",
        family_id=family_id,
        user_id=user.id,
        expires_at=now + timedelta(days=1),
        revoked_at=None,
    )
    database = RefreshDatabase(
        previous_token,
        [previous_token, current_token],
        user,
    )
    freeze_auth_time(monkeypatch, now)

    with pytest.raises(InvalidRefreshToken):
        refresh_session(database, "previous-token")

    assert database.execute_count == 1
    assert database.commit_count == 1
    assert all(token.revoked_at is not None for token in database.family_tokens)


def test_refresh_reuse_of_older_token_revokes_family(monkeypatch) -> None:
    now = datetime(2026, 9, 16, 12, 0, 10, tzinfo=UTC)
    user = User(id=uuid4(), email="alex@example.com", timezone="UTC")
    family_id = uuid4()
    older_token = make_refresh_token(
        raw_token="older-token",
        family_id=family_id,
        user_id=user.id,
        expires_at=now + timedelta(days=1),
        revoked_at=now.replace(second=0),
    )
    previous_token = make_refresh_token(
        raw_token="previous-token",
        family_id=family_id,
        user_id=user.id,
        expires_at=now + timedelta(days=1),
        revoked_at=now.replace(second=5),
    )
    current_token = make_refresh_token(
        raw_token="current-token",
        family_id=family_id,
        user_id=user.id,
        expires_at=now + timedelta(days=1),
        revoked_at=None,
    )
    database = RefreshDatabase(
        older_token,
        [older_token, previous_token, current_token],
        user,
    )
    freeze_auth_time(monkeypatch, now)

    with pytest.raises(InvalidRefreshToken):
        refresh_session(database, "older-token")

    assert database.execute_count == 1
    assert database.commit_count == 1
    assert all(token.revoked_at is not None for token in database.family_tokens)
