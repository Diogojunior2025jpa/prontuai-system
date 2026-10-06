"""Google Apps Script email delivery for account recovery."""

import asyncio
import logging
import os
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)


def _send(email: str, token: str) -> None:
    script_url = os.environ["GOOGLE_SCRIPT_URL"]
    secret = os.environ["GOOGLE_SCRIPT_SECRET"]
    frontend_url = os.environ.get(
        "FRONTEND_URL",
        "https://prontuai-system.vercel.app",
    ).rstrip("/")
    reset_url = f"{frontend_url}/esqueci-senha?token={quote(token)}"

    response = requests.post(
        script_url,
        json={
            "secret": secret,
            "to": email,
            "resetUrl": reset_url,
        },
        timeout=(5, 30),
    )
    response.raise_for_status()

    result = response.json()
    if not isinstance(result, dict) or result.get("ok") is not True:
        raise ValueError("Google Apps Script did not confirm email delivery")


async def send_password_reset_email(email: str, token: str) -> bool:
    required = ("GOOGLE_SCRIPT_URL", "GOOGLE_SCRIPT_SECRET")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        logger.error(
            "Password reset email not sent: missing Apps Script config: %s",
            ", ".join(missing),
        )
        return False

    try:
        await asyncio.to_thread(_send, email, token)
        return True
    except (requests.RequestException, ValueError, KeyError):
        logger.exception(
            "Password reset email delivery through Google Apps Script failed"
        )
        return False
