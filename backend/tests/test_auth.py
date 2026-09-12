from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.infra.db import get_db
from app.main import app

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