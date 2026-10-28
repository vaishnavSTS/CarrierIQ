"""CarrierSafetyScan invoices: created when a client pays for a Compliance tab service, paid on
Stripe Checkout, marked paid (or refunded) by Stripe's webhook.

- A client sees their own company's invoices; STS staff see every invoice and can void an
  unpaid one.
- Paying opens a fresh Stripe Checkout session each time (a session expires after 24 hours).
- When Stripe confirms a payment, the client who asked is emailed the paid invoice's link and STS
  is told. A webhook delivered twice changes nothing the second time.
"""

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.models import Address, Carrier, Invoice, InvoiceLine, Organization, Phone, User
from app.models.enums import AddressType, InvoiceStatus
from app.schemas.invoice import InvoiceLineOut, InvoiceOut, InvoiceSummaryOut
from app.services.dataqs_email import Attachment, EmailSender, get_email_sender
from app.services.dataqs_notifications import render_html
from app.services.invoice_pdf import render_invoice_pdf
from app.services.stripe_client import CheckoutLine, StripeClient

logger = logging.getLogger(__name__)

# Printed on every invoice ("From") and its footer.
ISSUER = {
    "name": "Sky Transport Solutions",
    "street": "121 East 11th Street",
    "city_state_zip": "TRACY, CA 95376",
    "phone": "(800) 498-9820",
    "email": "info@skytransportsolutions.com",
}
DISPUTE_POLICY = (
    "If you have any questions or concerns about this invoice, please contact us directly so we "
    "can resolve them. If a payment is disputed or a chargeback is initiated with your bank or "
    "credit card provider, a $35 administrative fee will be added to your account to cover "
    "associated bank charges."
)


@dataclass(frozen=True)
class NewLine:
    item: str
    description: str
    quantity: int
    rate: Decimal


def _now() -> datetime:
    return datetime.now(UTC)


def _pdf_name(invoice: Invoice) -> str:
    return f"invoice-{invoice.number}.pdf"


def _pretty_phone(digits: str | None) -> str | None:
    d = "".join(c for c in digits or "" if c.isdigit())[-10:]
    return f"({d[:3]}) {d[3:6]}-{d[6:]}" if len(d) == 10 else (digits or None)


def _money(value: Decimal) -> str:
    return f"${value:,.2f}"


