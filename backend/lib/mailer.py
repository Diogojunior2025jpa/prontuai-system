"""Gmail API email delivery for account recovery."""

import asyncio
import base64
import html
import logging
import os
from email.message import EmailMessage
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


def _send(email: str, token: str) -> None:
    client_id = os.environ["GMAIL_CLIENT_ID"]
    client_secret = os.environ["GMAIL_CLIENT_SECRET"]
    refresh_token = os.environ["GMAIL_REFRESH_TOKEN"]
    sender = os.environ["GMAIL_FROM_EMAIL"]

    token_response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=(5, 20),
    )
    token_response.raise_for_status()
    token_body = token_response.json()
    if not isinstance(token_body, dict):
        raise ValueError("Google OAuth response was not a JSON object")
    access_token = token_body.get("access_token")
    if not access_token:
        raise ValueError(
            "Google OAuth response did not contain an access token"
        )

    frontend_url = os.environ.get(
        "FRONTEND_URL",
        "https://prontuai-system.vercel.app",
    ).rstrip("/")
    link = f"{frontend_url}/esqueci-senha?token={quote(token)}"
    safe_link = html.escape(link, quote=True)
    safe_email = html.escape(email)

    message = EmailMessage()
    message["From"] = sender
    message["To"] = email
    message["Subject"] = "Redefinição de senha do ProntuAI"
    message.set_content(
        "Recebemos uma solicitação para redefinir sua senha do ProntuAI.\n\n"
        f"Acesse {link} em até 30 minutos. "
        "Se você não solicitou a redefinição, ignore esta mensagem."
    )
    html_body = (
        '<!doctype html><html lang="pt-BR"><head>'
        '<meta charset="utf-8">'
        '<meta name="viewport" '
        'content="width=device-width, initial-scale=1.0">'
        '</head><body style="margin:0;background:#f4f6f8;'
        'font-family:Arial,sans-serif;color:#202a35;">'
        '<table role="presentation" width="100%" cellspacing="0" '
        'cellpadding="0" '
        'style="padding:32px 12px;background:#f4f6f8;">'
        '<tr><td align="center">'
        '<table role="presentation" width="100%" cellspacing="0" '
        'cellpadding="0" '
        'style="max-width:560px;background:#fff;border-radius:8px;">'
        '<tr><td style="padding:36px 32px;">'
        '<h1 style="margin:0 0 20px;font-size:24px;">Redefina sua senha</h1>'
        '<p style="font-size:16px;line-height:1.6;">'
        'Recebemos uma solicitação para redefinir a senha da '
        'sua conta ProntuAI. '
        'Se foi você, use o botão abaixo. O link expira em 30 minutos.</p>'
        f'<p style="margin:28px 0;"><a href="{safe_link}" '
        'style="display:inline-block;padding:14px 22px;background:#087f8c;'
        'color:#fff;text-decoration:none;border-radius:5px;font-weight:bold;">'
        'Redefinir senha</a></p>'
        '<p style="font-size:14px;line-height:1.6;color:#52606d;">'
        f'Se o botão não funcionar, acesse: <a href="{safe_link}">'
        f'{safe_link}</a></p>'
        '<p style="font-size:14px;line-height:1.6;color:#52606d;">'
        f'Esta solicitação foi feita para {safe_email}. '
        'Se você não a iniciou, '
        'ignore este e-mail; sua senha permanecerá inalterada.</p>'
        '</td></tr></table></td></tr></table></body></html>'
    )
    message.add_alternative(
        html_body,
        subtype="html",
    )
    raw_message = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode("ascii").rstrip("=")

    response = requests.post(
        GMAIL_SEND_URL,
        json={"raw": raw_message},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=(5, 20),
    )
    response.raise_for_status()


async def send_password_reset_email(email: str, token: str) -> bool:
    required = (
        "GMAIL_CLIENT_ID",
        "GMAIL_CLIENT_SECRET",
        "GMAIL_REFRESH_TOKEN",
        "GMAIL_FROM_EMAIL",
    )
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        logger.error(
            "Password reset email not sent: missing Gmail configuration: %s",
            ", ".join(missing),
        )
        return False

    try:
        await asyncio.to_thread(_send, email, token)
        return True
    except (requests.RequestException, ValueError, KeyError):
        logger.exception(
            "Password reset email delivery through Gmail API failed"
        )
        return False
