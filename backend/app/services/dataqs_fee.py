"""The DataQs filing fee: $50 per inspection (per DataQs case), paid through Stripe before STS
starts.

- When the carrier's owner submits a case, an invoice for the fee is made and the case waits on
  the carrier (action owner CARRIER, no STS task yet).
- When Stripe confirms the payment (InvoiceService.handle_event), the case goes to STS: action
  owner STS and the "Assess" task. STS can't assess a case whose fee isn't paid.
- Cases submitted before the fee have no fee invoice and are never held.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsCase, DataQsTask, Invoice, User
from app.models.enums import DataQsActionOwner, DataQsWorkStatus, InvoiceStatus
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.services.invoice_service import InvoiceService, NewLine

DATAQS_FEE = Decimal("50")
ITEM = "DATAQS REQUEST"


def add_fee(db: Session, case: DataQsCase, user: User) -> Invoice:
    """The fee's invoice for a case being submitted (in the caller's transaction)."""
    invoices = InvoiceService(db)
    report = case.inspection_report_number or case.source_event_id
    invoice = invoices.create(
        user=user,
        organization_id=case.organization_id,
        usdot_number=case.usdot_number,
        bill_to=invoices.bill_to(case.usdot_number, user),
        lines=[NewLine(ITEM, f"Case {case.id}, inspection {report}", 1, DATAQS_FEE)],
    )
    case.fee_invoice_id = invoice.id
    return invoice


def fee_invoice(db: Session, case: DataQsCase) -> Invoice | None:
    return db.get(Invoice, case.fee_invoice_id) if case.fee_invoice_id else None


def fee_due(db: Session, case: DataQsCase) -> bool:
    """The case has a fee that isn't paid yet."""
    invoice = fee_invoice(db, case)
    return invoice is not None and invoice.status != InvoiceStatus.PAID


def hand_to_sts(db: Session, invoice: Invoice, now: datetime) -> None:
    """The fee was paid: the case it's for goes to STS for assessment (once)."""
    from app.services.dataqs_assessment_service import ASSESS_TARGET  # (import cycle)

    case = db.scalar(select(DataQsCase).where(DataQsCase.fee_invoice_id == invoice.id))
    if (
        case is None
        or case.work_status != DataQsWorkStatus.STAFF_REVIEW
        or case.action_owner != DataQsActionOwner.CARRIER
    ):
        return
    case.action_owner = DataQsActionOwner.STS
    db.add(
        DataQsTask(
            case_id=case.id,
            kind="ASSESS_CASE",
            title=f"Assess DataQs case {case.id}",
            action_owner=DataQsActionOwner.STS,
            due_at=now + ASSESS_TARGET,
        )
    )
    DataQsCaseRepository(db).audit(
        case,
        None,
        "case.fee_paid",
        after={"invoice_number": invoice.number, "amount": str(invoice.total)},
    )
    db.commit()
