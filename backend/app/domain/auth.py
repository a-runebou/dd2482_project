import hashlib
import secrets

from uuid6 import uuid7
from uuid import UUID


def generate_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_uuid() -> UUID:
    return uuid7()