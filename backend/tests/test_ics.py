from datetime import UTC, datetime

import pytest

from app.domain.ics import (
    IcsParseError,
    parse_ics,
)

HORIZON_START = datetime(
    2026,
    10,
    1,
    tzinfo=UTC,
)

HORIZON_END = datetime(
    2026,
    11,
    1,
    tzinfo=UTC,
)


def test_parse_single_event() -> None:
    content = b"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-event
DTSTART:20261005T080000Z
DTEND:20261005T100000Z
END:VEVENT
END:VCALENDAR
"""

    blocks = parse_ics(
        content,
        max_bytes=2_097_152,
        max_events=5_000,
        horizon_start=HORIZON_START,
        horizon_end=HORIZON_END,
    )

    assert len(blocks) == 1
    assert blocks[0].uid == "test-event"
    assert blocks[0].start_at == datetime(
        2026,
        10,
        5,
        8,
        0,
        tzinfo=UTC,
    )


def test_parse_recurring_event() -> None:
    content = b"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:recurring
DTSTART:20261005T080000Z
DTEND:20261005T090000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
END:VCALENDAR
"""

    blocks = parse_ics(
        content,
        max_bytes=2_097_152,
        max_events=5_000,
        horizon_start=HORIZON_START,
        horizon_end=HORIZON_END,
    )

    assert len(blocks) == 3


def test_reject_oversized_calendar() -> None:
    with pytest.raises(IcsParseError):
        parse_ics(
            b"x" * 101,
            max_bytes=100,
            max_events=5_000,
            horizon_start=HORIZON_START,
            horizon_end=HORIZON_END,
        )