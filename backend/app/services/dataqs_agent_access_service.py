"""Authorizing STS as an agent: the carrier lets STS act for their company in the FMCSA Portal
instead of passing STS a login code (DataQsOtpMethod.AUTHORIZED_AGENT).

How it works (FMCSA Portal Registration User Guide, "Managing Account Requests" and "Associate of
a Company"):
1. The carrier chooses "Authorize STS as an agent" (the login-code pop-up). STS is emailed, the
   case shows "Client requested authorized access" in STS's queue, and STS gets a task.
2. An STS staff member signs in to the FMCSA Portal with STS's own Login.gov account and requests
   associate access for the carrier's USDOT number (roles "Modify Company Information" and "View
   Sensitive Company Information"), then presses "Request for authorization sent". The carrier is
   emailed the steps, and the case asks them to approve it.
3. STS can send the carrier reminders.
4. The carrier's Company Official approves it in the FMCSA Portal (Account Management > Pending
   Account Requests) and presses "I approved it" on the case; STS is emailed. STS can also mark
   it granted once the access shows in the FMCSA Portal.
"""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.exceptions import DataQsInvalidTransitionError, DataQsMissingAuthorityError
from app.models import DataQsCase, User
from app.models.enums import (
    DataQsActionOwner,
    DataQsAgentAccess,
    DataQsOtpMethod,
    DataQsWorkStatus,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_notifications import DataQsNotifications

STAFF_TASK = "REQUEST_FMCSA_ACCESS"
CARRIER_TASK = "APPROVE_FMCSA_ACCESS"
ROLES = '"Modify Company Information" and "View Sensitive Company Information"'


def _now() -> datetime:
    return datetime.now(UTC)


def _who(user: User) -> str:
    """For the audit trail: whether the client or STS did it."""
    return "STS" if user.role.is_staff else "client"


def approve_steps(case: DataQsCase) -> str:
    """What the carrier's Company Official does in the FMCSA Portal (the guide, pages 9 and 10)."""
    return (
        "To approve it:\n"
        "1. Sign in to the FMCSA Portal (https://portal.fmcsa.dot.gov/login) as your company's "
        "Company Official.\n"
        "2. Open Account Management. Under Pending Account Requests, find the request from Sky "
        "Transport Solutions and click the magnifying glass.\n"
        f"3. Check that the roles include {ROLES}. If View Sensitive Company Information is "
        "missing, choose it under Available Roles and click Add Role.\n"
        "4. Click Approve Request.\n"
        "Then let us know on your case page (I approved it)."
    )


class DataQsAgentAccessService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)
        self.notifications = DataQsNotifications(db)

    def _carrier(self, case: DataQsCase) -> str:
        return str(case.source_snapshot.get("carrier_name") or f"USDOT {case.usdot_number}")

    # --- 1. The carrier chose it (called from DataQsOtpService.set_preference) -------------------

    def carrier_chose(self, case: DataQsCase, user: User) -> None:
        """In the caller's transaction. Choosing it again once STS sent the request changes
        nothing; choosing another way after it was requested withdraws the open request."""
        if case.agent_access in (DataQsAgentAccess.SENT, DataQsAgentAccess.GRANTED):
            return
        case.agent_access = DataQsAgentAccess.REQUESTED
        if not any(t.kind == STAFF_TASK for t in self.repository.open_tasks([case.id])):
            self.repository.add_task(
                case,
                STAFF_TASK,
                "Request access to the carrier in the FMCSA Portal",
                DataQsActionOwner.STS,
                detail=(
                    f"Sign in to the FMCSA Portal with STS's Login.gov account and request "
                    f"associate access for USDOT {case.usdot_number} (roles {ROLES}), then press "
                    "Request for authorization sent on the case."
                ),
                assignee_id=case.owner_id,
            )
        self.repository.audit(
            case,
            user,
            "agent_access.requested_by_carrier",
            after={"status": "REQUESTED", "usdot_number": case.usdot_number, "by": _who(user)},
        )
        if user.role.is_client:
            self.notifications.to_staff(
                case,
                "AGENT_ACCESS_WANTED",
                f"{self._carrier(case)} asked STS to request authorized access",
                f"{user.full_name} chose to authorize STS as an agent for USDOT "
                f"{case.usdot_number} (DataQs case {case.id}).\n\nSign in to the FMCSA Portal "
                f"with STS's Login.gov account, request associate access for USDOT "
                f"{case.usdot_number} with the roles {ROLES}, then press Request for "
                "authorization sent on the case. The client is emailed how to approve it.",
            )

    def carrier_chose_other(self, case: DataQsCase, user: User) -> None:
        """Another way was chosen before STS sent the request: drop the request and its task."""
        if case.agent_access != DataQsAgentAccess.REQUESTED:
            return
        case.agent_access = None
        self.repository.audit(
            case,
            user,
            "agent_access.withdrawn",
            before={"status": "REQUESTED"},
            after={"status": None, "new_method": case.otp_method, "by": _who(user)},
        )
        self.repository.complete_tasks(case, {STAFF_TASK}, user, _now())

    # --- 2-4. STS sends the request, reminds; the carrier approves ------------------------------

    def _case(self, user: User, case_id: int, *, staff_only: bool) -> DataQsCase:
        if staff_only and not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff do this")
        case = self.access.case_to_act_on(user, case_id)
        if case.work_status == DataQsWorkStatus.CLOSED:
            raise DataQsInvalidTransitionError("This case is closed")
        if case.otp_method != DataQsOtpMethod.AUTHORIZED_AGENT:
            raise DataQsInvalidTransitionError("The carrier didn't choose to authorize an agent")
        return case

    def request_sent(self, user: User, case_id: int) -> DataQsCase:
        case = self._case(user, case_id, staff_only=True)
        if case.agent_access == DataQsAgentAccess.GRANTED:
            raise DataQsInvalidTransitionError("The carrier already approved STS's access")
        now = _now()
        first = case.agent_access != DataQsAgentAccess.SENT
        before = {
            "status": case.agent_access,
            "sent_at": case.agent_request_sent_at.isoformat()
            if case.agent_request_sent_at
            else None,
        }
        case.agent_access = DataQsAgentAccess.SENT
        case.agent_request_sent_at, case.agent_request_sent_by_id = now, user.id
        self.repository.complete_tasks(case, {STAFF_TASK}, user, now)
        if not any(t.kind == CARRIER_TASK for t in self.repository.open_tasks([case.id])):
            self.repository.add_task(
                case,
                CARRIER_TASK,
                "Approve STS's access request in the FMCSA Portal",
                DataQsActionOwner.CARRIER,
                detail="The steps are on the FMCSA Portal access card on this page.",
            )
        self.repository.audit(
            case,
            user,
            "agent_access.request_sent",
            before=before,
            after={
                "status": "SENT",
                "first": first,
                "usdot_number": case.usdot_number,
                "sent_at": now.isoformat(),
                "client_emailed": True,
            },
        )
        self.notifications.to_carrier(
            case,
            "AGENT_ACCESS_REQUESTED",
            "Approve STS's access request in the FMCSA Portal",
            f"As you asked, Sky Transport Solutions requested access to USDOT "
            f"{case.usdot_number} in the FMCSA Portal so it can file your DataQs request "
            f"(case {case.id}). Your company's Company Official needs to approve it.\n\n"
            f"{approve_steps(case)}",
            author=user,
        )
        self.db.commit()
        return case

    def remind(self, user: User, case_id: int) -> DataQsCase:
        case = self._case(user, case_id, staff_only=True)
        if case.agent_access != DataQsAgentAccess.SENT:
            raise DataQsInvalidTransitionError("There is no access request waiting for approval")
        case.agent_reminders += 1
        case.agent_reminded_at = _now()
        self.repository.audit(
            case,
            user,
            "agent_access.reminded",
            after={
                "reminders": case.agent_reminders,
                "reminded_at": case.agent_reminded_at.isoformat(),
                "client_emailed": True,
            },
        )
        self.notifications.to_carrier(
            case,
            "AGENT_ACCESS_REMINDER",
            "Reminder: approve STS's access request in the FMCSA Portal",
            f"Sky Transport Solutions' request for access to USDOT {case.usdot_number} in the "
            f"FMCSA Portal is still waiting for your approval. STS needs it to file your DataQs "
            f"request (case {case.id}).\n\n{approve_steps(case)}",
            author=user,
        )
        self.db.commit()
        return case

    def granted(self, user: User, case_id: int) -> DataQsCase:
        case = self._case(user, case_id, staff_only=False)
        if case.agent_access != DataQsAgentAccess.SENT:
            raise DataQsInvalidTransitionError(
                "STS hasn't sent the access request yet"
                if case.agent_access == DataQsAgentAccess.REQUESTED
                else "Access is already granted"
            )
        now = _now()
        case.agent_access, case.agent_granted_at = DataQsAgentAccess.GRANTED, now
        self.repository.complete_tasks(case, {CARRIER_TASK, STAFF_TASK}, user, now)
        self.repository.audit(
            case,
            user,
            "agent_access.granted",
            before={"status": "SENT"},
            after={
                "status": "GRANTED",
                "granted_at": now.isoformat(),
                "confirmed_by": _who(user),
                "emailed": "STS" if user.role.is_client else "client",
            },
        )
        if user.role.is_client:
            self.notifications.to_staff(
                case,
                "AGENT_ACCESS_GRANTED",
                f"{self._carrier(case)} approved STS's FMCSA Portal access",
                f"{user.full_name} says they approved STS's access request for USDOT "
                f"{case.usdot_number} in the FMCSA Portal (DataQs case {case.id}). Check it in "
                "the FMCSA Portal under your account's companies, then file.",
            )
        else:
            self.notifications.to_carrier(
                case,
                "AGENT_ACCESS_GRANTED",
                "STS's FMCSA Portal access is confirmed",
                f"Thank you. STS's access to USDOT {case.usdot_number} in the FMCSA Portal is "
                f"approved, so STS can file your DataQs request (case {case.id}) without a login "
                "code from you.",
                author=user,
            )
        self.db.commit()
        return case
