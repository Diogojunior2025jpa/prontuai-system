import pytest
import requests

import lib.mailer as mailer


@pytest.mark.asyncio
async def test_google_script_sends_password_reset_message(monkeypatch):
    monkeypatch.setenv(
        "GOOGLE_SCRIPT_URL",
        "https://script.google.com/macros/s/id/exec",
    )
    monkeypatch.setenv("GOOGLE_SCRIPT_SECRET", "long-random-test-secret")
    monkeypatch.setenv(
        "FRONTEND_URL",
        "https://prontuai-system.vercel.app",
    )
    calls = []

    class Response:
        def raise_for_status(self):
            return None

        @staticmethod
        def json():
            return {"ok": True}

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setattr(mailer.requests, "post", post)

    assert await mailer.send_password_reset_email(
        "patient@example.com",
        "reset-token",
    )
    assert len(calls) == 1
    assert calls[0][0] == "https://script.google.com/macros/s/id/exec"
    assert calls[0][1]["json"]["secret"] == "long-random-test-secret"
    assert calls[0][1]["json"]["to"] == "patient@example.com"
    assert calls[0][1]["json"]["resetUrl"] == (
        "https://prontuai-system.vercel.app/"
        "esqueci-senha?token=reset-token"
    )


@pytest.mark.asyncio
async def test_google_script_reports_missing_configuration(monkeypatch):
    for name in ("GOOGLE_SCRIPT_URL", "GOOGLE_SCRIPT_SECRET"):
        monkeypatch.delenv(name, raising=False)

    assert not await mailer.send_password_reset_email(
        "patient@example.com",
        "reset-token",
    )


@pytest.mark.asyncio
async def test_google_script_rejects_unconfirmed_delivery(monkeypatch):
    monkeypatch.setenv(
        "GOOGLE_SCRIPT_URL",
        "https://script.google.com/macros/s/id/exec",
    )
    monkeypatch.setenv("GOOGLE_SCRIPT_SECRET", "long-random-test-secret")

    class Response:
        def raise_for_status(self):
            return None

        @staticmethod
        def json():
            return {"ok": False, "error": "email delivery failed"}

    monkeypatch.setattr(
        mailer.requests,
        "post",
        lambda *_args, **_kwargs: Response(),
    )

    assert not await mailer.send_password_reset_email(
        "patient@example.com",
        "reset-token",
    )


@pytest.mark.asyncio
async def test_google_script_reports_network_failure(monkeypatch):
    monkeypatch.setenv(
        "GOOGLE_SCRIPT_URL",
        "https://script.google.com/macros/s/id/exec",
    )
    monkeypatch.setenv("GOOGLE_SCRIPT_SECRET", "long-random-test-secret")

    def post(*_args, **_kwargs):
        raise requests.ConnectionError("network unavailable")

    monkeypatch.setattr(mailer.requests, "post", post)

    assert not await mailer.send_password_reset_email(
        "patient@example.com",
        "reset-token",
    )
