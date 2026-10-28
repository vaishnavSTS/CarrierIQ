"""The Compliance tab: a carrier's UCR status, and clients asking STS for help with a compliance
service. A request is saved (staff see and handle it in the internal portal) and emailed to STS
(COMPLIANCE_REQUEST_EMAIL) as soon as it is saved."""

import logging
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import (
    ForbiddenError,
    NotFoundError,
    PaymentUnavailableError,
    ValidationError,
)
from app.models import (
    Address,
    Carrier,
    ComplianceRequest,
    Invoice,
    Organization,
    OrganizationCarrier,
    User,
)
from app.models.enums import (
    AddressType,
    ComplianceRequestStatus,
    ComplianceService,
    InvoiceStatus,
)
from app.schemas.compliance import (
    ComplianceCheckoutIn,
    CompliancePricesOut,
    ComplianceRequestIn,
    ComplianceRequestOut,
    PriceOptionOut,
    ServicePriceOut,
    UcrStatusOut,
    UcrYearOut,
)
from app.services.compliance_pricing import PRICES, quote, suggest
from app.services.dataqs_email import EmailSender, get_email_sender
from app.services.dataqs_notifications import render_html
from app.services.invoice_service import InvoiceService, NewLine
from app.services.stripe_client import StripeClient
from app.services.ucr_service import UcrService, required_years

logger = logging.getLogger(__name__)

SERVICE_LABELS: dict[ComplianceService, str] = {
    ComplianceService.DOT_MC_AUTHORITY: "DOT / MC authority reactivation",
    ComplianceService.UCR: "UCR registration filing",
    ComplianceService.CA_MCP: "California Motor Carrier Permit (MCP)",
    ComplianceService.DRUG_ALCOHOL: "Drug & alcohol testing consortium enrollment",
    ComplianceService.DRIVER_FILES: "Driver qualification files (new hires)",
    ComplianceService.MVR: "MVR report",
    ComplianceService.BACKGROUND_CHECK: "Criminal background check",
    ComplianceService.GOOD_STANDING: "Certificate of good standing",
    ComplianceService.CLEARINGHOUSE: "Clearinghouse registration",
}


# The invoice line's item, as on STS's invoices (the option is added in brackets).
ITEM_NAMES: dict[ComplianceService, str] = {
    ComplianceService.DOT_MC_AUTHORITY: "DOT / MC AUTHORITY",
    ComplianceService.UCR: "UCR",
    ComplianceService.CA_MCP: "CALIFORNIA MCP",
    ComplianceService.DRIVER_FILES: "DRIVER QUALIFICATION FILES",
    ComplianceService.MVR: "MVR REPORT",
    ComplianceService.GOOD_STANDING: "CERTIFICATE OF GOOD STANDING",
}


def _option_label(request: ComplianceRequest) -> str | None:
    price = PRICES.get(request.service)
    if price is None or request.option_key is None:
        return None
    return next((o.label for o in price.options if o.key == request.option_key), None)


def _now() -> datetime:
    return datetime.now(UTC)


