from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import (
    APIRouter,
    Depends,
    File,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.errors import ProblemException
from app.api.schemas import (
    CalendarSourceResponse,
    UserPatch,
    UserResponse,
)
from app.config import get_settings
from app.domain.ics import IcsParseError
from app.infra.db import get_db
from app.infra.models.calendar import CalendarSource
from app.infra.models.user import User
from app.services.calendars import (
    CalendarSourceLimitReached,
    upload_calendar,
)

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

    content = await file.read(
        settings.max_ics_bytes + 1
    )

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
            code="validation_failed",
            title="Calendar source limit reached",
        ) from exc

    return calendar_source_response(source)