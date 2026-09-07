from uuid import UUID

from sqlalchemy.orm import Session

from app.domain.suggestions import (
    SuggestionParticipant,
    SuggestionResult,
    generate_suggestions,
)
from app.services.availability import (
    get_availability_matrix,
)


def get_suggestions(
    db: Session,
    *,
    slug: str,
    user_id: UUID,
    duration_minutes: int,
    limit: int,
) -> list[SuggestionResult]:
    matrix = get_availability_matrix(
        db,
        slug=slug,
        user_id=user_id,
    )

    participants = [
        SuggestionParticipant(
            user_id=participant.user_id,
            responded=participant.responded,
            available=set(participant.available),
            preferred=set(participant.preferred),
        )
        for participant in matrix.participants
    ]

    return generate_suggestions(
        slots=matrix.slots,
        participants=participants,
        duration_minutes=duration_minutes,
        limit=limit,
    )
