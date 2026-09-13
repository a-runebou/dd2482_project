from uuid import uuid4

from app.domain.auth import create_access_token, decode_access_token


def test_access_token_round_trip() -> None:
    user_id = uuid4()

    token = create_access_token(user_id)

    assert decode_access_token(token) == user_id
