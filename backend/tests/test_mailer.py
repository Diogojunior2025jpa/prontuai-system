import base64
from email import policy
from email.parser import BytesParser

import pytest
import requests

import lib.mailer as mailer


@pytest.mark.asyncio
async def test_gmail_api_sends_password_reset_message(monkeypatch):
    monkeypatch.setenv("GMAIL_CLIENT_ID", "client-id")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("GMAIL_REFRESH_TOKEN", "refresh-token")
    monkeypatch.setenv("GMAIL_FROM_EMAIL", "ProntuAI <sender@gmail.com>")
    calls = []

    class Response:
        def __init__(self, payload=None):
            self.payload = payload or {}

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    def post(url, **kwargs):
        calls.append((url, kwargs))
        if url == mailer.GOOGLE_TOKEN_URL:
            return Response({"access_token": "access-token"})
        return Response({"id": "message-1"})

    monkeypatch.setattr(mailer.requests, "post", post)

    sent = await mailer.send_password_reset_email(
        "patient@example.com",
        "reset-token",
    )
    assert sent
    assert calls[0][1]["data"]["refresh_token"] == "refresh-token"
    assert calls[1][1]["headers"]["Authorization"] == "Bearer access-token"

    raw_message = calls[1][1]["json"]["raw"]
    raw_message += "=" * (-len(raw_message) % 4)
    message = BytesParser(policy=policy.default).parsebytes(
        base64.urlsafe_b64decode(raw_message)
    )
    assert message["From"] == "ProntuAI <sender@gmail.com>"
    assert message["To"] == "patient@example.com"
    assert message["Subject"] == "Redefinição de senha do ProntuAI"
    plain_body = message.get_body(preferencelist=("plain",)).get_content()
    assert "reset-token" in plain_body


@pytest.mark.asyncio
async def test_gmail_api_reports_missing_configuration(monkeypatch):
    for name in (
        "GMAIL_CLIENT_ID",
        "GMAIL_CLIENT_SECRET",
        "GMAIL_REFRESH_TOKEN",
        "GMAIL_FROM_EMAIL",
    ):
        monkeypatch.delenv(name, raising=False)

    sent = await mailer.send_password_reset_email(
        "patient@example.com",
        "reset-token",
    )
    assert not sent


@pytest.mark.asyncio
async def test_gmail_api_reports_network_failure(monkeypatch):
    for name, value in (
        ("GMAIL_CLIENT_ID", "client-id"),
        ("GMAIL_CLIENT_SECRET", "client-secret"),
        ("GMAIL_REFRESH_TOKEN", "refresh-token"),
        ("GMAIL_FROM_EMAIL", "sender@gmail.com"),
    ):
        monkeypatch.setenv(name, value)

    def post(*_args, **_kwargs):
        raise requests.ConnectionError("network unavailable")

    monkeypatch.setattr(mailer.requests, "post", post)

    sent = await mailer.send_password_reset_email(
        "patient@example.com",
        "reset-token",
    )
    assert not sent
