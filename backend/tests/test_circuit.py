import pytest

from app.infra.circuit import (
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
)


class FakeClock:
    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value

    def advance(
        self,
        seconds: float,
    ) -> None:
        self.value += seconds


def test_five_failures_open_circuit() -> None:
    clock = FakeClock()

    breaker = CircuitBreaker(
        clock=clock
    )

    for _ in range(5):
        breaker.record_failure()

    assert breaker.state == CircuitState.OPEN


def test_open_circuit_rejects_calls() -> None:
    breaker = CircuitBreaker()

    for _ in range(5):
        breaker.record_failure()

    with pytest.raises(CircuitOpenError):
        breaker.before_call()


def test_circuit_recovers_after_two_probes() -> None:
    clock = FakeClock()

    breaker = CircuitBreaker(
        clock=clock
    )

    for _ in range(5):
        breaker.record_failure()

    clock.advance(31)

    breaker.before_call()

    assert (
        breaker.state
        == CircuitState.HALF_OPEN
    )

    breaker.record_success()

    breaker.before_call()
    breaker.record_success()

    assert (
        breaker.state
        == CircuitState.CLOSED
    )


def test_half_open_failure_reopens_circuit() -> None:
    clock = FakeClock()

    breaker = CircuitBreaker(
        clock=clock
    )

    for _ in range(5):
        breaker.record_failure()

    clock.advance(31)

    breaker.before_call()
    breaker.record_failure()

    assert breaker.state == CircuitState.OPEN