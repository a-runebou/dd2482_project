from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


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
    reminder_lead_hours: int
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