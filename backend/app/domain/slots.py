from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class SlotValidationError(ValueError):
    def __init__(
        self,
        message: str,
        code: str = "validation_failed",
    ) -> None:
        super().__init__(message)
        self.code = code


def validate_group_window(
    *,
    timezone_name: str,
    date_start: date,
    date_end: date,
    window_start_minute: int,
    window_end_minute: int,
    slot_minutes: int,
    max_range_days: int,
) -> None:
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise SlotValidationError("timezone must be a valid IANA timezone") from exc

    if date_end < date_start:
        raise SlotValidationError("date_end must not be before date_start")

    range_days = (date_end - date_start).days + 1

    if range_days > max_range_days:
        raise SlotValidationError(
            "date range exceeds the configured maximum",
            code="range_too_long",
        )

    if slot_minutes <= 0:
        raise SlotValidationError("slot_minutes must be positive")

    if (
        window_start_minute < 0
        or window_start_minute > 1410
        or window_end_minute < 30
        or window_end_minute > 1440
    ):
        raise SlotValidationError("daily window is outside the valid range")

    if window_start_minute >= window_end_minute:
        raise SlotValidationError(
            "window_start_minute must be before window_end_minute"
        )

    if window_start_minute % slot_minutes != 0 or window_end_minute % slot_minutes != 0:
        raise SlotValidationError("daily window must align to slot_minutes")


def generate_slots(
    *,
    timezone_name: str,
    date_start: date,
    date_end: date,
    window_start_minute: int,
    window_end_minute: int,
    slot_minutes: int = 30,
    max_range_days: int = 31,
) -> list[datetime]:
    validate_group_window(
        timezone_name=timezone_name,
        date_start=date_start,
        date_end=date_end,
        window_start_minute=window_start_minute,
        window_end_minute=window_end_minute,
        slot_minutes=slot_minutes,
        max_range_days=max_range_days,
    )

    tz = ZoneInfo(timezone_name)

    slots: list[datetime] = []

    current_date = date_start

    while current_date <= date_end:
        next_date = current_date + timedelta(days=1)

        day_start_utc = datetime.combine(
            current_date,
            time.min,
            tzinfo=tz,
        ).astimezone(UTC)

        day_end_utc = datetime.combine(
            next_date,
            time.min,
            tzinfo=tz,
        ).astimezone(UTC)

        current = day_start_utc

        while current < day_end_utc:
            local = current.astimezone(tz)

            minute = local.hour * 60 + local.minute

            if (
                local.date() == current_date
                and window_start_minute <= minute < window_end_minute
                and minute % slot_minutes == 0
            ):
                slots.append(current)

            current += timedelta(minutes=slot_minutes)

        current_date = next_date

    return slots


def normalise_and_validate_slots(
    instants: list[datetime],
    *,
    timezone_name: str,
    date_start: date,
    date_end: date,
    window_start_minute: int,
    window_end_minute: int,
    slot_minutes: int = 30,
    max_range_days: int = 31,
) -> list[datetime]:
    valid_slots = set(
        generate_slots(
            timezone_name=timezone_name,
            date_start=date_start,
            date_end=date_end,
            window_start_minute=window_start_minute,
            window_end_minute=window_end_minute,
            slot_minutes=slot_minutes,
            max_range_days=max_range_days,
        )
    )

    result: list[datetime] = []

    for instant in instants:
        if instant.tzinfo is None:
            raise SlotValidationError(
                "slot must include a UTC timezone",
                code="slot_not_in_window",
            )

        if instant.utcoffset() != timedelta(0):
            raise SlotValidationError(
                "slot must be supplied in UTC",
                code="slot_not_in_window",
            )

        normalised = instant.astimezone(UTC)

        if normalised not in valid_slots:
            raise SlotValidationError(
                "slot is outside the group window",
                code="slot_not_in_window",
            )

        result.append(normalised)

    return result
