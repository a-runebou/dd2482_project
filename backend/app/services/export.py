import secrets
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.auth import hash_token
from app.infra.models.group import Group, GroupState
from app.infra.models.scheduling import Proposal
from app.services.groups import (
    get_group_view,
)


class GroupNotConfirmed(Exception):
    pass


class FeedNotFound(Exception):
    pass


@dataclass(frozen=True)
class ConfirmedEvent:
    group: Group
    proposal: Proposal


def get_confirmed_event(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
) -> ConfirmedEvent:
    view = get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )

    group = view.group

    if group.state != GroupState.CONFIRMED or group.confirmed_proposal_id is None:
        raise GroupNotConfirmed

    proposal = db.get(
        Proposal,
        group.confirmed_proposal_id,
    )

    if proposal is None:
        raise GroupNotConfirmed

    return ConfirmedEvent(
        group=group,
        proposal=proposal,
    )


def get_feed_event(
    db: Session,
    *,
    slug: str,
    token: str,
) -> ConfirmedEvent:
    group = db.scalar(select(Group).where(Group.slug == slug))

    if group is None:
        raise FeedNotFound

    supplied_hash = hash_token(token)

    if not secrets.compare_digest(
        supplied_hash,
        group.feed_token_hash,
    ):
        raise FeedNotFound

    if group.state != GroupState.CONFIRMED or group.confirmed_proposal_id is None:
        raise FeedNotFound

    proposal = db.get(
        Proposal,
        group.confirmed_proposal_id,
    )

    if proposal is None:
        raise FeedNotFound

    return ConfirmedEvent(
        group=group,
        proposal=proposal,
    )
