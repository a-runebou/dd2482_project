from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from dateutil.rrule import rrulestr
from icalendar import Calendar, Event


class IcsParseError(ValueError):
    pass


@dataclass(frozen=True)
class ParsedBusyBlock:
    start_at: datetime
    end_at: datetime
    uid: str


def _as_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)

        return value.astimezone(UTC)

    if isinstance(value, date):
        return datetime.combine(
            value,
            time.min,
            tzinfo=UTC,
        )

    raise IcsParseError("Unsupported calendar date value")


def parse_ics(
    content: bytes,
    *,
    max_bytes: int,
    max_events: int,
    horizon_start: datetime,
    horizon_end: datetime,
) -> list[ParsedBusyBlock]:
    if len(content) > max_bytes:
        raise IcsParseError("Calendar exceeds maximum size")

    try:
        calendar = Calendar.from_ical(content.decode("utf-8"))
    except Exception as exc:
        raise IcsParseError("Calendar could not be parsed") from exc

    result: list[ParsedBusyBlock] = []

    event_count = 0

    for component in calendar.walk():
        if component.name != "VEVENT":
            continue

        event_count += 1

        if event_count > max_events:
            raise IcsParseError("Calendar contains too many events")

        if "DTSTART" not in component:
            continue

        start = _as_datetime(component.decoded("DTSTART"))

        if "DTEND" in component:
            end = _as_datetime(component.decoded("DTEND"))
        elif "DURATION" in component:
            end = start + component.decoded("DURATION")
        else:
            end = start + timedelta(minutes=30)

        if end <= start:
            continue

        uid_value = component.get("UID")
        uid = str(uid_value) if uid_value is not None else f"event-{event_count}"

        if "RRULE" not in component:
            if end > horizon_start and start < horizon_end:
                result.append(
                    ParsedBusyBlock(
                        start_at=start,
                        end_at=end,
                        uid=uid,
                    )
                )

            continue

        duration = end - start

        rrule_value = component["RRULE"].to_ical().decode("utf-8")

        try:
            recurrence = rrulestr(
                rrule_value,
                dtstart=start,
            )
        except (TypeError, ValueError) as exc:
            raise IcsParseError("Calendar contains an invalid recurrence rule") from exc

        occurrences = recurrence.between(
            horizon_start - duration,
            horizon_end,
            inc=True,
        )

        for occurrence in occurrences:
            occurrence_start = _as_datetime(occurrence)
            occurrence_end = occurrence_start + duration

            if occurrence_end > horizon_start and occurrence_start < horizon_end:
                result.append(
                    ParsedBusyBlock(
                        start_at=occurrence_start,
                        end_at=occurrence_end,
                        uid=uid,
                    )
                )

            if len(result) > max_events:
                raise IcsParseError("Expanded calendar contains too many events")

    result.sort(
        key=lambda block: (
            block.start_at,
            block.end_at,
        )
    )

    return result


def render_event_ics(
    *,
    proposal_id: UUID,
    summary: str,
    description: str | None,
    start_at: datetime,
    end_at: datetime,
    created_at: datetime,
) -> bytes:
    calendar = Calendar()

    calendar.add(
        "prodid",
        "-//Schedular//Schedular Calendar//EN",
    )
    calendar.add("version", "2.0")

    event = Event()

    event.add(
        "uid",
        f"{proposal_id}@schedular",
    )
    event.add(
        "dtstamp",
        created_at.astimezone(UTC),
    )
    event.add(
        "dtstart",
        start_at.astimezone(UTC),
    )
    event.add(
        "dtend",
        end_at.astimezone(UTC),
    )
    event.add("summary", summary)

    if description is not None:
        event.add(
            "description",
            description,
        )

    calendar.add_component(event)

    return calendar.to_ical()
