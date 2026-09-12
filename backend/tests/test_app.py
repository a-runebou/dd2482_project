from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.main import app

client = TestClient(app)

def test_healthz() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_readyz_when_database_is_available() -> None:
    mock_connection = MagicMock()

    with patch("app.main.engine.connect") as mock_connect:
        mock_connect.return_value.__enter__.return_value = mock_connection

        response = client.get("/readyz")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}

def test_readyz_when_database_is_unavailable() -> None:
    with patch(
        "app.main.engine.connect",
        side_effect=SQLAlchemyError("database unavailable"),
    ):
        response = client.get("/readyz")

    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}

def test_config() -> None:
    response = client.get("/api/v1/config")

    assert response.status_code == 200

    data = response.json()

    assert data["slot_minutes"] == 30
    assert data["max_range_days"] == 31
    assert data["max_members"] == 50
    assert data["max_groups_per_user"] == 20
    assert data["max_proposals_per_group"] == 20
    assert data["max_calendar_sources"] == 5
    assert data["min_duration_minutes"] == 30
    assert data["max_duration_minutes"] == 480

