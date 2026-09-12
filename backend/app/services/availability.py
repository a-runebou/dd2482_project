from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.slots import (
    generate_slots,
    normalise_and_validate_slots,
)
from app.infra.models.group import (
    Group,
    GroupState,
    Membership,
)
from app.infra.models.scheduling import (
    Availability,
    AvailabilityState,
)
from app.infra.models.user import User
from app.services.groups import GroupNotFound


class GroupConfirmed(Exception):
    pass


@dataclass(frozen=True)
class ParticipantData:
    user_id: UUID
    display_name: str
    responded: bool
    available: list[int]
    preferred: list[int]


@dataclass(frozen=True)
class AggregateData:
    slot_index: int
    available_count: int
    preferred_count: int


@dataclass(frozen=True)
class MatrixData:
    version: int
    slots: list[datetime]
    participants: list[ParticipantData]
    aggregate: list[AggregateData]
    responded_count: int
    member_count: int


def _group_and_membership(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
) -> tuple[Group, Membership]:
    group = db.scalar(
        select(Group).where(Group.slug == slug)
    )

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

    return group, membership


def get_my_availability(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
) -> tuple[list[datetime], list[datetime]]:
    group, _ = _group_and_membership(
        db,
        slug=slug,
        user_id=user_id,
    )

    rows = db.scalars(
        select(Availability).where(
            Availability.group_id == group.id,
            Availability.user_id == user_id,
        )
    ).all()

    available = sorted(
        row.slot_start
        for row in rows
        if row.state == AvailabilityState.AVAILABLE
    )

    preferred = sorted(
        row.slot_start
        for row in rows
        if row.state == AvailabilityState.PREFERRED
    )

    return available, preferred


def put_my_availability(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
    available: list[datetime],
    preferred: list[datetime],
) -> tuple[list[datetime], list[datetime], int]:
    settings = get_settings()

    group, membership = _group_and_membership(
        db,
        slug=slug,
        user_id=user_id,
    )

    if group.state == GroupState.CONFIRMED:
        raise GroupConfirmed

    validated_available = normalise_and_validate_slots(
        available,
        timezone_name=group.timezone,
        date_start=group.date_start,
        date_end=group.date_end,
        window_start_minute=group.window_start_minute,
        window_end_minute=group.window_end_minute,
        slot_minutes=group.slot_minutes,
        max_range_days=settings.max_range_days,
    )

    validated_preferred = normalise_and_validate_slots(
        preferred,
        timezone_name=group.timezone,
        date_start=group.date_start,
        date_end=group.date_end,
        window_start_minute=group.window_start_minute,
        window_end_minute=group.window_end_minute,
        slot_minutes=group.slot_minutes,
        max_range_days=settings.max_range_days,
    )

    preferred_set = set(validated_preferred)

    available_set = (
        set(validated_available) - preferred_set
    )

    db.execute(
        delete(Availability).where(
            Availability.group_id == group.id,
            Availability.user_id == user_id,
        )
    )

    for slot in sorted(available_set):
        db.add(
            Availability(
                group_id=group.id,
                user_id=user_id,
                slot_start=slot,
                state=AvailabilityState.AVAILABLE,
            )
        )

    for slot in sorted(preferred_set):
        db.add(
            Availability(
                group_id=group.id,
                user_id=user_id,
                slot_start=slot,
                state=AvailabilityState.PREFERRED,
            )
        )

    now = datetime.now(UTC)

    membership.availability_submitted_at = now

    group.version += 1
    group.updated_at = now

    db.commit()

    return (
        sorted(available_set),
        sorted(preferred_set),
        group.version,
    )


def get_availability_matrix(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
) -> MatrixData:
    settings = get_settings()

    group, _ = _group_and_membership(
        db,
        slug=slug,
        user_id=user_id,
    )

    slots = generate_slots(
        timezone_name=group.timezone,
        date_start=group.date_start,
        date_end=group.date_end,
        window_start_minute=group.window_start_minute,
        window_end_minute=group.window_end_minute,
        slot_minutes=group.slot_minutes,
        max_range_days=settings.max_range_days,
    )

    slot_indices = {
        slot: index
        for index, slot in enumerate(slots)
    }

    member_rows = db.execute(
        select(Membership, User)
        .join(
            User,
            User.id == Membership.user_id,
        )
        .where(Membership.group_id == group.id)
        .order_by(Membership.joined_at)
    ).all()

    availability_rows = db.scalars(
        select(Availability).where(
            Availability.group_id == group.id
        )
    ).all()

    rows_by_user: dict[
        UUID,
        list[Availability],
    ] = {}

    for row in availability_rows:
        rows_by_user.setdefault(
            row.user_id,
            [],
        ).append(row)

    participants: list[ParticipantData] = []

    available_counts = [0] * len(slots)
    preferred_counts = [0] * len(slots)

    responded_count = 0

    for membership, member_user in member_rows:
        available_indices: list[int] = []
        preferred_indices: list[int] = []

        responded = (
            membership.availability_submitted_at
            is not None
        )

        if responded:
            responded_count += 1

        for row in rows_by_user.get(
            membership.user_id,
            [],
        ):
            index = slot_indices.get(
                row.slot_start
            )

            if index is None:
                continue

            if (
                row.state
                == AvailabilityState.PREFERRED
            ):
                preferred_indices.append(index)
                preferred_counts[index] += 1
            else:
                available_indices.append(index)
                available_counts[index] += 1

        participants.append(
            ParticipantData(
                user_id=member_user.id,
                display_name=(
                    member_user.display_name
                    or "User"
                ),
                responded=responded,
                available=sorted(
                    available_indices
                ),
                preferred=sorted(
                    preferred_indices
                ),
            )
        )

    aggregate = [
        AggregateData(
            slot_index=index,
            available_count=available_counts[index],
            preferred_count=preferred_counts[index],
        )
        for index in range(len(slots))
    ]

    return MatrixData(
        version=group.version,
        slots=slots,
        participants=participants,
        aggregate=aggregate,
        responded_count=responded_count,
        member_count=len(member_rows),
    )