import base64
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.auth import generate_token, hash_token, new_uuid
from app.domain.groups import generate_group_slug
from app.domain.slots import (
    SlotValidationError,
    generate_slots,
    validate_group_window,
)
from app.infra.models.group import (
    Group,
    GroupState,
    Membership,
    MembershipRole,
)
from app.infra.models.scheduling import Availability
from app.infra.models.user import User


class GroupNotFound(Exception):
    pass


class NotOwner(Exception):
    pass


class VersionConflict(Exception):
    pass


class GroupLimitReached(Exception):
    pass


@dataclass(frozen=True)
class GroupView:
    group: Group
    member_count: int
    my_role: MembershipRole


def etag_for(version: int) -> str:
    return f'"{version}"'


def bump_group_version(
    group: Group,
    *,
    now: datetime | None = None,
) -> None:
    group.version += 1
    group.updated_at = now or datetime.now(UTC)


def encode_cursor(group_id: UUID) -> str:
    encoded = base64.urlsafe_b64encode(group_id.bytes).decode("ascii")

    return encoded.rstrip("=")


def decode_cursor(cursor: str) -> UUID:
    padding = "=" * (-len(cursor) % 4)

    try:
        raw = base64.urlsafe_b64decode(cursor + padding)
        return UUID(bytes=raw)
    except (ValueError, TypeError) as exc:
        raise SlotValidationError("invalid cursor") from exc


def _member_count(
    db: Session,
    group_id: UUID,
) -> int:
    count = db.scalar(
        select(func.count())
        .select_from(Membership)
        .where(Membership.group_id == group_id)
    )

    return int(count or 0)


def get_group_view(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
) -> GroupView:
    group = db.scalar(select(Group).where(Group.slug == slug))

    if group is None:
        raise GroupNotFound

    membership = db.scalar(
        select(Membership).where(
            Membership.group_id == group.id,
            Membership.user_id == user_id,
        )
    )

    if membership is None:
        raise GroupNotFound

    return GroupView(
        group=group,
        member_count=_member_count(db, group.id),
        my_role=membership.role,
    )


def create_group(
    db: Session,
    *,
    user: User,
    name: str,
    description: str | None,
    timezone_name: str,
    date_start: date,
    date_end: date,
    window_start_minute: int,
    window_end_minute: int,
) -> tuple[GroupView, str]:
    settings = get_settings()

    validate_group_window(
        timezone_name=timezone_name,
        date_start=date_start,
        date_end=date_end,
        window_start_minute=window_start_minute,
        window_end_minute=window_end_minute,
        slot_minutes=settings.slot_minutes,
        max_range_days=settings.max_range_days,
    )

    group_count = db.scalar(
        select(func.count())
        .select_from(Membership)
        .where(Membership.user_id == user.id)
    )

    if int(group_count or 0) >= settings.max_groups_per_user:
        raise GroupLimitReached

    slug = generate_group_slug()

    while db.scalar(select(Group.id).where(Group.slug == slug)) is not None:
        slug = generate_group_slug()

    invite_token = generate_token()
    feed_token = generate_token()

    now = datetime.now(UTC)

    group = Group(
        id=new_uuid(),
        slug=slug,
        name=name,
        description=description,
        owner_id=user.id,
        timezone=timezone_name,
        date_start=date_start,
        date_end=date_end,
        window_start_minute=window_start_minute,
        window_end_minute=window_end_minute,
        slot_minutes=settings.slot_minutes,
        state=GroupState.OPEN,
        confirmed_proposal_id=None,
        invite_token_hash=hash_token(invite_token),
        feed_token_hash=hash_token(feed_token),
        version=1,
        created_at=now,
        updated_at=now,
    )

    membership = Membership(
        group_id=group.id,
        user_id=user.id,
        role=MembershipRole.OWNER,
        notify_email=user.notify_email_default,
        joined_at=now,
    )

    db.add(group)
    db.add(membership)
    db.commit()
    db.refresh(group)

    return (
        GroupView(
            group=group,
            member_count=1,
            my_role=MembershipRole.OWNER,
        ),
        invite_token,
    )


