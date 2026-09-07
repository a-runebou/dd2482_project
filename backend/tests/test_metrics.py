from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_metrics_endpoint() -> None:
    response = client.get("/metrics")

    assert response.status_code == 200

    body = response.text

    assert "schedular_circuit_state" in body
    assert "schedular_circuit_transitions_total" in body
    assert "schedular_db_failures_total" in body
