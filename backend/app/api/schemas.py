from datetime import datetime
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