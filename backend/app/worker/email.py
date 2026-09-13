from uuid import UUID

from sqlalchemy.orm import Session

from app.config import get_settings
from app.infra.mail import send_email
from app.infra.models.group import Group
from app.infra.models.scheduling import Proposal
from app.infra.models.user import User


def handle_email_send(
    *,
    payload: dict[str, object],
) -> None:
    template = payload.get("template")
    email = payload.get("email")

    if not isinstance(email, str):
        raise TypeError(
            "email_send job missing email"
        )

    if template != "magic_link":
        raise ValueError(
            "Unsupported email template"
        )

    token = payload.get("token")
    redirect_path = payload.get(
        "redirect_path",
        "/",
    )

    if not isinstance(token, str):
        raise TypeError(
            "magic-link job missing token"
        )

    if not isinstance(
        redirect_path,
        str,
    ):
        redirect_path = "/"

    settings = get_settings()

    link = (
        f"{settings.public_app_url.rstrip('/')}"
        f"/auth/callback?token={token}"
        f"&redirect_path={redirect_path}"
    )

    send_email(
        to=email,
        subject="Sign in to Schedular",
        text=(
            "Use this link to sign in:\n\n"
            f"{link}\n"
        ),
    )


def handle_reminder_send(
    db: Session,
    *,
    payload: dict[str, object],
) -> None:
    user_id = payload.get("user_id")
    group_id = payload.get("group_id")
    proposal_id = payload.get("proposal_id")

    if not all(
        isinstance(value, str)
        for value in (
            user_id,
            group_id,
            proposal_id,
        )
    ):
        raise ValueError(
            "Invalid reminder payload"
        )

    user = db.get(
        User,
        UUID(user_id),
    )

    group = db.get(
        Group,
        UUID(group_id),
    )

    proposal = db.get(
        Proposal,
        UUID(proposal_id),
    )

    if (
        user is None
        or group is None
        or proposal is None
    ):
        return

    send_email(
        to=user.email,
        subject=f"Reminder: {group.name}",
        text=(
            f"Your meeting '{group.name}' "
            f"starts at "
            f"{proposal.start_at.isoformat()}."
        ),
    )