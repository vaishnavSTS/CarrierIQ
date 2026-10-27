"""Booking a call with STS about a DataQs case, on STS's own appointment system
(skytransportsolutions.com, docs: APPOINTMENT-SCHEDULE-LINK-API.md).

The case page asks for a signed booking link for the carrier's USDOT number, with the reason
"other" labelled "DataQs case call" (until the website has a DataQs reason), and opens it. The
client picks a date and a free time there (the website's work hours and slot limits); the website
sends the confirmation email and text, the reminders, and handles cancel and reschedule. The
appointment shows on the website's admin appointments page.

Auth: STS_SCHEDULE_LINK_TOKEN, sent in the X-Schedule-Link-Token header (never in the URL, so it
isn't written to request logs). Off until it is set.
"""

import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import (
    BookingUnavailableError,
    DataQsInvalidTransitionError,
    ValidationError,
)
from app.models import User
from app.models.enums import DataQsWorkStatus
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_notifications import DataQsNotifications

logger = logging.getLogger(__name__)

REASON = "other"
REASON_LABEL = "DataQs case call"


def get_booking_transport() -> httpx.BaseTransport | None:
    """FastAPI dependency: the real website (None). Tests replace it with a fake one."""
    return None


class DataQsCallLinkService:
    def __init__(self, db: Session, transport: httpx.BaseTransport | None = None) -> None:
        self.db = db
        self.transport = transport  # tests replace the website
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)

    def link(self, user: User, case_id: int) -> str:
        """A signed booking link on the STS website for this case's carrier."""
        case = self.access.case_to_act_on(user, case_id)
        if case.work_status == DataQsWorkStatus.CLOSED:
            raise DataQsInvalidTransitionError("This case is closed")
        settings = get_settings()
        if not settings.sts_schedule_link_token:
            raise BookingUnavailableError("Booking a call isn't set up yet. Please contact STS.")

        report = case.inspection_report_number or case.source_event_id
        body: dict[str, Any] = {
            "dot": str(case.usdot_number),
            "reason": REASON,
            "reasonLabel": REASON_LABEL,
            "note": f"DataQs case {case.id}, inspection {report}",
        }
        if user.role.is_client:
            body["email"] = user.email  # the website signs the link for (and emails) this address
        try:
            with httpx.Client(transport=self.transport, timeout=20.0) as client:
                response = client.post(
                    settings.sts_schedule_link_url,
                    json=body,
                    headers={"X-Schedule-Link-Token": settings.sts_schedule_link_token},
                )
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("STS schedule link failed: %s", type(exc).__name__)
            raise BookingUnavailableError(
                "STS's booking page couldn't be reached. Please try again in a minute."
            ) from exc

        if response.status_code == 200 and data.get("success") and data.get("url"):
            self.repository.audit(case, user, "call.booking_link", after={"reason": REASON_LABEL})
            self.db.commit()
            return str(data["url"])

        error = str(data.get("error") or f"HTTP {response.status_code}")
        logger.warning("STS schedule link refused (%s): %s", response.status_code, error)
        if response.status_code == 400:
            # Not on the website yet (company not found / no email on file): STS adds it.
            DataQsNotifications(self.db).to_staff(
                case,
                "BOOKING_NOT_SET_UP",
                f"Set up USDOT {case.usdot_number} for online booking",
                f"{user.full_name} tried to book a call about DataQs case {case.id}, but "
                f"skytransportsolutions.com answered: {error}\n\nAdd the company (with an email) "
                "on the website, or contact the client to book the call.",
            )
            self.db.commit()
            raise ValidationError(
                "Your company isn't set up for online booking yet. STS has been told and will "
                "contact you to arrange the call."
            )
        raise BookingUnavailableError(
            "STS's booking page isn't available right now. Please try again later."
        )
