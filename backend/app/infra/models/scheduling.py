from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    text,
)
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
        Enum(
            AvailabilityState,
            name="availability_state",
            native_enum=False,
            create_constraint=True,
        ),
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
        Enum(
            ProposalOrigin,
            name="proposal_origin",
            native_enum=False,
            create_constraint=True,
        ),
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

    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        CheckConstraint(
            "end_at > start_at",
            name="ck_proposals_positive_duration",
        ),
        Index(
            "uq_proposals_one_confirmed_per_group",
            "group_id",
            unique=True,
            postgresql_where=text("confirmed_at IS NOT NULL"),
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
        Enum(
            VoteValue,
            name="vote_value",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )