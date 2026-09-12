from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.db import Base


class GroupState(StrEnum):
    OPEN = "open"
    CONFIRMED = "confirmed"
    ARCHIVED = "archived"


class MembershipRole(StrEnum):
    OWNER = "owner"
    MEMBER = "member"


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
    )

    slug: Mapped[str] = mapped_column(
        String(12),
        unique=True,
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )

    owner_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    timezone: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    date_start: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    date_end: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    window_start_minute: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    window_end_minute: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    slot_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=30,
    )

    state: Mapped[GroupState] = mapped_column(
        Enum(GroupState, name="group_state"),
        nullable=False,
        default=GroupState.OPEN,
    )

    confirmed_proposal_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
    )

    invite_token_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )

    feed_token_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class Membership(Base):
    __tablename__ = "memberships"

    group_id: Mapped[UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"),
        primary_key=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    role: Mapped[MembershipRole] = mapped_column(
        Enum(MembershipRole, name="membership_role"),
        nullable=False,
    )

    notify_email: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )