import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.auth import hash_token
from app.infra.models.group import (
    Group,
    Membership,
    MembershipRole,
)
from app.infra.models.scheduling import (
    Availability,
    Proposal,
    Vote,
)
from app.infra.models.user import User
from app.services.groups import (
    GroupNotFound,
    GroupView,
    bump_group_version,
    get_group_view,
)


class AlreadyMember(Exception):
    pass


class MemberLimitReached(Exception):
    pass


class ForbiddenMemberAction(Exception):
    pass


@dataclass(frozen=True)
class MemberView:
    membership: Membership
    user: User
    responded: bool


def join_group(
    db: Session,
    *,
    slug: str,
    user: User,
    invite_token: str,
) -> GroupView:
    group = db.scalar(select(Group).where(Group.slug == slug))

    if group is None:
        raise GroupNotFound

    supplied_hash = hash_token(invite_token)

    if not secrets.compare_digest(
        supplied_hash,
        group.invite_token_hash,
    ):
        raise GroupNotFound

    existing = db.scalar(
        select(Membership).where(
            Membership.group_id == group.id,
            Membership.user_id == user.id,
        )
    )

    if existing is not None:
        raise AlreadyMember

    count = db.scalar(
        select(func.count())
        .select_from(Membership)
        .where(Membership.group_id == group.id)
    )

    settings = get_settings()

    if int(count or 0) >= settings.max_members:
        raise MemberLimitReached

    membership = Membership(
        group_id=group.id,
        user_id=user.id,
        role=MembershipRole.MEMBER,
        notify_email=user.notify_email_default,
        joined_at=datetime.now(UTC),
    )

    db.add(membership)

    bump_group_version(group)

    db.commit()

    return get_group_view(
        db,
        slug=slug,
        user_id=user.id,
    )


def list_members(
    db: Session,
    *,
    slug: str,
    caller_id: UUID,
) -> list[MemberView]:
    view = get_group_view(
        db,
        slug=slug,
        user_id=caller_id,
    )

    rows = db.execute(
        select(Membership, User)
        .join(
            User,
            User.id == Membership.user_id,
        )
        .where(Membership.group_id == view.group.id)
        .order_by(Membership.joined_at)
    ).all()

    result: list[MemberView] = []

    for membership, user in rows:
        _ = db.scalar(
            select(func.count())
            .select_from(Availability)
            .where(
                Availability.group_id == membership.group_id,
                Availability.user_id == membership.user_id,
            )
        )

        result.append(
            MemberView(
                membership=membership,
                user=user,
                responded=bool(membership.availability_submitted_at is not None),
            )
        )

    return result


def remove_member(
    db: Session,
    *,
    slug: str,
    caller_id: UUID,
    target_user_id: UUID,
) -> None:
    view = get_group_view(
        db,
        slug=slug,
        user_id=caller_id,
    )

    target = db.scalar(
        select(Membership).where(
            Membership.group_id == view.group.id,
            Membership.user_id == target_user_id,
        )
    )

    if target is None:
        raise GroupNotFound

    if target.role == MembershipRole.OWNER:
        raise ForbiddenMemberAction

    caller_is_owner = view.my_role == MembershipRole.OWNER
    removing_self = caller_id == target_user_id

    if not caller_is_owner and not removing_self:
        raise ForbiddenMemberAction

    db.execute(
        delete(Availability).where(
            Availability.group_id == view.group.id,
            Availability.user_id == target_user_id,
        )
    )

    db.execute(
        delete(Vote).where(
            Vote.user_id == target_user_id,
            Vote.proposal_id.in_(
                select(Proposal.id).where(
                    Proposal.group_id == view.group.id,
                )
            ),
        )
    )

    db.delete(target)

    bump_group_version(view.group)

    db.commit()
