"""Creating an invoice on STS's website (skytransportsolutions.com,
EXTERNAL-CREATE-INVOICE-API.md: POST /api/create-invoice-external.ashx).

The website finds the client company by USDOT number (or creates it from `company`), creates the
invoice and answers with its payment page. Auth: STS_INVOICE_API_TOKEN (the website's
ExternalInvoiceApiToken), sent in the JSON body as the API requires, so it is never in a URL or
the request logs. Off until the token is set.
"""

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.exceptions import ConflictError, InvoiceUnavailableError, ValidationError

logger = logging.getLogger(__name__)

SOURCE = "carriersafetyscan"


@dataclass(frozen=True)
class InvoiceLine:
    service_id: int
    amount: Decimal  # the rate
    quantity: int
    description: str


@dataclass(frozen=True)
class Company:
    """Used only if the website has no active company with the USDOT number yet."""

    name: str
    email: str
    phone: str
    contact_name: str
    state: str | None = None


@dataclass(frozen=True)
class Invoice:
    invoice_id: int
    invoice_no: int | None
    amount: Decimal
    payment_url: str


def _https(url: str) -> str:
    return "https://" + url[len("http://") :] if url.startswith("http://") else url


class StsInvoiceClient:
    def __init__(self, transport: httpx.BaseTransport | None = None) -> None:
        self.transport = transport  # tests replace the website

    def create(
        self,
        *,
        usdot_number: int,
        company: Company,
        line: InvoiceLine,
        note: str,
        internal_note: str,
    ) -> Invoice:
        settings = get_settings()
        if not settings.sts_invoice_api_token:
            raise InvoiceUnavailableError("Online payment isn't set up yet. Please contact STS.")
        body: dict[str, Any] = {
            "token": settings.sts_invoice_api_token,
            "dot": str(usdot_number),
            "source": SOURCE,
            "created_by": 0,
            "company": {
                "name": company.name,
                "email": company.email,
                "phone": company.phone,
                "contact_name": company.contact_name,
                **({"state": company.state} if company.state else {}),
            },
            "note": note,
            "internal_note": internal_note,
            "services": [
                {
                    "service_id": line.service_id,
                    "amount": float(line.amount),
                    "qnt": line.quantity,
                    "description": line.description,
                }
            ],
        }
        try:
            with httpx.Client(transport=self.transport, timeout=30.0) as client:
                response = client.post(settings.sts_invoice_api_url, json=body)
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("STS invoice API failed: %s", type(exc).__name__)
            raise InvoiceUnavailableError(
                "STS's payment system couldn't be reached. Please try again in a minute."
            ) from exc

        if response.status_code == 200 and data.get("success") and data.get("payment_url"):
            return Invoice(
                invoice_id=int(data["invoice_id"]),
                invoice_no=int(data["invoice_no"]) if data.get("invoice_no") else None,
                amount=Decimal(str(data.get("amount", 0))),
                payment_url=_https(str(data["payment_url"])),
            )

        message = str(data.get("message") or data.get("error") or f"HTTP {response.status_code}")
        logger.warning("STS invoice API refused (%s): %s", response.status_code, message)
        code = data.get("code")
        if code == "already_exists":
            raise ConflictError(
                "There's already an invoice for this service. Check your email for its payment "
                "link, or contact STS."
            )
        if code == "dot_ambiguous":
            raise ConflictError(
                "STS needs to fix your company's record before you can pay online. Please contact "
                "STS."
            )
        if response.status_code == 400:
            raise ValidationError(f"STS's payment system couldn't create the invoice: {message}")
        raise InvoiceUnavailableError(
            "STS's payment system isn't available right now. Please try again later."
        )
