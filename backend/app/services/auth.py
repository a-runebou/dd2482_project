from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.auth import generate_token, hash_token, new_uuid
from app.infra.models.job import Job
from app.infra.models.user import MagicLink, User


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
        expires_at=now
        + timedelta(seconds=settings.magic_link_ttl_seconds),
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