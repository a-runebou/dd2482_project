from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.auth import new_uuid
from app.domain.ics import IcsParseError, parse_ics
from app.infra.ics_fetch import (
    IcsFetchError,
    fetch_ics,
)
from app.infra.models.calendar import (
    BusyBlock,
    CalendarSource,
    CalendarSourceStatus,
)
from app.infra.models.job import Job
from app.services.calendars import calendar_horizon


def handle_ics_poll(
    db: Session,
    *,
    source_id: UUID,
) -> None:
    settings = get_settings()

    source = db.get(
        CalendarSource,
        source_id,
    )

    if source is None or source.url is None:
        return

    now = datetime.now(UTC)

    try:
        content, etag = fetch_ics(
            source.url,
            max_bytes=settings.max_ics_bytes,
            etag=source.etag,
        )

        if content is None:
            source.status = (
                CalendarSourceStatus.OK
            )
            source.last_polled_at = now
            source.last_error_code = None

            db.commit()
            return

        horizon_start, horizon_end = (
            calendar_horizon(
                db,
                user_id=source.user_id,
            )
        )

        blocks = parse_ics(
            content,
            max_bytes=settings.max_ics_bytes,
            max_events=settings.max_ics_events,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
        )

    except IcsFetchError:
        source.status = (
            CalendarSourceStatus.ERROR
        )
        source.last_polled_at = now
        source.last_error_code = (
            "ics_fetch_failed"
        )

        db.commit()
        raise

    except IcsParseError:
        source.status = (
            CalendarSourceStatus.ERROR
        )
        source.last_polled_at = now
        source.last_error_code = (
            "ics_parse_failed"
        )

        db.commit()
        raise

    db.execute(
        delete(BusyBlock).where(
            BusyBlock.source_id == source.id
        )
    )

    for block in blocks:
        db.add(
            BusyBlock(
                id=new_uuid(),
                user_id=source.user_id,
                source_id=source.id,
                start_at=block.start_at,
                end_at=block.end_at,
                uid=block.uid,
            )
        )

    source.status = CalendarSourceStatus.OK
    source.last_polled_at = now
    source.last_error_code = None
    source.event_count = len(blocks)
    source.etag = etag

    next_poll = Job(
        id=new_uuid(),
        kind="ics_poll",
        payload={
            "source_id": str(source.id)
        },
        run_after=(
            now
            + timedelta(
                hours=settings.ics_poll_interval_hours
            )
        ),
        attempts=0,
        dedupe_key=None,
        locked_at=None,
        completed_at=None,
        last_error=None,
    )

    db.add(next_poll)

    db.commit()