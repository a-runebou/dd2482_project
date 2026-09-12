from fastapi import APIRouter

from app.api.schemas import ConfigResponse
from app.config import get_settings

router = APIRouter()


@router.get(
    "/config",
    response_model=ConfigResponse,
    response_model_exclude_none=True,
)
def get_config() -> ConfigResponse:
    settings = get_settings()

    return ConfigResponse(
        slot_minutes=30,
        max_range_days=settings.max_range_days,
        max_members=settings.max_members,
        max_groups_per_user=settings.max_groups_per_user,
        max_proposals_per_group=settings.max_proposals_per_group,
        max_calendar_sources=settings.max_calendar_sources,
        max_ics_bytes=settings.max_ics_bytes,
        max_ics_events=settings.max_ics_events,
        min_duration_minutes=settings.min_duration_minutes,
        max_duration_minutes=settings.max_duration_minutes,
        reminder_lead_hours=settings.reminder_lead_hours,
        poll_interval_seconds=settings.poll_interval_seconds,
        environment=settings.environment,  # type: ignore[arg-type]
        build_sha=settings.build_sha,
    )