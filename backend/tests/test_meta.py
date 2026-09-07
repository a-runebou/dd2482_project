from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_events_returns_202() -> None:
    response = client.post(
        "/api/v1/events",
        json={
            "events": [
                {
                    "name": "group_opened",
                    "occurred_at": ("2026-10-05T08:00:00Z"),
                    "properties": {"source": "dashboard"},
                }
            ]
        },
    )

    assert response.status_code == 202


def test_events_validates_payload() -> None:
    response = client.post(
        "/api/v1/events",
        json={"events": [{"name": "missing_timestamp"}]},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "validation_failed"


def test_flags_returns_empty_map() -> None:
    response = client.get("/api/v1/flags")

    assert response.status_code == 200
    assert response.json() == {
        "flags": {},
    }
