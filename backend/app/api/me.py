from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.errors import ProblemException
from app.api.schemas import UserPatch, UserResponse
from app.infra.db import get_db
from app.infra.models.user import User

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