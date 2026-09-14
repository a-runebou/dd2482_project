from fastapi import (
    APIRouter,
    Depends,
    Query,
    Response,
)
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.errors import ProblemException
from app.domain.ics import render_event_ics
from app.infra.db import get_db
from app.infra.models.user import User
from app.services.export import (
    FeedNotFound,
    GroupNotConfirmed,
    get_confirmed_event,
    get_feed_event,
)
from app.services.groups import GroupNotFound

router = APIRouter(
    prefix="/groups",
    tags=["export"],
)


@router.get("/{slug}/event.ics")
def get_event_ics(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    try:
        event = get_confirmed_event(
            db,
            slug=slug,
            user_id=user.id,
        )
    except GroupNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc
    except GroupNotConfirmed as exc:
        raise ProblemException(
            status_code=409,
            code="validation_failed",
            title="Group is not confirmed",
        ) from exc

    content = render_event_ics(
        proposal_id=event.proposal.id,
        summary=event.group.name,
        description=event.group.description,
        start_at=event.proposal.start_at,
        end_at=event.proposal.end_at,
        created_at=event.proposal.created_at,
    )

    return Response(
        content=content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": (
                'attachment; filename="event.ics"'
            )
        },
    )


@router.get("/{slug}/feed.ics")
def get_group_feed(
    slug: str,
    token: str = Query(
        min_length=32,
        max_length=64,
    ),
    db: Session = Depends(get_db),
) -> Response:
    try:
        event = get_feed_event(
            db,
            slug=slug,
            token=token,
        )
    except FeedNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="not_found",
            title="Calendar feed not found",
        ) from exc

    content = render_event_ics(
        proposal_id=event.proposal.id,
        summary=event.group.name,
        description=event.group.description,
        start_at=event.proposal.start_at,
        end_at=event.proposal.end_at,
        created_at=event.proposal.created_at,
    )

    return Response(
        content=content,
        media_type="text/calendar",
    )