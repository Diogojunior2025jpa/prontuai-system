import logging
import os
from datetime import date, timedelta

from httpx import AsyncClient, HTTPError, HTTPStatusError

from lib.dates import today_iso

logger = logging.getLogger(__name__)


class AsaasNotConfigured(Exception):
    pass


class AsaasApiError(Exception):
    pass


def _configuration() -> tuple[str, str]:
    api_key = os.environ.get("ASAAS_API_KEY", "").strip()
    webhook_token = os.environ.get("ASAAS_WEBHOOK_TOKEN", "").strip()
    environment = os.environ.get("ASAAS_ENV", "sandbox").strip().lower()
    if not api_key or not webhook_token or environment not in {"sandbox", "production"}:
        raise AsaasNotConfigured
    base_url = (
        "https://api-sandbox.asaas.com/v3"
        if environment == "sandbox"
        else "https://api.asaas.com/v3"
    )
    return api_key, base_url


async def _request(method: str, path: str, *, json=None, params=None) -> dict:
    api_key, base_url = _configuration()
    try:
        async with AsyncClient(timeout=20.0) as client:
            response = await client.request(
                method,
                f"{base_url}{path}",
                headers={
                    "access_token": api_key,
                    "Content-Type": "application/json",
                    "User-Agent": "ProntuAI/1.0 (Python; FastAPI)",
                },
                json=json,
                params=params,
            )
            response.raise_for_status()
            body = response.json()
    except HTTPStatusError as exc:
        logger.warning("Asaas API returned HTTP %s", exc.response.status_code)
        raise AsaasApiError from exc
    except (HTTPError, ValueError) as exc:
        logger.warning("Asaas API request failed: %s", type(exc).__name__)
        raise AsaasApiError from exc
    if not isinstance(body, dict):
        logger.warning("Asaas API returned a non-object response")
        raise AsaasApiError
    return body


async def _get_or_create_customer(tenant: dict, admin: dict) -> str:
    if tenant.get("asaas_customer_id"):
        return tenant["asaas_customer_id"]

    external_reference = tenant["id"]
    customers = await _request(
        "GET",
        "/customers",
        params={"externalReference": external_reference, "limit": 1},
    )
    existing = customers.get("data") or []
    if existing and existing[0].get("id"):
        return existing[0]["id"]

    customer = await _request(
        "POST",
        "/customers",
        json={
            "name": admin["name"],
            "email": admin["email"],
            "externalReference": external_reference,
        },
    )
    customer_id = customer.get("id")
    if not customer_id:
        logger.warning("Asaas customer response did not include an ID")
        raise AsaasApiError
    return customer_id


async def _invoice_url(subscription_id: str) -> str | None:
    payments = await _request(
        "GET",
        f"/subscriptions/{subscription_id}/payments",
        params={"limit": 1, "offset": 0},
    )
    items = payments.get("data") or []
    if not items:
        return None
    invoice_url = items[0].get("invoiceUrl")
    if not isinstance(invoice_url, str) or not invoice_url.startswith("https://"):
        return None
    return invoice_url


async def create_asaas_checkout(tenant: dict, admin: dict, plan: dict) -> dict:
    customer_id = await _get_or_create_customer(tenant, admin)
    due_date = (date.fromisoformat(today_iso()) + timedelta(days=1)).isoformat()
    subscription = await _request(
        "POST",
        "/subscriptions",
        json={
            "customer": customer_id,
            "billingType": "UNDEFINED",
            "value": float(plan["price"]),
            "nextDueDate": due_date,
            "cycle": "MONTHLY",
            "description": f"ProntuAI - Plano {plan['name']}"[:500],
            "externalReference": tenant["id"],
        },
    )
    subscription_id = subscription.get("id")
    if not subscription_id:
        logger.warning("Asaas subscription response did not include an ID")
        raise AsaasApiError
    try:
        invoice_url = await _invoice_url(subscription_id)
    except AsaasApiError:
        logger.warning("Asaas subscription created but its invoice is not available yet")
        invoice_url = None
    return {
        "customer_id": customer_id,
        "subscription_id": subscription_id,
        "due_date": due_date,
        "invoice_url": invoice_url,
    }


async def get_asaas_invoice_url(subscription_id: str) -> str | None:
    return await _invoice_url(subscription_id)
