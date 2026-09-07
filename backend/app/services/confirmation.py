from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.auth import new_uuid
from app.infra.models.group import (
    GroupState,
    Membership,
    MembershipRole,
)
from app.infra.models.job import Job
from app.infra.models.scheduling import Proposal
from app.services.groups import (
    GroupView,
    NotOwner,
    bump_group_version,
    get_group_view,
)
from app.services.proposals import (
    ProposalNotFound,
)


class AlreadyConfirmed(Exception):
    pass


class NotConfirmed(Exception):
    pass


def confirm_group(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
    proposal_id: UUID,
    send_reminders: bool,
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

    if group.state == GroupState.CONFIRMED:
        raise AlreadyConfirmed

    proposal = db.scalar(
        select(Proposal).where(
            Proposal.id == proposal_id,
            Proposal.group_id == group.id,
        )
    )

    if proposal is None:
        raise ProposalNotFound

    now = datetime.now(UTC)

    group.state = GroupState.CONFIRMED
    group.confirmed_proposal_id = proposal.id
    bump_group_version(group, now=now)

    if send_reminders:
        memberships = db.scalars(
            select(Membership).where(
                Membership.group_id == group.id,
                Membership.notify_email.is_(True),
            )
        ).all()

        run_after = proposal.start_at - timedelta(hours=settings.reminder_lead_hours)

        if run_after > now:
            for membership in memberships:
                db.add(
                    Job(
                        id=new_uuid(),
                        kind="reminder_send",
                        payload={
                            "group_id": str(group.id),
                            "user_id": str(membership.user_id),
                            "proposal_id": str(proposal.id),
                        },
                        run_after=run_after,
                        attempts=0,
                        dedupe_key=(
                            f"reminder:{group.id}:{membership.user_id}:{proposal.id}"
                        ),
                        locked_at=None,
                        completed_at=None,
                        last_error=None,
                    )
                )

    db.commit()
    db.refresh(group)

    return get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )


def unconfirm_group(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
) -> GroupView:
    view = get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )

    if view.my_role != MembershipRole.OWNER:
        raise NotOwner

    group = view.group

    if group.state != GroupState.CONFIRMED or group.confirmed_proposal_id is None:
        raise NotConfirmed

    proposal_id = group.confirmed_proposal_id

    prefix = f"reminder:{group.id}:%:{proposal_id}"

    db.execute(
        delete(Job).where(
            Job.completed_at.is_(None),
            Job.dedupe_key.like(prefix),
        )
    )

    group.state = GroupState.OPEN
    group.confirmed_proposal_id = None
    bump_group_version(group)

    db.commit()
    db.refresh(group)

    return get_group_view(
        db,
        slug=slug,
        user_id=user_id,
    )
