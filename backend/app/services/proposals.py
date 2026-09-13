from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.auth import new_uuid
from app.domain.slots import (
    SlotValidationError,
    generate_slots,
)
from app.infra.models.group import (
    GroupState,
    MembershipRole,
)
from app.infra.models.scheduling import (
    Proposal,
    ProposalOrigin,
    Vote,
    VoteValue,
)
from app.services.groups import (
    GroupView,
    NotOwner,
    get_group_view,
)


class ProposalNotFound(Exception):
    pass


class GroupConfirmed(Exception):
    pass


class ProposalLimitReached(Exception):
    pass


@dataclass(frozen=True)
class ProposalView:
    proposal: Proposal
    yes: list[UUID]
    maybe: list[UUID]
    no: list[UUID]
    my_vote: VoteValue | None


def _proposal_view(
    db: Session,
    *,
    proposal: Proposal,
    user_id: UUID,
) -> ProposalView:
    votes = db.scalars(
        select(Vote).where(
            Vote.proposal_id == proposal.id
        )
    ).all()

    yes: list[UUID] = []
    maybe: list[UUID] = []
    no: list[UUID] = []

    my_vote: VoteValue | None = None

    for vote in votes:
        if vote.value == VoteValue.YES:
            yes.append(vote.user_id)
        elif vote.value == VoteValue.MAYBE:
            maybe.append(vote.user_id)
        else:
            no.append(vote.user_id)

        if vote.user_id == user_id:
            my_vote = vote.value

    return ProposalView(
        proposal=proposal,
        yes=sorted(yes, key=str),
        maybe=sorted(maybe, key=str),
        no=sorted(no, key=str),
        my_vote=my_vote,
    )


def _validate_proposal_window(
    *,
    group,
    start_at: datetime,
    end_at: datetime,
) -> None:
    settings = get_settings()

    if start_at.tzinfo is None or end_at.tzinfo is None:
        raise SlotValidationError(
            "proposal times must include timezone",
            code="slot_not_in_window",
        )

    start_at = start_at.astimezone(UTC)
    end_at = end_at.astimezone(UTC)

    if end_at <= start_at:
        raise SlotValidationError(
            "proposal end must be after start",
            code="slot_not_in_window",
        )

    duration = end_at - start_at

    slot_delta = timedelta(
        minutes=group.slot_minutes
    )

    if duration % slot_delta != timedelta(0):
        raise SlotValidationError(
            "proposal duration must align to slots",
            code="slot_not_in_window",
        )

    slots = set(
        generate_slots(
            timezone_name=group.timezone,
            date_start=group.date_start,
            date_end=group.date_end,
            window_start_minute=(
                group.window_start_minute
            ),
            window_end_minute=(
                group.window_end_minute
            ),
            slot_minutes=group.slot_minutes,
            max_range_days=(
                settings.max_range_days
            ),
        )
    )

    current = start_at

    while current < end_at:
        if current not in slots:
            raise SlotValidationError(
                "proposal is outside group window",
                code="slot_not_in_window",
            )

        current += slot_delta


def list_proposals(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
) -> tuple[list[ProposalView], int]:
    view = get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )

    proposals = db.scalars(
        select(Proposal)
        .where(
            Proposal.group_id == view.group.id
        )
        .order_by(
            Proposal.created_at,
            Proposal.id,
        )
    ).all()

    return (
        [
            _proposal_view(
                db,
                proposal=proposal,
                user_id=user_id,
            )
            for proposal in proposals
        ],
        view.group.version,
    )


def create_proposal(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
    start_at: datetime,
    end_at: datetime,
    origin: ProposalOrigin,
) -> ProposalView:
    settings = get_settings()

    view = get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )

    if view.my_role != MembershipRole.OWNER:
        raise NotOwner

    group = view.group

    if group.state == GroupState.CONFIRMED:
        raise GroupConfirmed

    proposal_count = db.scalar(
        select(func.count())
        .select_from(Proposal)
        .where(
            Proposal.group_id == group.id
        )
    )

    if (
        int(proposal_count or 0)
        >= settings.max_proposals_per_group
    ):
        raise ProposalLimitReached

    _validate_proposal_window(
        group=group,
        start_at=start_at,
        end_at=end_at,
    )

    proposal = Proposal(
        id=new_uuid(),
        group_id=group.id,
        start_at=start_at.astimezone(
            UTC
        ),
        end_at=end_at.astimezone(
            UTC
        ),
        origin=origin,
        created_by=user_id,
        created_at=datetime.now(
            UTC
        ),
    )

    db.add(proposal)

    group.version += 1
    group.updated_at = datetime.now(
        UTC
    )

    db.commit()
    db.refresh(proposal)

    return _proposal_view(
        db,
        proposal=proposal,
        user_id=user_id,
    )


def delete_proposal(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
    proposal_id: UUID,
) -> None:
    view = get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )

    if view.my_role != MembershipRole.OWNER:
        raise NotOwner

    if view.group.state == GroupState.CONFIRMED:
        raise GroupConfirmed

    proposal = db.scalar(
        select(Proposal).where(
            Proposal.id == proposal_id,
            Proposal.group_id == view.group.id,
        )
    )

    if proposal is None:
        raise ProposalNotFound

    db.delete(proposal)

    view.group.version += 1
    view.group.updated_at = datetime.now(
        UTC
    )

    db.commit()


def get_proposal(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
    proposal_id: UUID,
) -> tuple[ProposalView, GroupView]:
    group_view = get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )

    proposal = db.scalar(
        select(Proposal).where(
            Proposal.id == proposal_id,
            Proposal.group_id
            == group_view.group.id,
        )
    )

    if proposal is None:
        raise ProposalNotFound

    return (
        _proposal_view(
            db,
            proposal=proposal,
            user_id=user_id,
        ),
        group_view,
    )