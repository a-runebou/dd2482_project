from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.calendar import CalendarSourceErrorCode
from app.infra.db import Base


class CalendarSourceKind(StrEnum):
    UPLOAD = "upload"
    URL = "url"


class CalendarSourceStatus(StrEnum):
    OK = "ok"
    PENDING = "pending"
    ERROR = "error"


class CalendarSource(Base):
    __tablename__ = "calendar_sources"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    kind: Mapped[CalendarSourceKind] = mapped_column(
        Enum(
            CalendarSourceKind,
            name="calendar_source_kind",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )

    url: Mapped[str | None] = mapped_column(
        String(2048),
        nullable=True,
    )

    status: Mapped[CalendarSourceStatus] = mapped_column(
        Enum(
            CalendarSourceStatus,
            name="calendar_source_status",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
    )

    last_polled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_error_code: Mapped[CalendarSourceErrorCode | None] = mapped_column(
        String(64),
        nullable=True,
    )

    etag: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
    )

    label: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    event_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )


class BusyBlock(Base):
    __tablename__ = "busy_blocks"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    source_id: Mapped[UUID] = mapped_column(
        ForeignKey("calendar_sources.id", ondelete="CASCADE"),
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

    uid: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "end_at > start_at",
            name="ck_busy_blocks_positive_duration",
        ),
    )
