import pytest

from app.infra.ics_fetch import (
    IcsFetchError,
    _validate_host,
)


def test_reject_localhost_calendar_url() -> None:
    with pytest.raises(IcsFetchError):
        _validate_host(
            "http://127.0.0.1/calendar.ics"
        )