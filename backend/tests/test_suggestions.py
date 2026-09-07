from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.domain.suggestions import (
    SuggestionParticipant,
    generate_suggestions,
)

USER_1 = UUID("00000000-0000-0000-0000-000000000001")
USER_2 = UUID("00000000-0000-0000-0000-000000000002")
USER_3 = UUID("00000000-0000-0000-0000-000000000003")


def make_slots(count: int) -> list[datetime]:
    start = datetime(
        2026,
        10,
        20,
        8,
        0,
        tzinfo=UTC,
    )

    return [start + timedelta(minutes=30 * index) for index in range(count)]


def test_best_suggestion_is_ranked_first() -> None:
    slots = make_slots(4)

    participants = [
        SuggestionParticipant(
            user_id=USER_1,
            responded=True,
            available={0, 1, 2, 3},
            preferred={0, 1},
        ),
        SuggestionParticipant(
            user_id=USER_2,
            responded=True,
            available={0, 1, 2, 3},
            preferred=set(),
        ),
    ]

    suggestions = generate_suggestions(
        slots=slots,
        participants=participants,
        duration_minutes=60,
        limit=5,
    )

    assert suggestions[0].start_at == slots[0]
    assert suggestions[0].score == 3.0


def test_preferred_user_is_reported() -> None:
    slots = make_slots(2)

    participants = [
        SuggestionParticipant(
            user_id=USER_1,
            responded=True,
            available=set(),
            preferred={0, 1},
        )
    ]

    suggestions = generate_suggestions(
        slots=slots,
        participants=participants,
        duration_minutes=60,
        limit=5,
    )

    assert suggestions[0].preferred_user_ids == [USER_1]
    assert suggestions[0].available_user_ids == []


def test_missing_user_is_reported() -> None:
    slots = make_slots(2)

    participants = [
        SuggestionParticipant(
            user_id=USER_1,
            responded=True,
            available={0, 1},
            preferred=set(),
        ),
        SuggestionParticipant(
            user_id=USER_2,
            responded=False,
            available=set(),
            preferred=set(),
        ),
    ]

    suggestions = generate_suggestions(
        slots=slots,
        participants=participants,
        duration_minutes=60,
        limit=5,
    )

    assert USER_2 in (suggestions[0].missing_user_ids)


def test_window_with_changing_available_set_is_rejected() -> None:
    slots = make_slots(2)

    participants = [
        SuggestionParticipant(
            user_id=USER_1,
            responded=True,
            available={0},
            preferred=set(),
        ),
        SuggestionParticipant(
            user_id=USER_2,
            responded=True,
            available={0, 1},
            preferred=set(),
        ),
    ]

    suggestions = generate_suggestions(
        slots=slots,
        participants=participants,
        duration_minutes=60,
        limit=5,
    )

    assert suggestions == []


def test_limit_is_respected() -> None:
    slots = make_slots(6)

    participants = [
        SuggestionParticipant(
            user_id=USER_1,
            responded=True,
            available=set(range(6)),
            preferred=set(),
        )
    ]

    suggestions = generate_suggestions(
        slots=slots,
        participants=participants,
        duration_minutes=30,
        limit=2,
    )

    assert len(suggestions) == 2