class CarrierComplianceService:
    def __init__(self, db: Session, now: Callable[[], datetime] = _now) -> None:
        self.db = db
        self.now = now

    # --- Who may see a carrier's compliance ------------------------------------------------------

    def ensure_can_see(self, user: User, usdot_number: int) -> None:
        """STS staff: any carrier. Clients: carriers linked to their company."""
        if user.role.is_staff:
            return
        if not user.role.is_client or usdot_number not in self._linked(user.organization_id):
            raise NotFoundError(f"USDOT {usdot_number} is not one of your carriers")

    def _linked(self, organization_id: int) -> set[int]:
        return set(
            self.db.scalars(
                select(OrganizationCarrier.usdot_number).where(
                    OrganizationCarrier.organization_id == organization_id
                )
            )
        )

    # --- UCR -------------------------------------------------------------------------------------

    def ucr(self, user: User, usdot_number: int, checker: UcrService | None = None) -> UcrStatusOut:
        self.ensure_can_see(user, usdot_number)
        status = (checker or UcrService()).status(usdot_number)
        current, upcoming = required_years(self.now().date())
        paid = {y.year for y in status.years if y.fee_paid}
        return UcrStatusOut(
            usdot_number=usdot_number,
            current_year=current,
            registered_current=current in paid if status.error is None else None,
            next_year=upcoming,
            registered_next=(upcoming in paid if upcoming else None)
            if status.error is None
            else None,
            years=[
                UcrYearOut(year=y.year, fee_paid=y.fee_paid, updated=y.updated)
                for y in status.years
            ],
            checked_at=status.checked_at,
            error=status.error,
            source_url=f"https://safer.fmcsa.dot.gov/UCRQuery.aspx?DOT_NUMBER={usdot_number}",
        )

    # --- Requests --------------------------------------------------------------------------------

    def create(self, user: User, usdot_number: int, body: ComplianceRequestIn) -> ComplianceRequest:
        if not user.role.is_client:
            raise ForbiddenError("Service requests come from clients")
        self.ensure_can_see(user, usdot_number)
        request = ComplianceRequest(
            organization_id=user.organization_id,
            usdot_number=usdot_number,
            service=body.service,
            note=(body.note or "").strip() or None,
            status=ComplianceRequestStatus.OPEN,
            requested_by_id=user.id,
        )
        self.db.add(request)
        self.db.commit()
        return request

    def for_carrier(self, user: User, usdot_number: int) -> list[ComplianceRequestOut]:
        """Requests about a carrier: a client's own company's, or (staff) every company's."""
        self.ensure_can_see(user, usdot_number)
        query = select(ComplianceRequest).where(ComplianceRequest.usdot_number == usdot_number)
        if not user.role.is_staff:
            query = query.where(ComplianceRequest.organization_id == user.organization_id)
        return self._out(list(self.db.scalars(query.order_by(ComplianceRequest.id.desc()))))

    def all_requests(
        self, user: User, status: ComplianceRequestStatus | None
    ) -> list[ComplianceRequestOut]:
        if not user.role.is_staff:
            raise ForbiddenError("This area is for STS staff")
        query = select(ComplianceRequest)
        if status is not None:
            query = query.where(ComplianceRequest.status == status)
        return self._out(list(self.db.scalars(query.order_by(ComplianceRequest.id.desc()))))

    def mark_handled(self, user: User, request_id: int) -> ComplianceRequestOut:
        if not user.role.is_staff:
            raise ForbiddenError("This area is for STS staff")
        request = self.db.get(ComplianceRequest, request_id)
        if request is None:
            raise NotFoundError(f"Service request {request_id} not found")
        if request.status != ComplianceRequestStatus.HANDLED:
            request.status = ComplianceRequestStatus.HANDLED
            request.handled_by_id, request.handled_at = user.id, self.now()
            self.db.commit()
        return self._out([request])[0]

    def _out(self, requests: list[ComplianceRequest]) -> list[ComplianceRequestOut]:
        user_ids = {r.requested_by_id for r in requests} | {
            r.handled_by_id for r in requests if r.handled_by_id
        }
        users = {u.id: u for u in self.db.scalars(select(User).where(User.id.in_(user_ids)))}
        org_ids = {r.organization_id for r in requests}
        orgs = dict(
            self.db.execute(
                select(Organization.id, Organization.name).where(Organization.id.in_(org_ids))
            ).all()
        )
        invoice_ids = {r.invoice_id for r in requests if r.invoice_id}
        invoices = {
            i.id: i for i in self.db.scalars(select(Invoice).where(Invoice.id.in_(invoice_ids)))
        }
        out = []
        for r in requests:
            by = users.get(r.requested_by_id)
            invoice = invoices.get(r.invoice_id) if r.invoice_id else None
            handler = users.get(r.handled_by_id) if r.handled_by_id else None
            out.append(
                ComplianceRequestOut(
                    id=r.id,
                    usdot_number=r.usdot_number,
                    service=r.service,
                    service_label=SERVICE_LABELS[r.service],
                    note=r.note,
                    status=r.status,
                    organization_name=orgs.get(r.organization_id),
                    requested_by_name=by.full_name if by else None,
                    requested_by_email=by.email if by else None,
                    requested_by_phone=by.phone if by else None,
                    created_at=r.created_at,
                    handled_by_name=handler.full_name if handler else None,
                    handled_at=r.handled_at,
                    email_error=r.email_error,
                    option_label=_option_label(r),
                    quantity=r.quantity,
                    amount=r.amount,
                    invoice_id=invoice.id if invoice else None,
                    invoice_number=invoice.number if invoice else None,
                    invoice_status=invoice.status if invoice else None,
                    sts_invoice_no=r.sts_invoice_no,
                    sts_payment_url=r.sts_payment_url,
                )
            )
        return out

    # --- Paying online ---------------------------------------------------------------------------

    def prices(self, user: User, usdot_number: int) -> CompliancePricesOut:
        """The services paid online for this carrier, each with the option that fits its FMCSA
        fleet or driver count. The California MCP only for California-based carriers."""
        self.ensure_can_see(user, usdot_number)
        carrier = self._carrier(usdot_number)
        californian = self._state(carrier) == "CA"
        services = []
        for service, price in PRICES.items():
            if service == ComplianceService.CA_MCP and not californian:
                continue
            units = (
                None
                if carrier is None
                else carrier.driver_count
                if price.per_driver
                else carrier.fleet_size
            )
            services.append(
                ServicePriceOut(
                    service=service,
                    options=[
                        PriceOptionOut(
                            key=o.key,
                            label=o.label,
                            amount=o.amount,
                            min_units=o.min_units,
                            max_units=o.max_units,
                        )
                        for o in price.options
                    ],
                    per_driver=price.per_driver,
                    note=price.note,
                    too_big=price.too_big,
                    suggested=suggest(price, units),
                    drivers=carrier.driver_count if carrier and price.per_driver else None,
                )
            )
        return CompliancePricesOut(services=services)

    def checkout(
        self,
        user: User,
        usdot_number: int,
        body: ComplianceCheckoutIn,
        stripe: StripeClient,
    ) -> tuple[ComplianceRequest, str, bool]:
        """Create the invoice (CarrierSafetyScan's own) and save the request; answers a Stripe
        Checkout URL and whether the invoice is new. The same open request (same option and
        drivers) with its invoice still unpaid reuses that invoice instead of a new one."""
        if not user.role.is_client:
            raise ForbiddenError("Service requests come from clients")
        self.ensure_can_see(user, usdot_number)
        if not get_settings().stripe_secret_key:  # before any invoice is made
            raise PaymentUnavailableError("Online payment isn't set up yet. Please contact STS.")
        carrier = self._carrier(usdot_number)
        address = self._physical(carrier)
        state = address.state.strip().upper() if address and address.state else None
        if body.service == ComplianceService.CA_MCP and state != "CA":
            raise ValidationError("The California MCP is for carriers based in California")
        q = quote(body.service, body.option, body.drivers)
        price = PRICES[body.service]
        quantity = q.quantity if price.per_driver else None
        invoices = InvoiceService(self.db, self.now)
        app_url = get_settings().public_app_url.rstrip("/")
        cancel_url = f"{app_url}/portal/carriers/{usdot_number}?tab=compliance"

        existing = self.db.scalar(
            select(ComplianceRequest)
            .join(Invoice, Invoice.id == ComplianceRequest.invoice_id)
            .where(
                ComplianceRequest.organization_id == user.organization_id,
                ComplianceRequest.usdot_number == usdot_number,
                ComplianceRequest.service == body.service,
                ComplianceRequest.status == ComplianceRequestStatus.OPEN,
                ComplianceRequest.option_key == q.option.key,
                ComplianceRequest.quantity.is_(None)
                if quantity is None
                else ComplianceRequest.quantity == quantity,
                Invoice.status == InvoiceStatus.UNPAID,
            )
            .order_by(ComplianceRequest.id.desc())
            .limit(1)
        )
        if existing is not None and existing.invoice_id is not None:
            invoice = self.db.get(Invoice, existing.invoice_id)
            assert invoice is not None
            return existing, invoices.checkout(invoice, user.email, stripe, cancel_url), False

        item = ITEM_NAMES[body.service] + (
            f" ({q.option.label.upper()})" if len(price.options) > 1 else ""
        )
        invoice = invoices.create(
            user=user,
            organization_id=user.organization_id,
            usdot_number=usdot_number,
            bill_to=invoices.bill_to(usdot_number, user),
            lines=[
                NewLine(
                    item=item,
                    description="Per driver" if price.per_driver else "Service",
                    quantity=q.quantity,
                    rate=q.option.amount,
                )
            ],
        )
        request = ComplianceRequest(
            organization_id=user.organization_id,
            usdot_number=usdot_number,
            service=body.service,
            note=(body.note or "").strip() or None,
            status=ComplianceRequestStatus.OPEN,
            requested_by_id=user.id,
            option_key=q.option.key,
            quantity=quantity,
            amount=q.total,
            invoice_id=invoice.id,
        )
        self.db.add(request)
        self.db.commit()
        return request, invoices.checkout(invoice, user.email, stripe, cancel_url), True

    def _carrier(self, usdot_number: int) -> Carrier | None:
        return self.db.scalar(select(Carrier).where(Carrier.usdot_number == usdot_number))

    def _physical(self, carrier: Carrier | None) -> Address | None:
        """The carrier's physical address (FMCSA census)."""
        if carrier is None:
            return None
        return self.db.scalar(
            select(Address)
            .where(Address.carrier_id == carrier.id, Address.address_type == AddressType.PHYSICAL)
            .limit(1)
        )

    def _state(self, carrier: Carrier | None) -> str | None:
        """The carrier's physical address state, e.g. "CA"."""
        address = self._physical(carrier)
        return address.state.strip().upper() if address and address.state else None

    # --- Telling STS -----------------------------------------------------------------------------

    def email_staff(self, request_id: int, sender: EmailSender | None = None) -> None:
        """Email STS about a new request (right after saving it). A failure is kept on the request
        and shown to staff; the request itself is never lost."""
        request = self.db.get(ComplianceRequest, request_id)
        if request is None:
            return
        out = self._out([request])[0]
        settings = get_settings()
        to = settings.compliance_request_recipients
        sender = sender or get_email_sender()
        if sender is None or not to:
            request.email_error = "Email isn't set up on this server"
            self.db.commit()
            return
        carrier = self._carrier_name(request.usdot_number)
        subject = f"Service request: {out.service_label} for USDOT {request.usdot_number}"
        body = "\n\n".join(
            part
            for part in [
                f"{out.requested_by_name or 'A client'} ({out.organization_name or 'client'}) "
                f"asked STS for help with: {out.service_label}.",
                f"Carrier: {carrier or 'unknown name'}, USDOT {request.usdot_number}.",
                "Contact: "
                + ", ".join(p for p in [out.requested_by_email, out.requested_by_phone] if p),
                (
                    f"Invoice {out.invoice_number} for "
                    f"{out.option_label or out.service_label}"
                    + (f", {out.quantity} drivers" if out.quantity else "")
                    + f", ${out.amount:,.2f} (attached). The client was sent to Stripe to pay; "
                    "you'll get another email when it's paid."
                    if out.invoice_number and out.amount is not None
                    else ""
                ),
                f"Note from the client: {out.note}" if out.note else "",
                "Mark it handled on the Service requests page once you've followed up.",
            ]
            if part
        )
        # The invoice goes with the email as its PDF, so no link or button.
        pdf = InvoiceService(self.db).attachment(request.invoice_id) if request.invoice_id else None
        try:
            sender.send(
                to=to,
                subject=subject,
                text=body,
                html=render_html(body, None, ""),
                idempotency_key=f"compliance-request-{request.id}",
                attachments=[pdf] if pdf else [],
            )
        except Exception as exc:  # noqa: BLE001 - keep the request; staff see the failure
            logger.warning("Compliance request %s: email to STS failed", request.id)
            request.email_error = f"Email failed: {type(exc).__name__}"
            self.db.commit()

    def _carrier_name(self, usdot_number: int) -> str | None:
        return self.db.scalar(
            select(Carrier.legal_name).where(Carrier.usdot_number == usdot_number)
        )
