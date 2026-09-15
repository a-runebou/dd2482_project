from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
client_without_exception_propagation = TestClient(
    app,
    raise_server_exceptions=False,
)


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


def test_nested_request_validation_uses_dotted_field_paths() -> None:
    response = client.post(
        "/api/v1/events",
        json={
            "events": [
                {
                    "occurred_at": "2026-09-15T12:00:00Z",
                },
            ],
        },
    )

    assert response.status_code == 400
    assert response.headers["content-type"] == "application/problem+json"

    body = response.json()

    assert body["type"] == "about:blank"
    assert body["title"] == "Validation failed"
    assert body["status"] == 400
    assert body["code"] == "validation_failed"
    assert {
        "field": "events.0.name",
        "message": "Field required",
    } in body["errors"]


def test_unsupported_method_returns_problem_json() -> None:
    response = client.post("/healthz")

    assert response.status_code == 405
    assert response.headers["content-type"] == "application/problem+json"

    body = response.json()

    assert body["type"] == "about:blank"
    assert body["title"] == "Method not allowed"
    assert body["status"] == 405
    assert body["code"] == "validation_failed"


def test_unhandled_exception_returns_generic_problem_json() -> None:
    path = "/__test_unhandled_error"

    def raise_unhandled_exception() -> None:
        raise RuntimeError("secret implementation detail")

    app.add_api_route(path, raise_unhandled_exception, methods=["GET"])

    try:
        response = client_without_exception_propagation.get(path)
    finally:
        app.router.routes[:] = [
            route
            for route in app.router.routes
            if getattr(route, "path", None) != path
        ]

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/problem+json"

    body = response.json()

    assert body["type"] == "about:blank"
    assert body["title"] == "Internal server error"
    assert body["status"] == 500
    assert body["code"] == "internal_error"
    assert "secret implementation detail" not in response.text
