from fastapi import (
    APIRouter,
    Depends,
    Header,
    Query,
    Response,
    status,
)
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.errors import ProblemException
from app.api.schemas import (
    GroupCreate,
    GroupPageResponse,
    GroupPatch,
    GroupResponse,
    GroupWithInviteResponse,
)
from app.config import get_settings
from app.domain.slots import SlotValidationError
from app.infra.db import get_db
from app.infra.models.user import User
from app.services.groups import (
    GroupLimitReached,
    GroupNotFound,
    GroupView,
    NotOwner,
    VersionConflict,
    create_group,
    delete_group,
    etag_for,
    get_group_view,
    list_group_views,
    update_group,
)

router = APIRouter(
    prefix="/groups",
    tags=["groups"],
)


def group_response(view: GroupView) -> GroupResponse:
    group = view.group

    return GroupResponse(
        slug=group.slug,
        name=group.name,
        description=group.description,
        owner_id=group.owner_id,
        timezone=group.timezone,
        date_start=group.date_start,
        date_end=group.date_end,
        window_start_minute=group.window_start_minute,
        window_end_minute=group.window_end_minute,
        slot_minutes=30,
        state=group.state.value,
        confirmed_proposal=None,
        member_count=view.member_count,
        my_role=view.my_role.value,
        feed_url=None,
        version=group.version,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def raise_group_error(exc: Exception) -> None:
    if isinstance(exc, GroupNotFound):
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc

    if isinstance(exc, NotOwner):
        raise ProblemException(
            status_code=403,
            code="not_owner",
            title="Owner access required",
        ) from exc

    if isinstance(exc, VersionConflict):
        raise ProblemException(
            status_code=412,
            code="version_conflict",
            title="Version conflict",
        ) from exc

    if isinstance(exc, GroupLimitReached):
        raise ProblemException(
            status_code=400,
            code="validation_failed",
            title="Group limit reached",
        ) from exc

    if isinstance(exc, SlotValidationError):
        status_code = (
            422
            if exc.code == "range_too_long"
            else 400
        )

        raise ProblemException(
            status_code=status_code,
            code=exc.code,
            title="Validation failed",
            detail=str(exc),
        ) from exc

    raise exc


@router.get(
    "",
    response_model=GroupPageResponse,
)
def get_groups(
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupPageResponse:
    try:
        views, next_cursor = list_group_views(
            db,
            user_id=user.id,
            limit=limit,
            cursor=cursor,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    return GroupPageResponse(
        data=[
            group_response(view)
            for view in views
        ],
        next_cursor=next_cursor,
    )


@router.post(
    "",
    response_model=GroupWithInviteResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_group(
    body: GroupCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupWithInviteResponse:
    try:
        view, invite_token = create_group(
            db,
            user=user,
            name=body.name,
            description=body.description,
            timezone_name=body.timezone,
            date_start=body.date_start,
            date_end=body.date_end,
            window_start_minute=(
                body.window_start_minute
            ),
            window_end_minute=body.window_end_minute,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    settings = get_settings()

    base = group_response(view)

    return GroupWithInviteResponse(
        **base.model_dump(),
        invite_url=(
            f"{settings.public_app_url.rstrip('/')}"
            f"/join/{view.group.slug}"
            f"?invite={invite_token}"
        ),
    )


@router.get(
    "/{slug}",
    response_model=GroupResponse,
)
def get_group(
    slug: str,
    response: Response,
    if_none_match: str | None = Header(
        default=None,
        alias="If-None-Match",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupResponse | Response:
    try:
        view = get_group_view(
            db,
            slug=slug,
            user_id=user.id,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    etag = etag_for(view.group.version)

    if if_none_match == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
        )

    response.headers["ETag"] = etag

    return group_response(view)


@router.patch(
    "/{slug}",
    response_model=GroupResponse,
)
def patch_group(
    slug: str,
    body: GroupPatch,
    response: Response,
    if_match: str | None = Header(
        default=None,
        alias="If-Match",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupResponse:
    try:
        view = update_group(
            db,
            slug=slug,
            user_id=user.id,
            changes=body.model_dump(
                exclude_unset=True
            ),
            if_match=if_match,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    response.headers["ETag"] = etag_for(
        view.group.version
    )

    return group_response(view)


@router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_group(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    try:
        delete_group(
            db,
            slug=slug,
            user_id=user.id,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    return Response(
        status_code=status.HTTP_204_NO_CONTENT
    )