from unittest.mock import MagicMock

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
            "redirect_path": "/",
        }
    )

    mock_send.assert_called_once()

    call = mock_send.call_args.kwargs

    assert (
        call["to"]
        == "alex@example.com"
    )

    assert "abc123" in call["text"]