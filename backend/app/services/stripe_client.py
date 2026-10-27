"""Stripe over its REST API: Checkout Sessions for paying an invoice, and checking that a webhook
really came from Stripe.

Stripe Checkout is Stripe's own hosted payment page: card details go to Stripe, never to
CarrierSafetyScan. Off until STRIPE_SECRET_KEY is set (test keys start sk_test_). Webhooks need
STRIPE_WEBHOOK_SECRET (whsec_...), from the endpoint added in Stripe's dashboard.
"""

import hashlib
import hmac
import json
import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.exceptions import PaymentUnavailableError

logger = logging.getLogger(__name__)

API = "https://api.stripe.com/v1"
TOLERANCE_SECONDS = 300  # a webhook older than this is refused (replays)


@dataclass(frozen=True)
class CheckoutLine:
    name: str
    description: str
    unit_amount: Decimal  # dollars
    quantity: int


@dataclass(frozen=True)
class CheckoutSession:
    id: str
    url: str


class StripeClient:
    def __init__(self, transport: httpx.BaseTransport | None = None) -> None:
        self.transport = transport  # tests replace Stripe

    def create_checkout(
        self,
        *,
        reference: str,
        lines: Sequence[CheckoutLine],
        customer_email: str | None,
        success_url: str,
        cancel_url: str,
        metadata: dict[str, str],
    ) -> CheckoutSession:
        key = get_settings().stripe_secret_key
        if not key:
            raise PaymentUnavailableError("Online payment isn't set up yet. Please contact STS.")
        form: dict[str, str] = {
            "mode": "payment",
            "client_reference_id": reference,
            "success_url": success_url,
            "cancel_url": cancel_url,
        }
        if customer_email:
            form["customer_email"] = customer_email
        for name, value in metadata.items():
            form[f"metadata[{name}]"] = value
            form[f"payment_intent_data[metadata][{name}]"] = value
        for i, line in enumerate(lines):
            prefix = f"line_items[{i}]"
            form[f"{prefix}[quantity]"] = str(line.quantity)
            form[f"{prefix}[price_data][currency]"] = "usd"
            form[f"{prefix}[price_data][unit_amount]"] = str(int(line.unit_amount * 100))
            form[f"{prefix}[price_data][product_data][name]"] = line.name
            if line.description:
                form[f"{prefix}[price_data][product_data][description]"] = line.description
        try:
            with httpx.Client(transport=self.transport, timeout=30.0) as client:
                response = client.post(f"{API}/checkout/sessions", data=form, auth=(key, ""))
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Stripe checkout failed: %s", type(exc).__name__)
            raise PaymentUnavailableError(
                "The payment page couldn't be opened. Please try again in a minute."
            ) from exc
        if response.status_code >= 400 or not data.get("url"):
            error = (data.get("error") or {}).get("message") or f"HTTP {response.status_code}"
            logger.warning("Stripe refused the checkout (%s): %s", response.status_code, error)
            raise PaymentUnavailableError(
                "The payment page couldn't be opened. Please contact STS."
            )
        return CheckoutSession(id=str(data["id"]), url=str(data["url"]))


def verify_webhook(payload: bytes, signature: str | None, now: float | None = None) -> Any:
    """The event, once the Stripe-Signature header is shown to match (Stripe's scheme: HMAC-SHA256
    of "{timestamp}.{payload}" with the endpoint's signing secret). None if it doesn't."""
    secret = get_settings().stripe_webhook_secret
    if not secret or not signature:
        return None
    parts = [p.split("=", 1) for p in signature.split(",") if "=" in p]
    timestamps = [v for k, v in parts if k == "t"]
    signatures = [v for k, v in parts if k == "v1"]
    if not timestamps or not signatures or not timestamps[0].isdigit():
        return None
    timestamp = int(timestamps[0])
    if abs((now if now is not None else time.time()) - timestamp) > TOLERANCE_SECONDS:
        return None
    expected = hmac.new(
        secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256
    ).hexdigest()
    if not any(hmac.compare_digest(expected, s) for s in signatures):
        return None
    try:
        return json.loads(payload)
    except ValueError:
        return None
