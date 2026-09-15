import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from uuid6 import uuid7

from app.config import get_settings


class AccessTokenExpired(Exception):
    pass


class InvalidAccessToken(Exception):
    pass


def generate_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_uuid() -> UUID:
    return uuid7()


def create_access_token(user_id: UUID) -> str:
    settings = get_settings()

    now = datetime.now(UTC)

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
    }

    return jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm="HS256",
    )


def decode_access_token(token: str) -> UUID:
    settings = get_settings()

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
    except ExpiredSignatureError as exc:
        raise AccessTokenExpired from exc
    except InvalidTokenError as exc:
        raise InvalidAccessToken from exc

    subject = payload.get("sub")

    if not isinstance(subject, str):
        raise InvalidAccessToken

    try:
        return UUID(subject)
    except ValueError as exc:
        raise InvalidAccessToken from exc
