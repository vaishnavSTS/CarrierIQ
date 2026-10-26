"""The Compliance tab: a carrier's UCR status, and clients asking STS for help with a compliance
service. A request is saved (staff see and handle it in the internal portal) and emailed to STS
(COMPLIANCE_REQUEST_EMAIL) as soon as it is saved."""

import logging
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models import ComplianceRequest, Organization, OrganizationCarrier, User
from app.models.enums import ComplianceRequestStatus, ComplianceService
from app.schemas.compliance import (
    ComplianceRequestIn,
    ComplianceRequestOut,
    UcrStatusOut,
    UcrYearOut,
)
from app.services.dataqs_email import EmailSender, get_email_sender
from app.services.dataqs_notifications import render_html
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
        out = []
        for r in requests:
            by = users.get(r.requested_by_id)
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
                )
            )
        return out

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
                f"Note from the client: {out.note}" if out.note else "",
                "Mark it handled on the Service requests page once you've followed up.",
            ]
            if part
        )
        link = f"{settings.public_app_url.rstrip('/')}/service-requests"
        try:
            sender.send(
                to=to,
                subject=subject,
                text=f"{body}\n\n{link}",
                html=render_html(body, link, "Open service requests"),
                idempotency_key=f"compliance-request-{request.id}",
            )
        except Exception as exc:  # noqa: BLE001 - keep the request; staff see the failure
            logger.warning("Compliance request %s: email to STS failed", request.id)
            request.email_error = f"Email failed: {type(exc).__name__}"
            self.db.commit()

    def _carrier_name(self, usdot_number: int) -> str | None:
        from app.models import Carrier

        return self.db.scalar(
            select(Carrier.legal_name).where(Carrier.usdot_number == usdot_number)
        )
