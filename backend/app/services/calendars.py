from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.auth import new_uuid
from app.domain.ics import (
    parse_ics,
)
from app.infra.models.calendar import (
    BusyBlock,
    CalendarSource,
    CalendarSourceKind,
    CalendarSourceStatus,
)
from app.infra.models.group import (
    Group,
    Membership,
)
from app.infra.models.user import User


class CalendarSourceNotFound(Exception):
    pass


class CalendarSourceLimitReached(Exception):
    pass


def calendar_horizon(
    db: Session,
    *,
    user_id: UUID,
) -> tuple[datetime, datetime]:
    groups = db.scalars(
        select(Group)
        .join(
            Membership,
            Membership.group_id == Group.id,
        )
        .where(Membership.user_id == user_id)
    ).all()

    now = datetime.now(UTC)

    if not groups:
        return now, now + timedelta(days=90)

    start_date = min(
        group.date_start
        for group in groups
    )

    end_date = max(
        group.date_end
        for group in groups
    )

    start = datetime.combine(
        start_date,
        datetime.min.time(),
        tzinfo=UTC,
    )

    end = datetime.combine(
        end_date,
        datetime.min.time(),
        tzinfo=UTC,
    ) + timedelta(days=91)

    return start, end


def _ensure_source_limit(
    db: Session,
    *,
    user_id: UUID,
) -> None:
    settings = get_settings()

    count = db.scalar(
        select(func.count())
        .select_from(CalendarSource)
        .where(CalendarSource.user_id == user_id)
    )

    if int(count or 0) >= settings.max_calendar_sources:
        raise CalendarSourceLimitReached


def upload_calendar(
    db: Session,
    *,
    user: User,
    content: bytes,
    filename: str | None,
) -> CalendarSource:
    settings = get_settings()

    _ensure_source_limit(
        db,
        user_id=user.id,
    )

    horizon_start, horizon_end = calendar_horizon(
        db,
        user_id=user.id,
    )

    blocks = parse_ics(
        content,
        max_bytes=settings.max_ics_bytes,
        max_events=settings.max_ics_events,
        horizon_start=horizon_start,
        horizon_end=horizon_end,
    )

    now = datetime.now(UTC)

    source = CalendarSource(
        id=new_uuid(),
        user_id=user.id,
        kind=CalendarSourceKind.UPLOAD,
        url=None,
        label=(
            filename[:64]
            if filename
            else None
        ),
        status=CalendarSourceStatus.OK,
        last_polled_at=now,
        last_error_code=None,
        etag=None,
        event_count=len(blocks),
        created_at=now,
    )

    db.add(source)
    db.flush()

    for block in blocks:
        db.add(
            BusyBlock(
                id=new_uuid(),
                user_id=user.id,
                source_id=source.id,
                start_at=block.start_at,
                end_at=block.end_at,
                uid=block.uid,
            )
        )

    db.commit()
    db.refresh(source)

    return source