class InvoiceService:
    def __init__(self, db: Session, now: Callable[[], datetime] = _now) -> None:
        self.db = db
        self.now = now

    # --- Creating and paying -------------------------------------------------------------------

    def bill_to(
        self, usdot_number: int | None, user: User, company: str | None = None
    ) -> dict[str, Any]:
        """Who an invoice is printed to: the carrier (FMCSA's name and physical address) and the
        client who ordered it (their phone, else the carrier's; their email and the carrier's).
        Without a USDOT (a brokerage's subscription): `company` and the user's own details."""
        carrier = (
            self.db.scalar(select(Carrier).where(Carrier.usdot_number == usdot_number))
            if usdot_number
            else None
        )
        address = (
            self.db.scalar(
                select(Address)
                .where(
                    Address.carrier_id == carrier.id,
                    Address.address_type == AddressType.PHYSICAL,
                )
                .limit(1)
            )
            if carrier
            else None
        )
        phone = (
            self.db.scalar(
                select(Phone.number_normalized).where(Phone.carrier_id == carrier.id).limit(1)
            )
            if carrier
            else None
        )
        state = address.state.strip().upper() if address and address.state else None
        place = [
            f"{address.city}," if address and address.city else None,
            state,
            address.zip if address else None,
        ]
        return {
            "name": (carrier.legal_name if carrier else None) or company or f"USDOT {usdot_number}",
            "street": address.street if address else None,
            "city_state_zip": " ".join(p for p in place if p) or None,
            "phone": _pretty_phone(user.phone or phone),
            "emails": sorted({e for e in [user.email, carrier.email if carrier else None] if e}),
            "usdot_number": usdot_number,
        }

    def create(
        self,
        *,
        user: User,
        organization_id: int,
        usdot_number: int | None,
        bill_to: dict[str, Any],
        lines: Sequence[NewLine],
    ) -> Invoice:
        """In the caller's transaction (flushed, not committed)."""
        invoice = Invoice(
            organization_id=organization_id,
            usdot_number=usdot_number,
            status=InvoiceStatus.UNPAID,
            bill_to=bill_to,
            total=sum((line.rate * line.quantity for line in lines), Decimal("0")),
            created_by_id=user.id,
        )
        self.db.add(invoice)
        self.db.flush()
        for position, line in enumerate(lines, start=1):
            self.db.add(
                InvoiceLine(
                    invoice_id=invoice.id,
                    position=position,
                    item=line.item,
                    description=line.description,
                    quantity=line.quantity,
                    rate=line.rate,
                    amount=line.rate * line.quantity,
                )
            )
        self.db.flush()
        self.db.refresh(invoice)  # the number comes from the database sequence
        return invoice

    def checkout(
        self,
        invoice: Invoice,
        customer_email: str | None,
        stripe: StripeClient,
        cancel_url: str,
        success_url: str | None = None,
    ) -> str:
        """A fresh Stripe Checkout session for an unpaid invoice; answers its URL. After paying,
        Stripe sends the client to `success_url` (default: the invoice's page)."""
        if invoice.status != InvoiceStatus.UNPAID:
            raise ConflictError(f"Invoice {invoice.number} is {invoice.status.value.lower()}")
        app_url = get_settings().public_app_url.rstrip("/")
        session = stripe.create_checkout(
            reference=str(invoice.id),
            lines=[
                CheckoutLine(line.item, line.description, line.rate, line.quantity)
                for line in self._lines(invoice.id)
            ],
            customer_email=customer_email,
            success_url=success_url or f"{app_url}/portal/invoices/{invoice.id}?paid=1",
            cancel_url=cancel_url,
            metadata={"invoice_id": str(invoice.id), "invoice_number": str(invoice.number)},
        )
        invoice.stripe_session_id = session.id
        self.db.commit()
        return session.url

    def pay(self, user: User, invoice_id: int, stripe: StripeClient) -> str:
        """A client pays their own company's unpaid invoice."""
        invoice = self._visible(user, invoice_id)
        if not user.role.is_client:
            raise ForbiddenError("Clients pay their invoices from the client portal")
        app_url = get_settings().public_app_url.rstrip("/")
        return self.checkout(invoice, user.email, stripe, f"{app_url}/portal/invoices/{invoice.id}")

    def void(self, user: User, invoice_id: int) -> InvoiceOut:
        if not user.role.is_staff:
            raise ForbiddenError("Only STS staff void invoices")
        invoice = self._visible(user, invoice_id)
        if invoice.status != InvoiceStatus.UNPAID:
            raise ConflictError("Only an unpaid invoice can be voided; refund a paid one in Stripe")
        invoice.status, invoice.voided_at, invoice.voided_by_id = (
            InvoiceStatus.VOID,
            self.now(),
            user.id,
        )
        self.db.commit()
        return self.detail(user, invoice.id)

    # --- Stripe webhook ------------------------------------------------------------------------

    def handle_event(self, event: dict[str, Any], sender: EmailSender | None = None) -> str:
        """Apply one Stripe event; answers what was done (for the log)."""
        kind = event.get("type")
        obj = (event.get("data") or {}).get("object") or {}
        if kind == "checkout.session.completed":
            if obj.get("payment_status") != "paid":
                return "not paid yet"
            invoice = self._from_metadata(obj)
            if invoice is None:
                return "no such invoice"
            if invoice.status == InvoiceStatus.PAID:
                return "already paid"
            if invoice.status == InvoiceStatus.VOID:
                logger.warning("Invoice %s was paid after it was voided", invoice.number)
            invoice.status, invoice.paid_at = InvoiceStatus.PAID, self.now()
            invoice.stripe_session_id = str(obj.get("id") or invoice.stripe_session_id)
            invoice.stripe_payment_intent = obj.get("payment_intent") or None
            self.db.commit()
            from app.services.dataqs_fee import hand_to_sts  # (import cycle)

            hand_to_sts(self.db, invoice, self.now())  # a DataQs fee: the case goes to STS
            self._tell_paid(invoice, sender)
            return "paid"
        if kind == "charge.refunded":
            if not obj.get("refunded"):  # a partial refund leaves it paid
                return "partly refunded"
            invoice = self.db.scalar(
                select(Invoice).where(Invoice.stripe_payment_intent == obj.get("payment_intent"))
            )
            if invoice is None or invoice.status == InvoiceStatus.REFUNDED:
                return "nothing to do"
            invoice.status, invoice.refunded_at = InvoiceStatus.REFUNDED, self.now()
            self.db.commit()
            return "refunded"
        return "ignored"

    def _from_metadata(self, obj: dict[str, Any]) -> Invoice | None:
        invoice_id = (obj.get("metadata") or {}).get("invoice_id") or obj.get("client_reference_id")
        if invoice_id and str(invoice_id).isdigit():
            return self.db.get(Invoice, int(invoice_id))
        return None

    def record_paid(
        self,
        *,
        user: User,
        usdot_number: int | None,
        bill_to: dict[str, Any],
        lines: Sequence[NewLine],
        stripe_reference: str,
        client_note: str,
        sender: EmailSender | None,
    ) -> Invoice:
        """An invoice for a payment Stripe already took (a subscription month): created PAID for
        the user's company, then emailed with its PDF like any paid invoice. `stripe_reference`
        (Stripe's own invoice id, kept in stripe_session_id) makes a repeated webhook a no-op."""
        existing = self.db.scalar(
            select(Invoice).where(Invoice.stripe_session_id == stripe_reference)
        )
        if existing is not None:
            return existing
        invoice = self.create(
            user=user,
            organization_id=user.organization_id,
            usdot_number=usdot_number,
            bill_to=bill_to,
            lines=lines,
        )
        invoice.status, invoice.paid_at = InvoiceStatus.PAID, self.now()
        invoice.stripe_session_id = stripe_reference
        self.db.commit()
        self._tell_paid(invoice, sender, client_note)
        return invoice

    def _tell_paid(
        self, invoice: Invoice, sender: EmailSender | None, client_note: str | None = None
    ) -> None:
        """Email the client who created it (their paid invoice) and STS. Never fails the webhook.
        While DATAQS_EMAIL_STAFF_OVERRIDE is set (testing), the client's email goes to those
        addresses instead, saying who it was meant for; nobody outside STS is emailed."""
        sender = sender or get_email_sender()
        settings = get_settings()
        if sender is None:
            return
        client = self.db.get(User, invoice.created_by_id)
        total = _money(invoice.total)
        whose = f"USDOT {invoice.usdot_number}" if invoice.usdot_number else invoice.bill_to["name"]
        messages = []
        if client is not None:
            note = client_note or (
                f"Thank you. We received your payment of {total} for invoice {invoice.number} "
                f"({whose}). Sky Transport Solutions will start on it and contact you if "
                "anything is needed."
            )
            body = f"{note}\n\nYour paid invoice is attached as a PDF."
            to = [client.email]
            if settings.dataqs_staff_override_list:
                body = f"[Test routing: meant for {client.email}]\n\n{body}"
                to = settings.dataqs_staff_override_list
            messages.append((to, f"Payment received: invoice {invoice.number}", body))
        staff_to = settings.compliance_request_recipients
        if staff_to:
            body = (
                f"Invoice {invoice.number} ({total}) for {whose} was paid "
                f"through Stripe by {client.full_name if client else 'the client'}, for: "
                + "; ".join(f"{line.item} ({line.description})" for line in self._lines(invoice.id))
                + "."
            )
            messages.append((staff_to, f"Paid: invoice {invoice.number}, {total}", body))
        # The paid invoice as a PDF goes with each email (built once), so no link to it.
        pdf = Attachment(
            _pdf_name(invoice), "application/pdf", render_invoice_pdf(self._document(invoice))
        )
        for to, subject, body in messages:
            try:
                sender.send(
                    to=to,
                    subject=subject,
                    text=body,
                    html=render_html(body, None, ""),
                    idempotency_key=f"invoice-{invoice.id}-paid-{to[0]}",
                    attachments=[pdf],
                )
            except Exception:  # noqa: BLE001 - the payment is recorded either way
                logger.warning("Invoice %s: paid email to %s failed", invoice.number, to[0])

    # --- Reading -------------------------------------------------------------------------------

    def _visible(self, user: User, invoice_id: int) -> Invoice:
        invoice = self.db.get(Invoice, invoice_id)
        if invoice is None or not (
            user.role.is_staff
            or (
                (user.role.is_client or user.role.is_broker)
                and invoice.organization_id == user.organization_id
            )
        ):
            raise NotFoundError(f"Invoice {invoice_id} not found")
        return invoice

    def _lines(self, invoice_id: int) -> list[InvoiceLine]:
        return list(
            self.db.scalars(
                select(InvoiceLine)
                .where(InvoiceLine.invoice_id == invoice_id)
                .order_by(InvoiceLine.position)
            )
        )

    def detail(self, user: User, invoice_id: int) -> InvoiceOut:
        invoice = self._visible(user, invoice_id)
        return self._document(
            invoice,
            can_pay=user.role.is_client and invoice.status == InvoiceStatus.UNPAID,
            can_void=user.role.is_staff and invoice.status == InvoiceStatus.UNPAID,
        )

    def pdf(self, user: User, invoice_id: int) -> tuple[str, bytes]:
        """The invoice as a PDF file: (file name, bytes)."""
        invoice = self._visible(user, invoice_id)
        return _pdf_name(invoice), render_invoice_pdf(self._document(invoice))

    def _document(
        self, invoice: Invoice, *, can_pay: bool = False, can_void: bool = False
    ) -> InvoiceOut:
        return InvoiceOut(
            **self._summary(invoice).model_dump(),
            issuer=ISSUER,
            bill_to=invoice.bill_to,
            lines=[
                InvoiceLineOut(
                    position=line.position,
                    item=line.item,
                    description=line.description,
                    quantity=line.quantity,
                    rate=line.rate,
                    amount=line.amount,
                )
                for line in self._lines(invoice.id)
            ],
            dispute_policy=DISPUTE_POLICY,
            can_pay=can_pay,
            can_void=can_void,
        )

    def list_all(
        self, user: User, status: InvoiceStatus | None, usdot_number: int | None = None
    ) -> list[InvoiceSummaryOut]:
        """Staff: every invoice, or one carrier's. Clients: their own company's invoices for one
        carrier (its profile's Invoices tab). Brokers: their own brokerage's (subscription)."""
        query = select(Invoice).order_by(Invoice.number.desc())
        if (user.role.is_client and usdot_number is not None) or user.role.is_broker:
            query = query.where(Invoice.organization_id == user.organization_id)
        elif not user.role.is_staff:
            raise ForbiddenError("This area is for STS staff")
        if status is not None:
            query = query.where(Invoice.status == status)
        if usdot_number is not None:
            query = query.where(Invoice.usdot_number == usdot_number)
        return [self._summary(i) for i in self.db.scalars(query)]

    def _summary(self, invoice: Invoice) -> InvoiceSummaryOut:
        org = self.db.scalar(
            select(Organization.name).where(Organization.id == invoice.organization_id)
        )
        return InvoiceSummaryOut(
            id=invoice.id,
            number=invoice.number,
            status=invoice.status,
            organization_name=org,
            usdot_number=invoice.usdot_number,
            billed_to=str(invoice.bill_to.get("name") or ""),
            total=invoice.total,
            issued_at=invoice.created_at,
            paid_at=invoice.paid_at,
            voided_at=invoice.voided_at,
            refunded_at=invoice.refunded_at,
        )
