"""The Compliance tab (carrier profile) and STS's list of clients' service requests.

Clients: their own company's carriers (linked to the company). STS staff: any carrier, and every
request.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, status
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_staff
from app.db.session import get_db
from app.models import User
from app.models.enums import ComplianceRequestStatus
from app.schemas.compliance import (
    ComplianceCheckoutIn,
    ComplianceCheckoutOut,
    CompliancePricesOut,
    ComplianceRequestIn,
    ComplianceRequestListOut,
    ComplianceRequestOut,
    UcrStatusOut,
)
from app.services.compliance_service import CarrierComplianceService
from app.services.dataqs_email import EmailSender, get_email_sender
from app.services.sts_invoice import StsInvoiceClient
from app.services.ucr_service import UcrService

router = APIRouter(prefix="/compliance", tags=["compliance"])

Usdot = Annotated[int, Path(gt=0, lt=100_000_000)]
Db = Annotated[Session, Depends(get_db)]
StaffUser = Annotated[User, Depends(require_staff)]


def get_ucr_service() -> UcrService:
    return UcrService()


def get_request_email_sender() -> EmailSender | None:
    """How a new request is emailed to STS (tests replace it)."""
    return get_email_sender()


@router.get("/carriers/{usdot_number}/ucr", response_model=UcrStatusOut)
def carrier_ucr(
    usdot_number: Usdot,
    user: CurrentUser,
    db: Db,
    checker: Annotated[UcrService, Depends(get_ucr_service)],
) -> UcrStatusOut:
    """Whether the carrier is registered (fee paid) for UCR this year, and next year once open."""
    return CarrierComplianceService(db).ucr(user, usdot_number, checker)


@router.get("/carriers/{usdot_number}/requests", response_model=ComplianceRequestListOut)
def carrier_requests(usdot_number: Usdot, user: CurrentUser, db: Db) -> ComplianceRequestListOut:
    """Service requests about this carrier (a client sees their own company's)."""
    return ComplianceRequestListOut(
        requests=CarrierComplianceService(db).for_carrier(user, usdot_number)
    )


@router.post(
    "/carriers/{usdot_number}/requests",
    response_model=ComplianceRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def create_request(
    usdot_number: Usdot,
    body: ComplianceRequestIn,
    user: CurrentUser,
    db: Db,
    sender: Annotated[EmailSender | None, Depends(get_request_email_sender)],
) -> ComplianceRequestOut:
    """A client asks STS for help with a service; STS is emailed and sees it on the list."""
    service = CarrierComplianceService(db)
    request = service.create(user, usdot_number, body)
    service.email_staff(request.id, sender)
    return service.for_carrier(user, usdot_number)[0]


def get_invoice_client() -> StsInvoiceClient:
    """STS's website invoicing (tests replace it with a fake website)."""
    return StsInvoiceClient()


@router.get("/carriers/{usdot_number}/prices", response_model=CompliancePricesOut)
def carrier_prices(usdot_number: Usdot, user: CurrentUser, db: Db) -> CompliancePricesOut:
    """The services paid online for this carrier, with the option that fits it."""
    return CarrierComplianceService(db).prices(user, usdot_number)


@router.post("/carriers/{usdot_number}/checkout", response_model=ComplianceCheckoutOut)
def checkout(
    usdot_number: Usdot,
    body: ComplianceCheckoutIn,
    user: CurrentUser,
    db: Db,
    invoices: Annotated[StsInvoiceClient, Depends(get_invoice_client)],
    sender: Annotated[EmailSender | None, Depends(get_request_email_sender)],
) -> ComplianceCheckoutOut:
    """A client pays for a service: the invoice is created on STS's website, the request saved
    and STS emailed; answers the website's payment page."""
    service = CarrierComplianceService(db)
    request, payment_url, new = service.checkout(user, usdot_number, body, invoices)
    if new:  # the same open invoice again: STS was already told
        service.email_staff(request.id, sender)
    out = next(r for r in service.for_carrier(user, usdot_number) if r.id == request.id)
    return ComplianceCheckoutOut(payment_url=payment_url, request=out)


@router.get("/requests", response_model=ComplianceRequestListOut)
def all_requests(
    user: StaffUser, db: Db, status: ComplianceRequestStatus | None = None
) -> ComplianceRequestListOut:
    """STS: every client's service requests, newest first."""
    return ComplianceRequestListOut(
        requests=CarrierComplianceService(db).all_requests(user, status)
    )


@router.post("/requests/{request_id}/handled", response_model=ComplianceRequestOut)
def mark_handled(
    request_id: Annotated[int, Path(gt=0)], user: StaffUser, db: Db
) -> ComplianceRequestOut:
    return CarrierComplianceService(db).mark_handled(user, request_id)
