from urllib.parse import quote, urlencode
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
        raise TypeError("email_send job missing email")

    if template != "magic_link":
        raise ValueError("Unsupported email template")

    token = payload.get("token")
    redirect_path = payload.get(
        "redirect_path",
        "/",
    )

    if not isinstance(token, str):
        raise TypeError("magic-link job missing token")

    if not isinstance(
        redirect_path,
        str,
    ):
        redirect_path = "/"

    settings = get_settings()

    link = (
        f"{settings.public_app_url.rstrip('/')}"
        "/auth/callback?"
        f"{urlencode({'token': token, 'redirect': redirect_path}, quote_via=quote)}"
    )

    send_email(
        to=email,
        subject="Sign in to Schedular",
        text=(f"Use this link to sign in:\n\n{link}\n"),
    )


def handle_reminder_send(
    db: Session,
    *,
    payload: dict[str, object],
) -> None:
    user_id_raw = payload.get("user_id")
    group_id_raw = payload.get("group_id")
    proposal_id_raw = payload.get("proposal_id")

    if not isinstance(user_id_raw, str):
        raise TypeError("reminder job missing user_id")

    if not isinstance(group_id_raw, str):
        raise TypeError("reminder job missing group_id")

    if not isinstance(proposal_id_raw, str):
        raise TypeError("reminder job missing proposal_id")

    user_id = UUID(user_id_raw)
    group_id = UUID(group_id_raw)
    proposal_id = UUID(proposal_id_raw)

    user = db.get(
        User,
        user_id,
    )

    group = db.get(
        Group,
        group_id,
    )

    proposal = db.get(
        Proposal,
        proposal_id,
    )

    if user is None or group is None or proposal is None:
        return

    send_email(
        to=user.email,
        subject=f"Reminder: {group.name}",
        text=(
            f"Your meeting '{group.name}' starts at {proposal.start_at.isoformat()}."
        ),
    )
