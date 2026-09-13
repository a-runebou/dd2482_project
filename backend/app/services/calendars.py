from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse
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
from app.infra.models.job import Job
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


def _validate_calendar_url(url: str) -> str:
    parsed = urlparse(url)

    if parsed.scheme not in {
        "http",
        "https",
        "webcal",
    }:
        raise ValueError(
            "Calendar URL must use http, https or webcal"
        )

    if not parsed.hostname:
        raise ValueError(
            "Calendar URL must contain a hostname"
        )

    return url


def list_calendar_sources(
    db: Session,
    *,
    user_id: UUID,
) -> list[CalendarSource]:
    return list(
        db.scalars(
            select(CalendarSource)
            .where(
                CalendarSource.user_id == user_id
            )
            .order_by(CalendarSource.created_at)
        ).all()
    )


def create_calendar_source(
    db: Session,
    *,
    user: User,
    url: str,
    label: str | None,
) -> CalendarSource:
    _ensure_source_limit(
        db,
        user_id=user.id,
    )

    url = _validate_calendar_url(url)

    now = datetime.now(UTC)

    source = CalendarSource(
        id=new_uuid(),
        user_id=user.id,
        kind=CalendarSourceKind.URL,
        url=url,
        label=label,
        status=CalendarSourceStatus.PENDING,
        last_polled_at=None,
        last_error_code=None,
        etag=None,
        event_count=0,
        created_at=now,
    )

    db.add(source)
    db.flush()

    db.add(
        Job(
            id=new_uuid(),
            kind="ics_poll",
            payload={
                "source_id": str(source.id)
            },
            run_after=now,
            attempts=0,
            dedupe_key=f"ics_poll:{source.id}",
            locked_at=None,
            completed_at=None,
            last_error=None,
        )
    )

    db.commit()
    db.refresh(source)

    return source


def get_owned_source(
    db: Session,
    *,
    source_id: UUID,
    user_id: UUID,
) -> CalendarSource:
    source = db.scalar(
        select(CalendarSource).where(
            CalendarSource.id == source_id,
            CalendarSource.user_id == user_id,
        )
    )

    if source is None:
        raise CalendarSourceNotFound

    return source


def delete_calendar_source(
    db: Session,
    *,
    source_id: UUID,
    user_id: UUID,
) -> None:
    source = get_owned_source(
        db,
        source_id=source_id,
        user_id=user_id,
    )

    db.delete(source)
    db.commit()


def refresh_calendar_source(
    db: Session,
    *,
    source_id: UUID,
    user_id: UUID,
) -> CalendarSource:
    settings = get_settings()

    source = get_owned_source(
        db,
        source_id=source_id,
        user_id=user_id,
    )

    if source.kind != CalendarSourceKind.URL:
        raise CalendarSourceNotFound

    now = datetime.now(UTC)

    if (
        source.last_polled_at is not None
        and (
            now - source.last_polled_at
        ).total_seconds()
        < settings.manual_refresh_cooldown_seconds
    ):
        raise RuntimeError("rate_limited")

    existing = db.scalar(
        select(Job).where(
            Job.dedupe_key
            == f"ics_poll:{source.id}",
            Job.completed_at.is_(None),
        )
    )

    if existing is None:
        db.add(
            Job(
                id=new_uuid(),
                kind="ics_poll",
                payload={
                    "source_id": str(source.id)
                },
                run_after=now,
                attempts=0,
                dedupe_key=(
                    f"ics_poll:{source.id}"
                ),
                locked_at=None,
                completed_at=None,
                last_error=None,
            )
        )

    source.status = CalendarSourceStatus.PENDING

    db.commit()
    db.refresh(source)

    return source


def get_busy_blocks(
    db: Session,
    *,
    user_id: UUID,
    start_at: datetime,
    end_at: datetime,
) -> list[BusyBlock]:
    if end_at <= start_at:
        raise ValueError(
            "to must be after from"
        )

    return list(
        db.scalars(
            select(BusyBlock)
            .where(
                BusyBlock.user_id == user_id,
                BusyBlock.end_at > start_at,
                BusyBlock.start_at < end_at,
            )
            .order_by(BusyBlock.start_at)
        ).all()
    )