from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.domain.calendar import CalendarSourceErrorCode


class ConfigResponse(BaseModel):
    slot_minutes: Literal[30]
    max_range_days: int
    max_members: int
    max_groups_per_user: int
    max_proposals_per_group: int
    max_calendar_sources: int
    max_ics_bytes: int
    max_ics_events: int
    min_duration_minutes: int
    max_duration_minutes: int
    ics_poll_interval_hours: int
    manual_refresh_cooldown_seconds: int
    reminder_lead_hours: int
    access_token_ttl_seconds: int
    refresh_token_ttl_days: int
    magic_link_ttl_seconds: int
    poll_interval_seconds: int
    environment: Literal["development", "staging", "production"]
    build_sha: str | None = None


class MagicLinkRequest(BaseModel):
    email: EmailStr = Field(max_length=254)
    redirect_path: str | None = Field(
        default=None,
        pattern=r"^/[A-Za-z0-9/_-]*$",
    )


class SessionCreateRequest(BaseModel):
    token: str = Field(min_length=32, max_length=512)


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=64)
    timezone: str
    notify_email_default: bool = True
    created_at: datetime


class UserPatch(BaseModel):
    display_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
    )
    timezone: str | None = None
    notify_email_default: bool | None = None

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> "UserPatch":
        if (
            self.display_name is None
            and self.timezone is None
            and self.notify_email_default is None
        ):
            raise ValueError("At least one field must be provided")

        return self


class SessionResponse(BaseModel):
    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int
    user: UserResponse


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(
        default=None,
        max_length=1000,
    )
    timezone: str = "Europe/Stockholm"
    date_start: date
    date_end: date
    window_start_minute: int = Field(
        ge=0,
        le=1410,
        multiple_of=30,
    )
    window_end_minute: int = Field(
        ge=30,
        le=1440,
        multiple_of=30,
    )


class GroupPatch(BaseModel):
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
    )
    timezone: str | None = None
    date_start: date | None = None
    date_end: date | None = None
    window_start_minute: int | None = Field(
        default=None,
        ge=0,
        le=1410,
        multiple_of=30,
    )
    window_end_minute: int | None = Field(
        default=None,
        ge=30,
        le=1440,
        multiple_of=30,
    )
    rotate_invite_token: bool | None = None
    rotate_feed_token: bool | None = None

    @model_validator(mode="after")
    def require_at_least_one_group_field(self) -> "GroupPatch":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")

        return self


class GroupResponse(BaseModel):
    slug: str
    name: str
    description: str | None = None
    owner_id: UUID
    timezone: str
    date_start: date
    date_end: date
    window_start_minute: int
    window_end_minute: int
    slot_minutes: Literal[30]
    state: Literal["open", "confirmed", "archived"]
    confirmed_proposal: dict[str, object] | None = None
    member_count: int
    my_role: Literal["owner", "member"] | None = None
    feed_url: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class GroupWithInviteResponse(GroupResponse):
    invite_url: str


class GroupPageResponse(BaseModel):
    data: list[GroupResponse]
    next_cursor: str | None


class JoinRequest(BaseModel):
    invite_token: str = Field(
        min_length=16,
        max_length=64,
    )


class MemberResponse(BaseModel):
    user_id: UUID
    display_name: str
    role: Literal["owner", "member"]
    responded: bool
    notify_email: bool | None = None
    joined_at: datetime


class MemberPageResponse(BaseModel):
    data: list[MemberResponse]
    next_cursor: str | None = None


class AvailabilitySelection(BaseModel):
    available: list[datetime] = Field(
        max_length=1488,
    )
    preferred: list[datetime] = Field(
        max_length=1488,
    )


class ParticipantAvailability(BaseModel):
    user_id: UUID
    display_name: str
    responded: bool
    available: list[int]
    preferred: list[int]


class SlotAggregate(BaseModel):
    slot_index: int
    available_count: int
    preferred_count: int


class AvailabilityMatrix(BaseModel):
    version: int
    slots: list[datetime]
    participants: list[ParticipantAvailability]
    aggregate: list[SlotAggregate]
    responded_count: int
    member_count: int


class SuggestionResponse(BaseModel):
    start_at: datetime
    end_at: datetime
    score: float
    available_user_ids: list[UUID]
    preferred_user_ids: list[UUID]
    missing_user_ids: list[UUID]


class SuggestionPageResponse(BaseModel):
    data: list[SuggestionResponse]
    next_cursor: str | None = None


class ProposalCreate(BaseModel):
    start_at: datetime
    end_at: datetime
    origin: Literal[
        "suggested",
        "manual",
    ] = "manual"


class ProposalVotes(BaseModel):
    yes: list[UUID]
    maybe: list[UUID]
    no: list[UUID]


class ProposalResponse(BaseModel):
    id: UUID
    start_at: datetime
    end_at: datetime
    origin: Literal[
        "suggested",
        "manual",
    ]
    created_by: UUID
    votes: ProposalVotes
    my_vote: (
        Literal[
            "yes",
            "maybe",
            "no",
        ]
        | None
    ) = None
    created_at: datetime


class ProposalPageResponse(BaseModel):
    data: list[ProposalResponse]
    next_cursor: str | None = None


class VoteInput(BaseModel):
    value: Literal["yes", "maybe", "no"]


class ConfirmationRequest(BaseModel):
    proposal_id: UUID
    send_reminders: bool = True


class CalendarSourceResponse(BaseModel):
    id: UUID
    kind: Literal["upload", "url"]
    url: str | None = None
    label: str | None = None
    status: Literal["pending", "ok", "error"]
    last_polled_at: datetime | None = None
    last_error_code: CalendarSourceErrorCode | None = None
    event_count: int
    created_at: datetime


class CalendarSourcePageResponse(BaseModel):
    data: list[CalendarSourceResponse]
    next_cursor: str | None = None


class BusyBlockResponse(BaseModel):
    start_at: datetime
    end_at: datetime
    source_id: UUID | None = None


class BusyBlockPageResponse(BaseModel):
    data: list[BusyBlockResponse]
    next_cursor: str | None = None


class CalendarSourceCreate(BaseModel):
    url: str = Field(
        min_length=1,
        max_length=2048,
    )
    label: str | None = Field(
        default=None,
        max_length=64,
    )


class AnalyticsEvent(BaseModel):
    name: str = Field(
        max_length=64,
    )
    occurred_at: datetime
    properties: dict[str, object] | None = None


class AnalyticsBatch(BaseModel):
    events: list[AnalyticsEvent] = Field(
        max_length=50,
    )


class FlagAssignments(BaseModel):
    flags: dict[str, str]
