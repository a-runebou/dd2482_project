from uuid import uuid4


def test_reminder_dedupe_key_format() -> None:
    group_id = uuid4()
    user_id = uuid4()
    proposal_id = uuid4()

    dedupe_key = (
        f"reminder:"
        f"{group_id}:"
        f"{user_id}:"
        f"{proposal_id}"
    )

    assert dedupe_key.startswith(
        f"reminder:{group_id}:"
    )
    assert dedupe_key.endswith(
        str(proposal_id)
    )