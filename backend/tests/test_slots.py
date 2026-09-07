from datetime import UTC, date, datetime

import pytest

from app.domain.slots import (
    SlotValidationError,
    generate_slots,
    normalise_and_validate_slots,
)


def test_generate_full_normal_day() -> None:
    slots = generate_slots(
        timezone_name="Europe/Stockholm",
        date_start=date(2026, 10, 24),
        date_end=date(2026, 10, 24),
        window_start_minute=0,
        window_end_minute=1440,
    )

    assert len(slots) == 48


def test_generate_slots_across_dst_fallback() -> None:
    slots = generate_slots(
        timezone_name="Europe/Stockholm",
        date_start=date(2026, 10, 25),
        date_end=date(2026, 10, 25),
        window_start_minute=0,
        window_end_minute=1440,
    )

    assert len(slots) == 50
    assert slots == sorted(slots)


def test_reject_slot_outside_window() -> None:
    with pytest.raises(
        SlotValidationError,
        match="outside the group window",
    ):
        normalise_and_validate_slots(
            [
                datetime(
                    2026,
                    10,
                    20,
                    5,
                    0,
                    tzinfo=UTC,
                )
            ],
            timezone_name="Europe/Stockholm",
            date_start=date(2026, 10, 20),
            date_end=date(2026, 10, 20),
            window_start_minute=8 * 60,
            window_end_minute=17 * 60,
        )


def test_reject_misaligned_slot() -> None:
    with pytest.raises(SlotValidationError):
        normalise_and_validate_slots(
            [
                datetime(
                    2026,
                    10,
                    20,
                    8,
                    15,
                    tzinfo=UTC,
                )
            ],
            timezone_name="UTC",
            date_start=date(2026, 10, 20),
            date_end=date(2026, 10, 20),
            window_start_minute=8 * 60,
            window_end_minute=17 * 60,
        )
