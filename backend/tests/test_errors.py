from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_unknown_route_returns_problem_json() -> None:
    response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"

    body = response.json()

    assert body["status"] == 404
    assert body["code"] == "not_found"
    assert body["type"] == "about:blank"


def test_request_validation_returns_problem_json() -> None:
    response = client.post(
        "/api/v1/auth/session",
        json={
            "token": "short",
        },
    )

    assert response.status_code == 400

    body = response.json()

    assert body["code"] == "validation_failed"
    assert "errors" in body
