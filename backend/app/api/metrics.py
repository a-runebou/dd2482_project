from fastapi import APIRouter, Response

from app.infra.db import circuit_breaker

router = APIRouter()


@router.get(
    "/metrics",
    include_in_schema=False,
)
def metrics() -> Response:
    body = "\n".join(
        [
            ("# HELP schedular_circuit_state Database circuit state."),
            ("# TYPE schedular_circuit_state gauge"),
            (f"schedular_circuit_state {circuit_breaker.state_metric}"),
            ("# HELP schedular_circuit_transitions_total Circuit state transitions."),
            ("# TYPE schedular_circuit_transitions_total counter"),
            (f"schedular_circuit_transitions_total {circuit_breaker.transition_count}"),
            ("# HELP schedular_db_failures_total Database failures observed."),
            ("# TYPE schedular_db_failures_total counter"),
            (f"schedular_db_failures_total {circuit_breaker.db_failure_count}"),
            "",
        ]
    )

    return Response(
        content=body,
        media_type=("text/plain; version=0.0.4"),
    )
