from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.auth import create_access_token, generate_token, hash_token, new_uuid
from app.infra.models.job import Job
from app.infra.models.user import MagicLink, RefreshToken, User


def request_magic_link(
    db: Session,
    email: str,
    redirect_path: str | None,
) -> None:
    settings = get_settings()

    normalised_email = email.strip().lower()

    user = db.scalar(
        select(User).where(
            func.lower(User.email) == normalised_email,
        )
    )

    now = datetime.now(UTC)

    if user is None:
        local_part = normalised_email.split("@", maxsplit=1)[0]

        user = User(
            id=new_uuid(),
            email=normalised_email,
            display_name=local_part[:64] or "User",
            timezone="UTC",
            created_at=now,
        )

        db.add(user)
        db.flush()

    token = generate_token()

    magic_link = MagicLink(
        id=new_uuid(),
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=now + timedelta(seconds=settings.magic_link_ttl_seconds),
        consumed_at=None,
    )

    job = Job(
        id=new_uuid(),
        kind="email_send",
        payload={
            "template": "magic_link",
            "email": normalised_email,
            "token": token,
            "redirect_path": redirect_path or "/",
        },
        run_after=now,
        attempts=0,
        dedupe_key=None,
        locked_at=None,
        completed_at=None,
        last_error=None,
    )

    db.add(magic_link)
    db.add(job)
    db.commit()


from dataclasses import dataclass


@dataclass(frozen=True)
class CreatedSession:
    access_token: str
    refresh_token: str
    user: User


class InvalidMagicLink(Exception):
    pass


def create_session(
    db: Session,
    token: str,
) -> CreatedSession:
    settings = get_settings()

    now = datetime.now(UTC)
    token_hash = hash_token(token)

    magic_link = db.scalar(
        select(MagicLink).where(
            MagicLink.token_hash == token_hash,
        )
    )

    if (
        magic_link is None
        or magic_link.consumed_at is not None
        or magic_link.expires_at <= now
    ):
        raise InvalidMagicLink

    user = db.get(User, magic_link.user_id)

    if user is None:
        raise InvalidMagicLink

    magic_link.consumed_at = now

    raw_refresh_token = generate_token()
    family_id = new_uuid()

    refresh_token = RefreshToken(
        id=new_uuid(),
        user_id=user.id,
        token_hash=hash_token(raw_refresh_token),
        family_id=family_id,
        expires_at=now + timedelta(days=settings.refresh_token_ttl_days),
        revoked_at=None,
    )

    db.add(refresh_token)
    db.commit()

    return CreatedSession(
        access_token=create_access_token(user.id),
        refresh_token=raw_refresh_token,
        user=user,
    )


class InvalidRefreshToken(Exception):
    pass


def refresh_session(
    db: Session,
    raw_token: str,
) -> CreatedSession:
    settings = get_settings()

    now = datetime.now(UTC)
    token_hash = hash_token(raw_token)

    stored_token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
        )
    )

    if stored_token is None:
        raise InvalidRefreshToken

    if stored_token.revoked_at is not None:
        db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.family_id == stored_token.family_id,
            )
            .values(revoked_at=now)
        )

        db.commit()

        raise InvalidRefreshToken

    if stored_token.expires_at <= now:
        stored_token.revoked_at = now
        db.commit()
        raise InvalidRefreshToken

    user = db.get(User, stored_token.user_id)

    if user is None:
        raise InvalidRefreshToken

    stored_token.revoked_at = now

    new_raw_token = generate_token()

    new_refresh_token = RefreshToken(
        id=new_uuid(),
        user_id=user.id,
        token_hash=hash_token(new_raw_token),
        family_id=stored_token.family_id,
        expires_at=now + timedelta(days=settings.refresh_token_ttl_days),
        revoked_at=None,
    )

    db.add(new_refresh_token)
    db.commit()

    return CreatedSession(
        access_token=create_access_token(user.id),
        refresh_token=new_raw_token,
        user=user,
    )


def logout_session(
    db: Session,
    raw_token: str | None,
) -> None:
    if raw_token is None:
        return

    token_hash = hash_token(raw_token)

    stored_token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
        )
    )

    if stored_token is None:
        return

    now = datetime.now(UTC)

    db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.family_id == stored_token.family_id,
        )
        .values(revoked_at=now)
    )

    db.commit()
