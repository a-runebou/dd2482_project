from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.db import Base


class AvailabilityState(StrEnum):
    AVAILABLE = "available"
    PREFERRED = "preferred"


class ProposalOrigin(StrEnum):
    SUGGESTED = "suggested"
    MANUAL = "manual"


class VoteValue(StrEnum):
    YES = "yes"
    MAYBE = "maybe"
    NO = "no"


class Availability(Base):
    __tablename__ = "availability"

    group_id: Mapped[UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"),
        primary_key=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    slot_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        primary_key=True,
    )

    state: Mapped[AvailabilityState] = mapped_column(
        Enum(AvailabilityState, name="availability_state"),
        nullable=False,
    )


class Proposal(Base):
    __tablename__ = "proposals"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
    )

    group_id: Mapped[UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    start_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    end_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    origin: Mapped[ProposalOrigin] = mapped_column(
        Enum(ProposalOrigin, name="proposal_origin"),
        nullable=False,
    )

    created_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "end_at > start_at",
            name="ck_proposals_positive_duration",
        ),
    )


class Vote(Base):
    __tablename__ = "votes"

    proposal_id: Mapped[UUID] = mapped_column(
        ForeignKey("proposals.id", ondelete="CASCADE"),
        primary_key=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    value: Mapped[VoteValue] = mapped_column(
        Enum(VoteValue, name="vote_value"),
        nullable=False,
    )