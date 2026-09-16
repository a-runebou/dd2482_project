from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse

from app.worker.email import handle_email_send


def test_magic_link_email(
    monkeypatch,
) -> None:
    mock_send = MagicMock()

    monkeypatch.setattr(
        "app.worker.email.send_email",
        mock_send,
    )

    handle_email_send(
        payload={
            "template": "magic_link",
            "email": "alex@example.com",
            "token": "abc123",
            "redirect_path": "/groups/example-group",
        }
    )

    mock_send.assert_called_once()

    call = mock_send.call_args.kwargs

    assert call["to"] == "alex@example.com"

    link = call["text"].splitlines()[2]
    parsed = urlparse(link)

    assert parsed.path == "/auth/callback"
    assert parse_qs(parsed.query) == {
        "token": ["abc123"],
        "redirect": ["/groups/example-group"],
    }
