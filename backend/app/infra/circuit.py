import threading
import time
from collections import deque
from collections.abc import Callable
from enum import StrEnum


class CircuitState(StrEnum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(RuntimeError):
    pass


TransitionCallback = Callable[
    [CircuitState, CircuitState],
    None,
]


class CircuitBreaker:
    def __init__(
        self,
        *,
        clock: Callable[[], float] = time.monotonic,
        transition_callback: (
            TransitionCallback | None
        ) = None,
    ) -> None:
        self._clock = clock
        self._transition_callback = (
            transition_callback
        )

        self._lock = threading.Lock()

        self._state = CircuitState.CLOSED

        self._history: deque[
            tuple[float, bool]
        ] = deque(maxlen=20)

        self._consecutive_failures = 0

        self._opened_at: float | None = None

        self._probe_in_flight = False
        self._half_open_successes = 0

        self._transition_count = 0
        self._db_failure_count = 0

    @property
    def state(self) -> CircuitState:
        with self._lock:
            return self._state

    @property
    def transition_count(self) -> int:
        with self._lock:
            return self._transition_count

    @property
    def db_failure_count(self) -> int:
        with self._lock:
            return self._db_failure_count

    @property
    def state_metric(self) -> int:
        state = self.state

        if state == CircuitState.CLOSED:
            return 0

        if state == CircuitState.HALF_OPEN:
            return 1

        return 2

    def before_call(self) -> None:
        callback: (
            tuple[
                TransitionCallback,
                CircuitState,
                CircuitState,
            ]
            | None
        ) = None

        with self._lock:
            now = self._clock()

            if self._state == CircuitState.OPEN:
                assert self._opened_at is not None

                if now - self._opened_at < 30:
                    raise CircuitOpenError

                callback = self._transition_locked(
                    CircuitState.HALF_OPEN
                )

                self._probe_in_flight = False
                self._half_open_successes = 0

            if (
                self._state
                == CircuitState.HALF_OPEN
            ):
                if self._probe_in_flight:
                    raise CircuitOpenError

                self._probe_in_flight = True

        self._run_callback(callback)

    def record_success(self) -> None:
        callback: (
            tuple[
                TransitionCallback,
                CircuitState,
                CircuitState,
            ]
            | None
        ) = None

        with self._lock:
            now = self._clock()

            if (
                self._state
                == CircuitState.HALF_OPEN
            ):
                self._probe_in_flight = False
                self._half_open_successes += 1

                if self._half_open_successes >= 2:
                    self._consecutive_failures = 0
                    self._history.clear()

                    callback = (
                        self._transition_locked(
                            CircuitState.CLOSED
                        )
                    )

            elif self._state == CircuitState.CLOSED:
                self._prune_history_locked(now)

                self._history.append(
                    (now, False)
                )

                self._consecutive_failures = 0

        self._run_callback(callback)

    def record_failure(self) -> None:
        callback: (
            tuple[
                TransitionCallback,
                CircuitState,
                CircuitState,
            ]
            | None
        ) = None

        with self._lock:
            now = self._clock()

            self._db_failure_count += 1

            if (
                self._state
                == CircuitState.HALF_OPEN
            ):
                self._probe_in_flight = False
                callback = self._open_locked(now)

            elif self._state == CircuitState.CLOSED:
                self._prune_history_locked(now)

                self._history.append(
                    (now, True)
                )

                self._consecutive_failures += 1

                failures = sum(
                    1
                    for _, failed in self._history
                    if failed
                )

                too_many_recent_failures = (
                    len(self._history) == 20
                    and failures > 10
                )

                if (
                    self._consecutive_failures
                    >= 5
                    or too_many_recent_failures
                ):
                    callback = self._open_locked(
                        now
                    )

        self._run_callback(callback)

    def _open_locked(
        self,
        now: float,
    ) -> (
        tuple[
            TransitionCallback,
            CircuitState,
            CircuitState,
        ]
        | None
    ):
        self._opened_at = now
        self._probe_in_flight = False
        self._half_open_successes = 0

        return self._transition_locked(
            CircuitState.OPEN
        )

    def _transition_locked(
        self,
        new_state: CircuitState,
    ) -> (
        tuple[
            TransitionCallback,
            CircuitState,
            CircuitState,
        ]
        | None
    ):
        old_state = self._state

        if old_state == new_state:
            return None

        self._state = new_state
        self._transition_count += 1

        if self._transition_callback is None:
            return None

        return (
            self._transition_callback,
            old_state,
            new_state,
        )

    def _prune_history_locked(
        self,
        now: float,
    ) -> None:
        while (
            self._history
            and now - self._history[0][0] > 30
        ):
            self._history.popleft()

    @staticmethod
    def _run_callback(
        callback: (
            tuple[
                TransitionCallback,
                CircuitState,
                CircuitState,
            ]
            | None
        ),
    ) -> None:
        if callback is None:
            return

        function, old_state, new_state = (
            callback
        )

        try:
            function(
                old_state,
                new_state,
            )
        except Exception: # noqa: BLE001
            # Alerting must never break DB access.
            return