import smtplib
from email.message import EmailMessage

from app.config import get_settings


def send_email(
    *,
    to: str,
    subject: str,
    text: str,
) -> None:
    settings = get_settings()

    message = EmailMessage()

    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject

    message.set_content(text)

    with smtplib.SMTP(
        settings.smtp_host,
        settings.smtp_port,
        timeout=10,
    ) as smtp:
        if settings.smtp_username and settings.smtp_password:
            smtp.login(
                settings.smtp_username,
                settings.smtp_password,
            )

        smtp.send_message(message)
