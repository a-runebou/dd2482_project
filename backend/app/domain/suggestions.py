from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import pairwise
from uuid import UUID


@dataclass(frozen=True)
class SuggestionParticipant:
    user_id: UUID
    responded: bool
    available: set[int]
    preferred: set[int]


@dataclass(frozen=True)
class SuggestionResult:
    start_at: datetime
    end_at: datetime
    score: float
    available_user_ids: list[UUID]
    preferred_user_ids: list[UUID]
    missing_user_ids: list[UUID]


def generate_suggestions(
    *,
    slots: list[datetime],
    participants: list[SuggestionParticipant],
    duration_minutes: int,
    limit: int,
    slot_minutes: int = 30,
) -> list[SuggestionResult]:
    if duration_minutes <= 0:
        raise ValueError("duration_minutes must be positive")

    if duration_minutes % slot_minutes != 0:
        raise ValueError("duration_minutes must align to slot_minutes")

    if limit <= 0:
        raise ValueError("limit must be positive")

    slots_per_window = duration_minutes // slot_minutes

    if slots_per_window > len(slots):
        return []

    results: list[SuggestionResult] = []

    for start_index in range(len(slots) - slots_per_window + 1):
        end_index = start_index + slots_per_window

        window_slots = slots[start_index:end_index]

        if not _is_contiguous_window(
            window_slots,
            slot_minutes,
        ):
            continue

        window_indices = set(range(start_index, end_index))

        fully_available: list[UUID] = []
        fully_preferred: list[UUID] = []
        missing: list[UUID] = []

        score_sum = 0

        availability_sets: list[set[UUID]] = []

        for slot_index in range(
            start_index,
            end_index,
        ):
            available_at_slot: set[UUID] = set()

            available_count = 0
            preferred_count = 0

            for participant in participants:
                if slot_index in participant.preferred:
                    available_at_slot.add(participant.user_id)
                    preferred_count += 1

                elif slot_index in participant.available:
                    available_at_slot.add(participant.user_id)
                    available_count += 1

            availability_sets.append(available_at_slot)

            score_sum += 2 * preferred_count + available_count

        if availability_sets:
            first_set = availability_sets[0]

            if any(current_set != first_set for current_set in availability_sets[1:]):
                continue

        for participant in participants:
            available_for_all = all(
                (index in participant.available) or (index in participant.preferred)
                for index in window_indices
            )

            preferred_for_all = all(
                index in participant.preferred for index in window_indices
            )

            if preferred_for_all:
                fully_preferred.append(participant.user_id)

            elif available_for_all:
                fully_available.append(participant.user_id)

            else:
                missing.append(participant.user_id)

        score = score_sum / slots_per_window

        results.append(
            SuggestionResult(
                start_at=window_slots[0],
                end_at=slots[end_index - 1]
                + (
                    slots[end_index - 1] - slots[end_index - 2]
                    if slots_per_window > 1
                    else _slot_delta(slot_minutes)
                ),
                score=score,
                available_user_ids=sorted(
                    fully_available,
                    key=str,
                ),
                preferred_user_ids=sorted(
                    fully_preferred,
                    key=str,
                ),
                missing_user_ids=sorted(
                    missing,
                    key=str,
                ),
            )
        )

    results.sort(
        key=lambda result: (
            -result.score,
            result.start_at,
        )
    )

    return results[:limit]


def _slot_delta(slot_minutes: int) -> timedelta:
    return timedelta(minutes=slot_minutes)


def _is_contiguous_window(
    slots: list[datetime],
    slot_minutes: int,
) -> bool:
    expected_delta = _slot_delta(slot_minutes)

    return all(
        current - previous == expected_delta for previous, current in pairwise(slots)
    )