def list_group_views(
    db: Session,
    *,
    user_id: UUID,
    limit: int,
    cursor: str | None,
) -> tuple[list[GroupView], str | None]:
    query = (
        select(Group, Membership.role)
        .join(
            Membership,
            Membership.group_id == Group.id,
        )
        .where(Membership.user_id == user_id)
        .order_by(Group.id)
    )

    if cursor is not None:
        query = query.where(Group.id > decode_cursor(cursor))

    rows = db.execute(query.limit(limit + 1)).all()

    has_more = len(rows) > limit
    selected_rows = rows[:limit]

    result = [
        GroupView(
            group=group,
            member_count=_member_count(db, group.id),
            my_role=role,
        )
        for group, role in selected_rows
    ]

    next_cursor = None

    if has_more and result:
        next_cursor = encode_cursor(result[-1].group.id)

    return result, next_cursor


def update_group(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
    changes: dict[str, object],
    if_match: str | None,
) -> GroupView:
    settings = get_settings()

    view = get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )

    if view.my_role != MembershipRole.OWNER:
        raise NotOwner

    group = view.group

    if if_match is not None and if_match != etag_for(group.version):
        raise VersionConflict

    timezone_name = cast(
        str,
        changes.get("timezone", group.timezone),
    )
    date_start = cast(
        date,
        changes.get("date_start", group.date_start),
    )
    date_end = cast(
        date,
        changes.get("date_end", group.date_end),
    )
    window_start_minute = cast(
        int,
        changes.get(
            "window_start_minute",
            group.window_start_minute,
        ),
    )
    window_end_minute = cast(
        int,
        changes.get(
            "window_end_minute",
            group.window_end_minute,
        ),
    )

    validate_group_window(
        timezone_name=timezone_name,
        date_start=date_start,
        date_end=date_end,
        window_start_minute=window_start_minute,
        window_end_minute=window_end_minute,
        slot_minutes=group.slot_minutes,
        max_range_days=settings.max_range_days,
    )

    bounds_changed = any(
        key in changes
        for key in (
            "timezone",
            "date_start",
            "date_end",
            "window_start_minute",
            "window_end_minute",
        )
    )

    if "name" in changes:
        group.name = cast(str, changes["name"])

    if "description" in changes:
        group.description = cast(
            str | None,
            changes["description"],
        )

    group.timezone = timezone_name
    group.date_start = date_start
    group.date_end = date_end
    group.window_start_minute = window_start_minute
    group.window_end_minute = window_end_minute

    if changes.get("rotate_invite_token") is True:
        group.invite_token_hash = hash_token(generate_token())

    if changes.get("rotate_feed_token") is True:
        group.feed_token_hash = hash_token(generate_token())

    if bounds_changed:
        valid_slots = set(
            generate_slots(
                timezone_name=group.timezone,
                date_start=group.date_start,
                date_end=group.date_end,
                window_start_minute=(group.window_start_minute),
                window_end_minute=(group.window_end_minute),
                slot_minutes=group.slot_minutes,
                max_range_days=settings.max_range_days,
            )
        )

        availability_rows = db.scalars(
            select(Availability).where(Availability.group_id == group.id)
        ).all()

        for availability in availability_rows:
            if availability.slot_start not in valid_slots:
                db.delete(availability)

    bump_group_version(group)

    db.commit()
    db.refresh(group)

    return GroupView(
        group=group,
        member_count=_member_count(db, group.id),
        my_role=MembershipRole.OWNER,
    )


def delete_group(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
) -> None:
    view = get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )

    if view.my_role != MembershipRole.OWNER:
        raise NotOwner

    db.delete(view.group)
    db.commit()
