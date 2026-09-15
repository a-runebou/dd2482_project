from datetime import datetime
from typing import Annotated
from uuid import NAMESPACE_URL, UUID, uuid5
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import (
    APIRouter,
    Depends,
    File,
    Path,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.errors import ProblemException
from app.api.schemas import (
    BusyBlockPageResponse,
    BusyBlockResponse,
    CalendarSourceCreate,
    CalendarSourcePageResponse,
    CalendarSourceResponse,
    UserPatch,
    UserResponse,
)
from app.config import get_settings
from app.domain.ics import IcsParseError
from app.domain.slots import SlotValidationError
from app.infra.db import get_db
from app.infra.models.calendar import BusyBlock, CalendarSource
from app.infra.models.user import User
from app.services.calendars import (
    CalendarSourceLimitReached,
    CalendarSourceNotFound,
    create_calendar_source,
    delete_calendar_source,
    get_busy_blocks,
    list_calendar_sources,
    refresh_calendar_source,
    upload_calendar,
)
from app.services.groups import decode_cursor, encode_cursor

router = APIRouter(prefix="/me", tags=["me"])


def user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name or "User",
        timezone=user.timezone,
        notify_email_default=user.notify_email_default,
        created_at=user.created_at,
    )


@router.get(
    "",
    response_model=UserResponse,
)
def get_me(
    user: User = Depends(get_current_user),
) -> UserResponse:
    return user_response(user)


