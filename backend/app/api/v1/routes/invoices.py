"""CarrierSafetyScan invoices, and Stripe's webhook that marks them paid or refunded.

Clients: their own company's invoices, and paying one (Stripe Checkout). STS staff: every invoice,
and voiding an unpaid one. The webhook has no login: each request must carry a valid
Stripe-Signature for STRIPE_WEBHOOK_SECRET, or it is refused.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_staff
from app.api.v1.routes.compliance import get_request_email_sender, get_stripe_client
from app.core.exceptions import ForbiddenError
from app.db.session import get_db
from app.models import User
from app.models.enums import InvoiceStatus
from app.schemas.invoice import InvoiceListOut, InvoiceOut, InvoicePayOut
from app.services.dataqs_email import EmailSender
from app.services.invoice_service import InvoiceService
from app.services.stripe_client import StripeClient, verify_webhook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["invoices"])
webhook_router = APIRouter(prefix="/webhooks/stripe", tags=["webhooks"])

Db = Annotated[Session, Depends(get_db)]
InvoiceId = Annotated[int, Path(gt=0)]


@router.get("", response_model=InvoiceListOut)
def list_invoices(
    user: CurrentUser,
    db: Db,
    status: InvoiceStatus | None = None,
    usdot_number: Annotated[int | None, Query(gt=0, lt=100_000_000)] = None,
) -> InvoiceListOut:
    """Newest first. STS: every invoice, or one carrier's. Clients: their own company's
    invoices for one carrier (usdot_number required)."""
    return InvoiceListOut(invoices=InvoiceService(db).list_all(user, status, usdot_number))


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: InvoiceId, user: CurrentUser, db: Db) -> InvoiceOut:
    """The invoice as printed (a client's own company's, or any for staff)."""
    return InvoiceService(db).detail(user, invoice_id)


@router.get("/{invoice_id}/pdf")
def invoice_pdf(invoice_id: InvoiceId, user: CurrentUser, db: Db) -> Response:
    """The invoice as a PDF download."""
    name, data = InvoiceService(db).pdf(user, invoice_id)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/{invoice_id}/pay", response_model=InvoicePayOut)
def pay_invoice(
    invoice_id: InvoiceId,
    user: CurrentUser,
    db: Db,
    stripe: Annotated[StripeClient, Depends(get_stripe_client)],
) -> InvoicePayOut:
    """A client pays their unpaid invoice: answers a Stripe Checkout page."""
    return InvoicePayOut(url=InvoiceService(db).pay(user, invoice_id, stripe))


@router.post("/{invoice_id}/void", response_model=InvoiceOut)
def void_invoice(
    invoice_id: InvoiceId, user: Annotated[User, Depends(require_staff)], db: Db
) -> InvoiceOut:
    """STS: cancel an unpaid invoice."""
    return InvoiceService(db).void(user, invoice_id)


@webhook_router.post("")
async def stripe_webhook(
    request: Request,
    db: Db,
    sender: Annotated[EmailSender | None, Depends(get_request_email_sender)],
    stripe_signature: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    """Stripe's events: checkout.session.completed (paid) and charge.refunded."""
    event = verify_webhook(await request.body(), stripe_signature)
    if event is None:
        raise ForbiddenError("Not a valid Stripe webhook")
    result = InvoiceService(db).handle_event(event, sender)
    logger.info("Stripe event %s (%s): %s", event.get("id"), event.get("type"), result)
    return {"result": result}
