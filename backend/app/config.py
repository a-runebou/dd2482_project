import os
from dataclasses import dataclass


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)

    if value is None:
        return default

    return value.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str

    jwt_secret: str
    public_app_url: str
    auth_cookie_secure: bool
    build_sha: str | None

    slot_minutes: int = 30
    max_range_days: int = 31
    max_members: int = 50
    max_groups_per_user: int = 20
    max_proposals_per_group: int = 20
    max_calendar_sources: int = 5
    max_ics_bytes: int = 2_097_152
    max_ics_events: int = 5_000
    min_duration_minutes: int = 30
    max_duration_minutes: int = 480
    reminder_lead_hours: int = 24
    poll_interval_seconds: int = 15

    manual_refresh_cooldown_seconds: int = 300
    ics_poll_interval_hours: int = 6

    access_token_ttl_seconds: int = 900
    refresh_token_ttl_days: int = 30
    magic_link_ttl_seconds: int = 900


def get_settings() -> Settings:
    return Settings(
        environment=os.getenv("ENVIRONMENT", "development"),
        database_url=os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg://schedular:schedular@localhost:5432/schedular",
        ),
        jwt_secret=os.getenv(
            "JWT_SECRET",
            "development-only-not-a-production-secret",
        ),
        public_app_url=os.getenv(
            "PUBLIC_APP_URL",
            "http://localhost:5173",
        ),
        auth_cookie_secure=_get_bool(
            "AUTH_COOKIE_SECURE",
            False,
        ),
        build_sha=os.getenv("BUILD_SHA"),
    )