@router.patch(
    "",
    response_model=UserResponse,
)
def patch_me(
    body: UserPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    if body.timezone is not None:
        try:
            ZoneInfo(body.timezone)
        except ZoneInfoNotFoundError as exc:
            raise ProblemException(
                status_code=400,
                code="validation_failed",
                title="Validation failed",
                detail="timezone must be a valid IANA timezone",
            ) from exc

        user.timezone = body.timezone

    if body.display_name is not None:
        user.display_name = body.display_name

    if body.notify_email_default is not None:
        user.notify_email_default = body.notify_email_default

    db.commit()
    db.refresh(user)

    return user_response(user)


def calendar_source_response(
    source: CalendarSource,
) -> CalendarSourceResponse:
    return CalendarSourceResponse(
        id=source.id,
        kind=source.kind.value,
        url=source.url,
        label=source.label,
        status=source.status.value,
        last_polled_at=source.last_polled_at,
        last_error_code=source.last_error_code,
        event_count=source.event_count,
        created_at=source.created_at,
    )


def _busy_cursor_id(
    start_at: datetime,
    end_at: datetime,
) -> UUID:
    return uuid5(
        NAMESPACE_URL,
        f"busy:{start_at.isoformat()}:{end_at.isoformat()}",
    )


def _merge_busy_blocks(
    blocks: list[BusyBlock],
) -> list[tuple[datetime, datetime]]:
    intervals = sorted(
        ((block.start_at, block.end_at) for block in blocks),
        key=lambda interval: (interval[0], interval[1]),
    )

    merged: list[tuple[datetime, datetime]] = []

    for start_at, end_at in intervals:
        if not merged or start_at > merged[-1][1]:
            merged.append((start_at, end_at))
            continue

        previous_start, previous_end = merged[-1]
        merged[-1] = (previous_start, max(previous_end, end_at))

    return merged


@router.post(
    "/calendar-sources/upload",
    response_model=CalendarSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_calendar_upload(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarSourceResponse:
    settings = get_settings()

    content = await file.read(settings.max_ics_bytes + 1)

    if len(content) > settings.max_ics_bytes:
        raise ProblemException(
            status_code=413,
            code="validation_failed",
            title="Calendar file too large",
        )

    try:
        source = upload_calendar(
            db,
            user=user,
            content=content,
            filename=file.filename,
        )
    except IcsParseError as exc:
        raise ProblemException(
            status_code=422,
            code="ics_parse_failed",
            title="Calendar could not be parsed",
            detail=str(exc),
        ) from exc
    except CalendarSourceLimitReached as exc:
        raise ProblemException(
            status_code=409,
            code="calendar_source_limit_reached",
            title="Calendar source limit reached",
        ) from exc

    return calendar_source_response(source)


@router.get(
    "/calendar-sources",
    response_model=CalendarSourcePageResponse,
)
def get_calendar_sources(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarSourcePageResponse:
    sources = list_calendar_sources(
        db,
        user_id=user.id,
    )

    return CalendarSourcePageResponse(
        data=[calendar_source_response(source) for source in sources],
        next_cursor=None,
    )


@router.post(
    "/calendar-sources",
    response_model=CalendarSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_calendar_source(
    body: CalendarSourceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarSourceResponse:
    try:
        source = create_calendar_source(
            db,
            user=user,
            url=body.url,
            label=body.label,
        )
    except ValueError as exc:
        raise ProblemException(
            status_code=400,
            code="validation_failed",
            title="Invalid calendar URL",
            detail=str(exc),
        ) from exc
    except CalendarSourceLimitReached as exc:
        raise ProblemException(
            status_code=409,
            code="calendar_source_limit_reached",
            title="Calendar source limit reached",
        ) from exc

    return calendar_source_response(source)


@router.delete(
    "/calendar-sources/{sourceId}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_calendar_source(
    source_id: Annotated[UUID, Path(alias="sourceId")],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    try:
        delete_calendar_source(
            db,
            source_id=source_id,
            user_id=user.id,
        )
    except CalendarSourceNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="not_found",
            title="Calendar source not found",
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/calendar-sources/{sourceId}/refresh",
    response_model=CalendarSourceResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def post_calendar_refresh(
    source_id: Annotated[UUID, Path(alias="sourceId")],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarSourceResponse:
    try:
        source = refresh_calendar_source(
            db,
            source_id=source_id,
            user_id=user.id,
        )
    except CalendarSourceNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="not_found",
            title="Calendar source not found",
        ) from exc
    except RuntimeError as exc:
        raise ProblemException(
            status_code=429,
            code="rate_limited",
            title="Refresh rate limited",
            headers={
                "Retry-After": str(
                    get_settings().manual_refresh_cooldown_seconds
                ),
            },
        ) from exc

    return calendar_source_response(source)


@router.get(
    "/busy",
    response_model=BusyBlockPageResponse,
)
def get_busy(
    to: datetime,
    from_: datetime = Query(alias="from"),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BusyBlockPageResponse:
    try:
        blocks = get_busy_blocks(
            db,
            user_id=user.id,
            start_at=from_,
            end_at=to,
        )
    except ValueError as exc:
        raise ProblemException(
            status_code=400,
            code="validation_failed",
            title="Invalid busy window",
            detail=str(exc),
        ) from exc

    merged = _merge_busy_blocks(blocks)
    start_index = 0

    if cursor is not None:
        try:
            cursor_id = decode_cursor(cursor)
        except SlotValidationError as exc:
            raise ProblemException(
                status_code=400,
                code="validation_failed",
                title="Invalid cursor",
                detail="cursor is invalid",
            ) from exc

        for index, (start_at, end_at) in enumerate(merged):
            if _busy_cursor_id(start_at, end_at) == cursor_id:
                start_index = index + 1
                break
        else:
            raise ProblemException(
                status_code=400,
                code="validation_failed",
                title="Invalid cursor",
                detail="cursor is invalid",
            )

    page = merged[start_index : start_index + limit]
    next_cursor = None

    if start_index + limit < len(merged):
        last_start, last_end = page[-1]
        next_cursor = encode_cursor(_busy_cursor_id(last_start, last_end))

    return BusyBlockPageResponse(
        data=[
            BusyBlockResponse(start_at=start_at, end_at=end_at)
            for start_at, end_at in page
        ],
        next_cursor=next_cursor,
    )
