"""Small SMTP mailer used for account recovery."""

import asyncio
import os
import smtplib
from email.message import EmailMessage
from urllib.parse import quote


def email_is_configured() -> bool:
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "").strip()
    return bool(
        os.environ.get("SMTP_HOST", "").strip()
        and os.environ.get("SMTP_FROM", "").strip()
        and (not username or password)
    )


def _send(message: EmailMessage) -> None:
    host = os.environ["SMTP_HOST"].strip()
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    use_ssl = os.environ.get("SMTP_USE_SSL", "").lower() in {"1", "true", "yes"} or port == 465

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=20) as server:
            if username:
                server.login(username, password)
            server.send_message(message)
        return

    with smtplib.SMTP(host, port, timeout=20) as server:
        if os.environ.get("SMTP_STARTTLS", "true").lower() in {"1", "true", "yes"}:
            server.starttls()
        if username:
            server.login(username, password)
        server.send_message(message)


async def send_password_reset_email(email: str, token: str) -> None:
    frontend_url = os.environ.get("FRONTEND_URL", "https://prontuai-system.vercel.app").rstrip("/")
    link = f"{frontend_url}/esqueci-senha?token={quote(token)}"
    message = EmailMessage()
    message["Subject"] = "Redefinição de senha do ProntuAI"
    message["From"] = os.environ["SMTP_FROM"].strip()
    message["To"] = email
    message.set_content(
        "Recebemos uma solicitação para redefinir sua senha do ProntuAI.\n\n"
        f"Acesse este link em até 30 minutos: {link}\n\n"
        "Se você não solicitou a redefinição, ignore esta mensagem."
    )
    await asyncio.to_thread(_send, message)
