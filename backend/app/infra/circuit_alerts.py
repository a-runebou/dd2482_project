import threading
import time

from app.config import get_settings
from app.infra.circuit import CircuitState
from app.infra.mail import send_email

_ALERT_COOLDOWN_SECONDS = 15 * 60

_lock = threading.Lock()
_last_alert_at: float | None = None


def send_circuit_transition_alert(
    old_state: CircuitState,
    new_state: CircuitState,
) -> None:
    if not (
        (
            old_state == CircuitState.CLOSED
            and new_state
            == CircuitState.OPEN
        )
        or (
            old_state
            == CircuitState.HALF_OPEN
            and new_state
            == CircuitState.CLOSED
        )
    ):
        return

    settings = get_settings()

    if settings.ops_alert_email is None:
        return

    now = time.monotonic()

    global _last_alert_at

    with _lock:
        if (
            _last_alert_at is not None
            and now - _last_alert_at
            < _ALERT_COOLDOWN_SECONDS
        ):
            return

        _last_alert_at = now

    send_email(
        to=settings.ops_alert_email,
        subject=(
            "Schedular database circuit "
            f"{new_state.value}"
        ),
        text=(
            "The PostgreSQL circuit breaker "
            f"changed from {old_state.value} "
            f"to {new_state.value}."
        ),
    )