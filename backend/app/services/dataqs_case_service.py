"""DataQs intake: check an inspection, open a case, submit it for STS review (docs/DataQ.md,
Phase 2).

Flow (the spec's intake wizard):
1-5. The carrier's owner (CLIENT_ADMIN) picks an inspection of one of their STS-verified carriers,
     the violations, a reason and an explanation for each, and any prior DataQs activity. This
     creates a DRAFT case. The inspection is read from CarrierSafetyScan's own copy of the FMCSA
     record and preserved in the case, never taken from the request.
   - Evidence is uploaded to the DRAFT case (dataqs_evidence_service.py).
   - STS staff can also open the draft, for any carrier. It belongs to the client company STS
     verified the carrier for, whose owner signs and submits it as usual. A carrier with no
     client company yet: STS holds the draft until an admin verifies the USDOT for one
     (`hand_over_held_cases`).
6-7. The owner signs the service authorization and submits: the case goes to STAFF_REVIEW, owned
     by STS, with a task to assess it. Nothing is filed with the government at this stage.

Repeating a create with the same Idempotency-Key returns the first case. An open case on the same
inspection that covers the same violation (or the whole inspection) blocks a second one, even if
another user or company opened it.
"""

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import (
    DataQsDuplicateCaseError,
    DataQsInvalidTransitionError,
    DataQsMissingAuthorityError,
    DataQsStaleVersionError,
    NotFoundError,
    ValidationError,
)
from app.models import (
    DataQsAuthorization,
    DataQsCase,
    DataQsEvidence,
    DataQsFilingProof,
    DataQsIssue,
    DataQsTask,
    Inspection,
    User,
)
from app.models.enums import (
    DataQsActionOwner,
    DataQsAttemptStatus,
    DataQsAuthorizationKind,
    DataQsClockType,
    DataQsCorrespondenceKind,
    DataQsEventType,
    DataQsOutcome,
    DataQsReason,
    DataQsVerificationStatus,
    DataQsWorkStatus,
    UserRole,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import (
    DataQsAssessmentOut,
    DataQsAttemptOut,
    DataQsAuditEventOut,
    DataQsAuthorizationOut,
    DataQsCallOut,
    DataQsCaseCreateIn,
    DataQsCaseOut,
    DataQsCaseSummaryOut,
    DataQsCheckIn,
    DataQsCheckOut,
    DataQsClientUserOut,
    DataQsClockOut,
    DataQsConsentOut,
    DataQsCorrespondenceOut,
    DataQsEmailOut,
    DataQsEventOut,
    DataQsEvidenceLinkOut,
    DataQsEvidenceOut,
    DataQsFilingProofOut,
    DataQsIssueOut,
    DataQsMessageOut,
    DataQsMissingInspectionIn,
    DataQsOtpPreferenceOut,
    DataQsOtpRequestOut,
    DataQsPackageOut,
    DataQsPriorActivityIn,
    DataQsRelatedCaseOut,
    DataQsReviewCycleOut,
    DataQsSubmitIn,
    DataQsTaskOut,
    DataQsTimelineEventOut,
    DataQsVerificationCheckOut,
    DataQsViolationOut,
    EligibilityOut,
    ReasonOut,
)
from app.services import dataqs_calendar, dataqs_eligibility
from app.services.dataqs_access import DataQsAccess, may_act
from app.services.dataqs_assessment_service import (
    ASSESS_TARGET,
    ASSESSABLE,
    ASSESSMENT_CHECKS,
    CARRIER_OUTCOME_LABELS,
    OUTCOME_LABELS,
)
from app.services.dataqs_call_service import DataQsCallService
from app.services.dataqs_checklist import (
    CHECKLIST,
    DATAQS_REASON,
    DOCUMENT_TITLES,
    REASON_LABELS,
    VIEWED_IN_OPTIONS,
    WHOLE_INSPECTION_ONLY,
)
from app.services.dataqs_clock_service import LABELS as CLOCK_LABELS
from app.services.dataqs_clock_service import DataQsClockService, state
from app.services.dataqs_lifecycle import LEVEL_LABEL, NEXT_LEVEL, proposed_cycle
from app.services.dataqs_notifications import DataQsNotifications, carrier_link, staff_link
from app.services.dataqs_otp_service import DataQsOtpService, display_phone
from app.services.dataqs_package_service import (
    BUILDABLE,
    PACKAGE_TERMS_TEXT,
    PACKAGE_TERMS_VERSION,
    ready_to_prepare,
)
from app.services.dataqs_verification_service import DataQsVerificationService, fmcsa_checkable
from app.services.safety_analysis import violations_of

# The authorization text a carrier signs in step 6. Draft wording until STS's legal text is
# ready (docs/DataQ.md, decision D4); a new wording needs a new version.
CONSENT_TERMS_VERSION = "2026-10-21-draft"
CONSENT_TEXT = (
    "I am authorized to act for my company on this carrier's FMCSA records. I authorize Sky "
    "Transport Solutions (STS) to review this record, prepare a DataQs request about it and "
    "contact me about it. STS will not file anything with FMCSA until I approve the exact request "
    "package. A state agency decides each request; filing does not guarantee that a record will "
    "be changed or removed."
)
CONSENT_SCOPE = (
    "Review this inspection record, prepare a DataQs request and contact the carrier about it. "
    "No filing without the carrier's approval of the exact package."
)

# Stages at which a carrier can still add evidence; STS staff can until the case is closed.
CARRIER_UPLOAD_STATUSES = {
    DataQsWorkStatus.DRAFT,
    DataQsWorkStatus.EVIDENCE_NEEDED,
    DataQsWorkStatus.STAFF_REVIEW,
    # The package waits for approval or filing: a new file doesn't change the approved
    # package; STS reviews it and revises the package if needed.
    DataQsWorkStatus.AWAITING_APPROVAL,
    DataQsWorkStatus.READY_TO_FILE,
    DataQsWorkStatus.MONITORING,  # e.g. records for an agency information request
    DataQsWorkStatus.VERIFICATION,  # e.g. proof the record now shows the correction
}
# Stages where STS already has the case: a carrier's new file is news for STS.
STS_HAS_CASE = CARRIER_UPLOAD_STATUSES - {
    DataQsWorkStatus.DRAFT,
    DataQsWorkStatus.EVIDENCE_NEEDED,
}

OUTCOME_LABEL = {
    DataQsOutcome.FULL_CORRECTION: "corrected",
    DataQsOutcome.PARTIAL_CORRECTION: "partly corrected",
    DataQsOutcome.NO_CORRECTION: "not corrected",
    DataQsOutcome.PROCEDURAL_CLOSURE: "closed without a decision on the merits",
    DataQsOutcome.WITHDRAWN: "withdrawn",
}

NEXT_ACTION: dict[DataQsWorkStatus, str] = {
    DataQsWorkStatus.DRAFT: "Upload evidence for each issue, then authorize and submit to STS",
    DataQsWorkStatus.EVIDENCE_NEEDED: "Upload the evidence STS asked for",
    DataQsWorkStatus.STAFF_REVIEW: "STS is reviewing the case",
    DataQsWorkStatus.AWAITING_APPROVAL: "Review and approve the request package",
    DataQsWorkStatus.READY_TO_FILE: "STS is filing the request with DataQs",
    DataQsWorkStatus.SUBMISSION_UNCONFIRMED: "STS is confirming the filing with DataQs",
    DataQsWorkStatus.MONITORING: "Waiting for the agency's review",
    DataQsWorkStatus.VERIFICATION: "STS is checking that FMCSA's record changed",
    DataQsWorkStatus.CLOSED: "Closed",
}


def _now() -> datetime:
    return datetime.now(UTC)


def _violation_out(index: int, v: dict[str, Any]) -> DataQsViolationOut:
    return DataQsViolationOut(
        index=index,
        code=v.get("code"),
        description=v.get("description"),
        applies_to=v.get("applies_to"),
        unit_number=v.get("unit_number"),
        out_of_service=bool(v.get("out_of_service")),
        citation_number=v.get("citation_number"),
    )


def event_from_inspection(inspection: Inspection) -> DataQsEventOut:
    return DataQsEventOut(
        event_type=DataQsEventType.INSPECTION,
        inspection_id=inspection.inspection_id,
        report_number=inspection.report_number,
        plate=inspection.plate,
        plate_state=inspection.plate_state,
        inspection_date=inspection.inspection_date,
        level=inspection.inspection_level,
        state=inspection.state,
        location=inspection.location,
        vin=inspection.vin,
        vehicle_oos=inspection.vehicle_oos,
        driver_oos=inspection.driver_oos,
        violations=[_violation_out(i, v) for i, v in enumerate(violations_of(inspection))],
        source_observed_at=inspection.updated_at,
    )


def _eligibility_out(result: dataqs_eligibility.Eligibility) -> EligibilityOut:
    return EligibilityOut(
        status=result.status,
        window_years=result.window_years,
        window_ends=result.window_ends,
        internal_cutoff=result.internal_cutoff,
        days_left=result.days_left,
        notes=result.notes,
        policy_version=result.policy_version,
    )


def _issue_key(issue: DataQsIssue) -> tuple[str | None, str | None]:
    return issue.violation_code, issue.violation_unit


def _unit(v: DataQsViolationOut) -> str | None:
    if v.applies_to == "DRIVER":
        return "D"
    return str(v.unit_number) if v.unit_number is not None else None


def _overlaps(new: set[tuple[str | None, str | None]], existing: list[DataQsIssue]) -> bool:
    """The same violation, or either side covering the whole inspection."""
    old = {_issue_key(i) for i in existing}
    whole = (None, None)
    return bool(new & old) or (bool(new) and whole in old) or (whole in new and bool(old))


class DataQsCaseService:
    def __init__(self, db: Session, repository: DataQsCaseRepository | None = None) -> None:
        self.db = db
        self.repository = repository or DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)

    # --- Intake check ----------------------------------------------------------------------------

    def _event(self, usdot_number: int, inspection_id: str) -> tuple[str | None, Inspection]:
        carrier = self.repository.carrier(usdot_number)
        inspection = (
            self.repository.inspection(carrier.id, inspection_id) if carrier is not None else None
        )
        if carrier is None or inspection is None:
            raise NotFoundError(f"Inspection {inspection_id} not found for USDOT {usdot_number}")
        return carrier.legal_name, inspection

    def check(self, user: User, usdot_number: int, inspection_id: str) -> DataQsCheckOut:
        """What the intake wizard needs before a case exists. A client sees this only for their
        own carriers; whether they may open a case is answered, not raised."""
        if user.role.is_client:
            linked = self.repository.verified_usdots(user.organization_id)
            if usdot_number not in linked:
                raise NotFoundError(f"USDOT {usdot_number} is not one of your verified carriers")
        carrier_name, inspection = self._event(usdot_number, inspection_id)
        event = event_from_inspection(inspection)
        eligibility = dataqs_eligibility.assess(
            inspection.inspection_date,
            DataQsEventType.INSPECTION,
            _now().date(),
            get_settings().dataqs_internal_cutoff_days,
        )
        reason: str | None = None
        opens_for: str | None = None
        held = False
        if user.role.is_staff:
            try:
                organization_id, held = self._opening_organization(user, usdot_number)
                if not held:
                    opens_for = self.repository.organization_names([organization_id]).get(
                        organization_id
                    )
            except ValidationError as exc:
                reason = exc.message
        else:
            try:
                self.access.ensure_can_open_case(user, user.organization_id, usdot_number)
            except DataQsMissingAuthorityError as exc:
                reason = exc.message
        visible = [
            case
            for case in self.repository.open_cases_for_event(usdot_number, inspection_id)
            if user.role.is_staff or case.organization_id == user.organization_id
        ]
        return DataQsCheckOut(
            usdot_number=usdot_number,
            carrier_name=carrier_name,
            event=event,
            eligibility=_eligibility_out(eligibility),
            can_open=reason is None,
            cannot_open_reason=reason,
            opens_for=opens_for,
            held_by_sts=held,
            existing_cases=self._summaries(visible),
            reasons=[
                ReasonOut(
                    reason=r,
                    label=REASON_LABELS[r],
                    dataqs_label=DATAQS_REASON.get(r),
                    checklist=CHECKLIST[r],
                    whole_inspection_only=r in WHOLE_INSPECTION_ONLY,
                )
                for r in DataQsReason
                # An inspection on the list isn't missing: that one starts from its own form.
                if r != DataQsReason.MISSING_INSPECTION
            ],
        )

    # --- Create ----------------------------------------------------------------------------------

    def create(
        self,
        user: User,
        usdot_number: int,
        body: DataQsCaseCreateIn,
        idempotency_key: str | None,
    ) -> DataQsCase:
        if user.role != UserRole.CLIENT_ADMIN and not user.role.is_staff:
            raise DataQsMissingAuthorityError(
                "DataQs cases are opened by the carrier's account owner in the client portal"
            )
        organization_id, held = self._opening_organization(user, usdot_number)
        if idempotency_key:
            existing = self.repository.by_idempotency_key(organization_id, idempotency_key)
            if existing is not None:
                if existing.source_event_id != body.inspection_id:
                    raise DataQsDuplicateCaseError("This request key was already used")
                return existing
        if not held:
            self.access.ensure_can_open_case(user, organization_id, usdot_number)

        carrier_name, inspection = self._event(usdot_number, body.inspection_id)
        event = event_from_inspection(inspection)
        violations = {v.index: v for v in event.violations}

        planned: list[tuple[DataQsViolationOut | None, Any]] = []
        seen: set[int | None] = set()
        for issue in body.issues:
            if issue.reason == DataQsReason.MISSING_INSPECTION:
                raise ValidationError(
                    "This inspection is already on your record; 'An inspection is missing' is "
                    "for one that isn't"
                )
            if issue.reason in WHOLE_INSPECTION_ONLY and issue.violation_index is not None:
                raise ValidationError(
                    f"'{REASON_LABELS[issue.reason]}' is about the whole inspection, not one "
                    "violation"
                )
            if issue.violation_index in seen:
                raise ValidationError("Each violation can be listed only once")
            seen.add(issue.violation_index)
            if issue.violation_index is None:
                planned.append((None, issue))
                continue
            violation = violations.get(issue.violation_index)
            if violation is None:
                raise ValidationError(
                    f"Violation {issue.violation_index} is not on this inspection"
                )
            planned.append((violation, issue))
        if None in seen and len(seen) > 1:
            raise ValidationError(
                "Choose either the whole inspection or specific violations, not both"
            )

        new_keys = {(v.code, _unit(v)) if v else (None, None) for v, _ in planned}
        for case in self.repository.open_cases_for_event(usdot_number, body.inspection_id):
            if _overlaps(new_keys, self.repository.issues([case.id])):
                if case.organization_id == organization_id:
                    raise DataQsDuplicateCaseError(
                        f"DataQs case {case.id} already covers this inspection and violation"
                    )
                raise DataQsDuplicateCaseError(
                    "An open DataQs request already covers this inspection and violation"
                )

        eligibility = dataqs_eligibility.assess(
            inspection.inspection_date,
            DataQsEventType.INSPECTION,
            _now().date(),
            get_settings().dataqs_internal_cutoff_days,
        )
        citations = {v.citation_number for v, _ in planned if v and v.citation_number}
        case = DataQsCase(
            organization_id=organization_id,
            usdot_number=usdot_number,
            event_type=DataQsEventType.INSPECTION,
            source_event_id=inspection.inspection_id,
            inspection_report_number=inspection.report_number,
            citation_number=next(iter(citations)) if len(citations) == 1 else None,
            event_date=inspection.inspection_date,
            event_state=inspection.state,
            source_snapshot={
                "carrier_name": carrier_name,
                "event": event.model_dump(mode="json"),
                "violation_data": inspection.violation_data,
                "eligibility": _eligibility_out(eligibility).model_dump(mode="json"),
            },
            source_observed_at=inspection.updated_at,
            prior_activity=body.prior_activity.model_dump(mode="json"),
            viewed_in=(body.viewed_in or "").strip() or None,
            work_status=DataQsWorkStatus.DRAFT,
            action_owner=DataQsActionOwner.CARRIER,
            created_by_id=user.id,
            idempotency_key=idempotency_key,
        )
        self.db.add(case)
        try:
            self.db.flush()
        except IntegrityError:  # the same key, sent twice at once
            self.db.rollback()
            existing = (
                self.repository.by_idempotency_key(organization_id, idempotency_key)
                if idempotency_key
                else None
            )
            if existing is None:
                raise
            return existing

        for violation, issue in planned:
            self.db.add(
                DataQsIssue(
                    case_id=case.id,
                    violation_code=violation.code if violation else None,
                    violation_unit=_unit(violation) if violation else None,
                    violation_snapshot=violation.model_dump(mode="json") if violation else None,
                    reason=issue.reason,
                    recorded_value=issue.recorded_value,
                    requested_value=issue.requested_value,
                    factual_basis=issue.factual_basis,
                )
            )
        self.repository.audit(
            case,
            user,
            "case.created",
            after={
                "inspection_id": inspection.inspection_id,
                "issues": len(planned),
                "eligibility": eligibility.status,
                "opened_by_sts": user.role.is_staff,
                "held_by_sts": held,
            },
        )
        if user.role.is_staff and not held:
            self._tell_owner(case, user)
        self.db.commit()
        return case

    def _opening_organization(self, user: User, usdot_number: int) -> tuple[int, bool]:
        """The organization a new case belongs to, and whether STS holds it. A client opens
        cases for its own company. Staff open them for the client company STS verified the
        carrier for, or, when there is none yet, hold them in STS's own organization."""
        if not user.role.is_staff:
            return user.organization_id, False
        companies = self.repository.client_organizations_for_carrier(usdot_number)
        if len(companies) > 1:
            names = ", ".join(name for _, name in companies)
            raise ValidationError(
                f"USDOT {usdot_number} is verified for more than one client company ({names}). "
                "Remove it from all but one on the Accounts page first"
            )
        if companies:
            return companies[0][0], False
        return user.organization_id, True

    def _tell_owner(self, case: DataQsCase, user: User | None) -> None:
        """Email the carrier's company that STS opened a draft request it needs to sign."""
        DataQsNotifications(self.db).to_carrier(
            case,
            "CASE_OPENED_BY_STS",
            f"STS opened DataQs request {case.id} for you",
            "STS opened a draft DataQs request for inspection "
            f"{case.inspection_report_number or case.source_event_id}. Please review it, add any "
            "evidence, then sign the authorization and submit it to STS. Nothing is filed with "
            "FMCSA until you approve the exact request.",
            author=user,
        )

    def hand_over_held_cases(
        self, usdot_number: int, organization_id: int, user: User | None
    ) -> int:
        """STS verified the carrier for a client company: drafts STS opened for it while it had
        no company move to that company, whose owner then signs them. In the caller's
        transaction; answers how many moved."""
        held = self.repository.held_drafts(usdot_number)
        for case in held:
            before = {"organization_id": case.organization_id}
            case.organization_id = organization_id
            self.repository.audit(
                case,
                user,
                "case.handed_to_carrier",
                before=before,
                after={"organization_id": organization_id},
            )
            self.db.flush()
            self._tell_owner(case, user)
        return len(held)

    def create_missing(
        self,
        user: User,
        usdot_number: int,
        body: DataQsMissingInspectionIn,
        idempotency_key: str | None,
    ) -> DataQsCase:
        """Open a DRAFT case for an inspection missing from the carrier's record (DataQs:
        "Inspection missing from my report"). It isn't in FMCSA's data, so the carrier
        describes it; the snapshot says so (`entered_by_carrier`) and STS confirms the outcome
        by hand."""
        if user.role != UserRole.CLIENT_ADMIN:
            raise DataQsMissingAuthorityError(
                "DataQs cases are opened by the carrier's account owner in the client portal"
            )
        organization_id = user.organization_id
        source_event_id = f"MISSING-{body.state}-{body.report_number}"[:50]
        if idempotency_key:
            existing = self.repository.by_idempotency_key(organization_id, idempotency_key)
            if existing is not None:
                if existing.source_event_id != source_event_id:
                    raise DataQsDuplicateCaseError("This request key was already used")
                return existing
        self.access.ensure_can_open_case(user, organization_id, usdot_number)
        carrier = self.repository.carrier(usdot_number)
        if carrier is not None and self.db.scalar(
            select(Inspection.id).where(
                Inspection.carrier_id == carrier.id,
                Inspection.report_number == body.report_number,
                Inspection.state == body.state,
            )
        ):
            raise ValidationError(
                "This inspection is already on your record: start a request from it in the list"
            )
        if self.repository.open_cases_for_event(usdot_number, source_event_id):
            raise DataQsDuplicateCaseError("An open DataQs request already covers this inspection")

        eligibility = dataqs_eligibility.assess(
            body.inspection_date,
            DataQsEventType.INSPECTION,
            _now().date(),
            get_settings().dataqs_internal_cutoff_days,
        )
        event = DataQsEventOut(
            event_type=DataQsEventType.INSPECTION,
            inspection_id="",  # not in FMCSA's data
            report_number=body.report_number,
            inspection_date=body.inspection_date,
            level=body.level,
            state=body.state,
            location=(body.location or "").strip() or None,
            vin=None,
            vehicle_oos=False,
            driver_oos=False,
            violations=[],
            source_observed_at=None,
        )
        case = DataQsCase(
            organization_id=organization_id,
            usdot_number=usdot_number,
            event_type=DataQsEventType.INSPECTION,
            source_event_id=source_event_id,
            inspection_report_number=body.report_number,
            event_date=body.inspection_date,
            event_state=body.state,
            source_snapshot={
                "carrier_name": carrier.legal_name if carrier else None,
                "event": event.model_dump(mode="json"),
                "violation_data": None,
                "eligibility": _eligibility_out(eligibility).model_dump(mode="json"),
                "entered_by_carrier": True,
            },
            source_observed_at=None,
            prior_activity=body.prior_activity.model_dump(mode="json"),
            viewed_in=(body.viewed_in or "").strip() or None,
            work_status=DataQsWorkStatus.DRAFT,
            action_owner=DataQsActionOwner.CARRIER,
            created_by_id=user.id,
            idempotency_key=idempotency_key,
        )
        self.db.add(case)
        try:
            self.db.flush()
        except IntegrityError:  # the same key, sent twice at once
            self.db.rollback()
            existing = (
                self.repository.by_idempotency_key(organization_id, idempotency_key)
                if idempotency_key
                else None
            )
            if existing is None:
                raise
            return existing
        self.db.add(
            DataQsIssue(
                case_id=case.id,
                reason=DataQsReason.MISSING_INSPECTION,
                requested_value="Add this inspection to the carrier's record",
                factual_basis=body.factual_basis,
            )
        )
        self.repository.audit(
            case,
            user,
            "case.created",
            after={
                "missing_inspection": body.report_number,
                "state": body.state,
                "issues": 1,
                "eligibility": eligibility.status,
            },
        )
        self.db.commit()
        return case

    # --- Submit for STS review (wizard steps 6 and 7) -------------------------------------------

    def submit(self, user: User, case_id: int, body: DataQsSubmitIn) -> DataQsCase:
        case = self.access.case_to_act_on(user, case_id)
        if user.role != UserRole.CLIENT_ADMIN:
            raise DataQsMissingAuthorityError(
                "The carrier's account owner signs the authorization and submits the case"
            )
        if case.work_status != DataQsWorkStatus.DRAFT:
            if case.work_status == DataQsWorkStatus.STAFF_REVIEW:
                return case  # already submitted: a repeated click changes nothing
            raise DataQsInvalidTransitionError("Only a draft case can be submitted")
        if body.expected_version != case.row_version:
            raise DataQsStaleVersionError("This case changed since you opened it; reload it")
        if body.terms_version != CONSENT_TERMS_VERSION:
            raise DataQsStaleVersionError(
                "The authorization text changed; reload and read it again"
            )

        now = _now()
        self.db.add(
            DataQsAuthorization(
                case_id=case.id,
                kind=DataQsAuthorizationKind.SERVICE_CONSENT,
                signer_id=user.id,
                signer_name=body.signer_name.strip(),
                signer_title=(body.signer_title or "").strip() or None,
                authority_check={
                    "role": user.role.value,
                    "organization_id": user.organization_id,
                    "usdot_number": case.usdot_number,
                    "carrier_verified_by_sts": True,
                    "checked_at": now.isoformat(),
                },
                scope=CONSENT_SCOPE,
                terms_version=CONSENT_TERMS_VERSION,
                approved_at=now,
            )
        )
        before = {"work_status": case.work_status.value}
        case.work_status = DataQsWorkStatus.STAFF_REVIEW
        case.action_owner = DataQsActionOwner.STS
        self.db.flush()
        self.db.add(
            DataQsTask(
                case_id=case.id,
                kind="ASSESS_CASE",
                title=f"Assess DataQs case {case.id}",
                action_owner=DataQsActionOwner.STS,
                due_at=now + ASSESS_TARGET,
            )
        )
        self.repository.audit(
            case,
            user,
            "case.submitted",
            before=before,
            after={"work_status": case.work_status.value, "terms_version": CONSENT_TERMS_VERSION},
        )
        self.db.commit()
        return case

    # --- Reading ---------------------------------------------------------------------------------

    def list_cases(self, user: User) -> list[DataQsCaseSummaryOut]:
        return self._summaries(self.access.visible_cases(user))

    def detail(self, user: User, case_id: int) -> DataQsCaseOut:
        case = self.access.case_to_view(user, case_id)
        verified = (
            set() if user.role.is_staff else self.repository.verified_usdots(user.organization_id)
        )
        can_act = may_act(user, case, verified)
        issues = self.repository.issues([case.id])
        evidence = self.repository.evidence([case.id])
        links = self.repository.evidence_links([e.id for e in evidence])
        authorizations = self.repository.authorizations(case.id)
        staff = user.role.is_staff
        audit = self.repository.audit_events(case.id) if staff else None
        assessments = self.repository.assessments(case.id)
        packages = self.repository.packages(case.id)
        current_package = self.repository.current_package(case.id)
        approval = self.repository.current_approval(case.id)
        attempts = [
            a
            for a in self.repository.attempts(case.id)
            if staff or a.status == DataQsAttemptStatus.CONFIRMED
        ]
        proofs: dict[int, list[DataQsFilingProof]] = defaultdict(list)
        for proof in self.repository.filing_proofs(case.id):
            proofs[proof.attempt_id].append(proof)
        open_attempt = self.repository.open_attempt(case.id)
        cycles = self.repository.review_cycles(case.id)
        package_versions = {p.id: p.package_version for p in packages}
        tasks = [
            task
            for task in self.repository.open_tasks([case.id])
            if staff or task.action_owner == DataQsActionOwner.CARRIER
        ]
        names = self.repository.user_names(
            [e.uploaded_by_id for e in evidence]
            + [a.actor_id for a in audit or [] if a.actor_id is not None]
            + [a.assessor_id for a in assessments]
            + [p.created_by_id for p in packages]
            + [t.assignee_id for t in tasks if t.assignee_id is not None]
            + [a.filed_by_id for a in attempts]
            + [p.uploaded_by_id for a in attempts for p in proofs[a.id]]
            + [i.verified_by_id for i in issues if i.verified_by_id is not None]
        )

        links_by_evidence: dict[int, list[DataQsEvidenceLinkOut]] = defaultdict(list)
        evidence_per_issue: dict[int, int] = defaultdict(int)
        for link in links:
            links_by_evidence[link.evidence_id].append(
                DataQsEvidenceLinkOut(issue_id=link.issue_id, relevance=link.relevance)
            )
            evidence_per_issue[link.issue_id] += 1

        issue_out = [
            self._issue_out(issue, evidence_per_issue[issue.id], staff, names) for issue in issues
        ]
        verification = DataQsVerificationService(self.db)
        checks = verification.checks(case.id)
        last_ok = next((c for c in reversed(checks) if c.error is None), None)
        has_consent = any(
            a.kind == DataQsAuthorizationKind.SERVICE_CONSENT and a.revoked_at is None
            for a in authorizations
        )
        missing = [
            f"Evidence for: {self._issue_label(issue)}"
            for issue in issue_out
            if issue.evidence_count == 0
        ]
        if not has_consent:
            missing.append("Authorization for STS to act on this case")
        asked = assessments[-1].carrier_message if assessments else None
        if case.work_status == DataQsWorkStatus.EVIDENCE_NEEDED and asked:
            missing.insert(0, f"STS asked: {asked}")
        owner_client = can_act and user.role == UserRole.CLIENT_ADMIN
        prepared = ready_to_prepare(
            assessments, {t.kind for t in self.repository.open_tasks([case.id])}
        )
        clock_service = DataQsClockService(self.db)
        clocks = clock_service.clocks([case.id])
        pauses = clock_service.pauses([c.id for c in clocks])
        correspondence = self.repository.correspondence(case.id)
        names.update(self.repository.user_names([m.recorded_by_id for m in correspondence]))
        appeal_clock = next((c for c in clocks if c.clock_type == DataQsClockType.APPEAL), None)
        decided = [c for c in cycles if c.submitted_at is not None]
        can_propose = bool(
            staff
            and decided
            and decided[-1].outcome
            in (DataQsOutcome.NO_CORRECTION, DataQsOutcome.PARTIAL_CORRECTION)
            and decided[-1].level in NEXT_LEVEL
            and proposed_cycle(cycles) is None
            and appeal_clock is not None
            and (appeal_clock.due_at is None or appeal_clock.due_at >= _now())
        )
        now = _now()
        shown_packages = (
            list(reversed(packages)) if staff else [current_package] if current_package else []
        )

        summary = self._summaries([case])[0]
        snapshot = case.source_snapshot
        can_upload = can_act and (
            case.work_status != DataQsWorkStatus.CLOSED
            if user.role.is_staff
            else case.work_status in CARRIER_UPLOAD_STATUSES
        )
        otp = DataQsOtpService(self.db, twilio=None)
        calls = DataQsCallService(self.db).calls(case.id)
        call_names = self.repository.user_names([c.booked_by_id for c in calls])
        call_link = staff_link(case) if staff else carrier_link(case)
        otp_request = otp.latest_request(case.id) if staff else None
        return DataQsCaseOut(
            **summary.model_dump(),
            otp_preference=(
                DataQsOtpPreferenceOut(
                    method=case.otp_method,
                    phone=display_phone(case.otp_phone),
                    call_at=case.otp_call_at,
                    set_at=case.otp_preference_set_at,
                )
                if case.otp_method and case.otp_phone
                else None
            ),
            can_set_otp_preference=can_act and case.work_status != DataQsWorkStatus.CLOSED,
            calls=[
                DataQsCallOut(
                    id=c.id,
                    status=c.status,
                    starts_at=c.starts_at,
                    duration_minutes=c.duration_minutes,
                    time_zone=c.time_zone,
                    phone=c.phone,
                    topic=c.topic,
                    booked_by_name=call_names.get(c.booked_by_id),
                    created_at=c.created_at,
                    cancelled_at=c.cancelled_at,
                    done_at=c.done_at,
                    google_calendar_url=dataqs_calendar.google_link(c, case, call_link),
                )
                for c in calls
            ],
            can_book_call=can_act and case.work_status != DataQsWorkStatus.CLOSED,
            otp_request=(
                DataQsOtpRequestOut(
                    id=otp_request.id,
                    method=otp_request.method,
                    status=otp_request.status,
                    phone=display_phone(otp_request.phone),
                    requested_by_name=self.repository.user_names([otp_request.requested_by_id]).get(
                        otp_request.requested_by_id
                    ),
                    requested_by_me=otp_request.requested_by_id == user.id,
                    sent_at=otp_request.sent_at,
                    received_at=otp_request.received_at,
                    expires_at=otp_request.expires_at,
                    code=otp.visible_code(user, otp_request),
                    error=otp_request.error,
                )
                if otp_request is not None
                else None
            ),
            otp_automation_ready=staff and get_settings().twilio_enabled,
            event=DataQsEventOut.model_validate(snapshot["event"]),
            eligibility=EligibilityOut.model_validate(snapshot["eligibility"]),
            prior_activity=(
                DataQsPriorActivityIn.model_validate(case.prior_activity)
                if case.prior_activity
                else None
            ),
            issues=issue_out,
            evidence=[
                DataQsEvidenceOut(
                    id=e.id,
                    file_name=e.file_name,
                    title=e.title,
                    mime_type=e.mime_type,
                    size_bytes=e.size_bytes,
                    sha256=e.sha256,
                    document_date=e.document_date,
                    scan_status=e.scan_status,
                    uploaded_by_name=names.get(e.uploaded_by_id),
                    uploaded_at=e.created_at,
                    links=links_by_evidence[e.id],
                )
                for e in evidence
            ],
            authorizations=[
                DataQsAuthorizationOut(
                    kind=a.kind.value,
                    signer_name=a.signer_name,
                    signer_title=a.signer_title,
                    terms_version=a.terms_version,
                    approved_at=a.approved_at,
                    revoked_at=a.revoked_at,
                )
                for a in authorizations
            ],
            missing_items=(
                missing
                if case.work_status in (DataQsWorkStatus.DRAFT, DataQsWorkStatus.EVIDENCE_NEEDED)
                else []
            ),
            can_act=can_act,
            can_upload=can_upload,
            can_submit=owner_client and case.work_status == DataQsWorkStatus.DRAFT,
            can_resubmit=owner_client and case.work_status == DataQsWorkStatus.EVIDENCE_NEEDED,
            can_approve=(
                owner_client
                and case.work_status == DataQsWorkStatus.AWAITING_APPROVAL
                and current_package is not None
            ),
            can_assign=staff and case.work_status != DataQsWorkStatus.CLOSED,
            can_assess=staff and case.work_status in ASSESSABLE,
            can_build_package=(
                staff and prepared and case.work_status in BUILDABLE and open_attempt is None
            ),
            can_file=(
                staff
                and case.work_status == DataQsWorkStatus.READY_TO_FILE
                and approval is not None
                and open_attempt is None
            ),
            can_record_correspondence=staff and case.gov_request_id is not None,
            can_propose_review=can_propose,
            can_override_deadlines=user.role == UserRole.STS_ADMIN and bool(clocks),
            can_message=staff and case.work_status != DataQsWorkStatus.DRAFT,
            can_close=staff
            and case.work_status not in (DataQsWorkStatus.DRAFT, DataQsWorkStatus.CLOSED),
            email_enabled=get_settings().dataqs_email_enabled,
            consent=DataQsConsentOut(terms_version=CONSENT_TERMS_VERSION, text=CONSENT_TEXT),
            package_terms=DataQsConsentOut(
                terms_version=PACKAGE_TERMS_VERSION, text=PACKAGE_TERMS_TEXT
            ),
            assessments=[
                DataQsAssessmentOut(
                    id=a.id,
                    outcome=a.outcome,
                    outcome_label=(OUTCOME_LABELS if staff else CARRIER_OUTCOME_LABELS)[a.outcome],
                    assessor_name=names.get(a.assessor_id),
                    created_at=a.created_at,
                    checks={k: DataQsCheckIn.model_validate(v) for k, v in a.checks.items()},
                    carrier_message=a.carrier_message,
                    internal_note=a.internal_note if staff else None,
                )
                for a in assessments
            ],
            assessment_checks=ASSESSMENT_CHECKS,
            packages=[
                DataQsPackageOut(
                    id=pkg.id,
                    package_version=pkg.package_version,
                    narrative=pkg.narrative,
                    manifest=pkg.manifest,
                    manifest_hash=pkg.manifest_hash,
                    created_by_name=names.get(pkg.created_by_id),
                    created_at=pkg.created_at,
                    invalidated_at=pkg.invalidated_at,
                    approved=approval is not None and approval.package_id == pkg.id,
                )
                for pkg in shown_packages
            ],
            tasks=[
                DataQsTaskOut(
                    id=task.id,
                    kind=task.kind,
                    title=task.title,
                    detail=task.detail,
                    action_owner=task.action_owner,
                    assignee_name=names.get(task.assignee_id) if task.assignee_id else None,
                    due_at=task.due_at,
                    created_at=task.created_at,
                )
                for task in tasks
            ],
            attempts=[
                DataQsAttemptOut(
                    id=a.id,
                    status=a.status,
                    package_version=package_versions.get(a.package_id),
                    filed_by_name=names.get(a.filed_by_id),
                    filing_account=a.filing_account if staff else None,
                    started_at=a.created_at,
                    filed_at=a.filed_at,
                    gov_request_id=a.gov_request_id,
                    assigned_agency=a.assigned_agency,
                    acknowledgement=(a.receipt or {}).get("acknowledgement") if staff else None,
                    confirmed_at=a.confirmed_at,
                    note=a.note if staff else None,
                    proofs=[
                        DataQsFilingProofOut(
                            id=p.id,
                            file_name=p.file_name,
                            mime_type=p.mime_type,
                            size_bytes=p.size_bytes,
                            uploaded_by_name=names.get(p.uploaded_by_id),
                            uploaded_at=p.created_at,
                        )
                        for p in proofs[a.id]
                    ],
                )
                for a in attempts
            ],
            review_cycles=[
                DataQsReviewCycleOut(
                    id=c.id,
                    level=c.level,
                    cycle_number=c.cycle_number,
                    parent_cycle_id=c.parent_cycle_id,
                    opened_reason=c.opened_reason,
                    submitted_at=c.submitted_at,
                    decision_issued_at=c.decision_issued_at,
                    outcome=c.outcome,
                    decided_by=c.decided_by,
                    reasons=(c.decision or {}).get("reasons"),
                    appeal_instructions=(c.decision or {}).get("appeal_instructions"),
                    procedural_reason=(c.decision or {}).get("procedural_reason"),
                    appealed_issue_ids=c.appealed_issue_ids,
                    grounds=c.grounds if staff else None,
                    independence_concern=(
                        (c.decision or {}).get("independence_concern") if staff else None
                    ),
                    closed_at=c.closed_at,
                )
                for c in cycles
            ],
            clocks=[self._clock_out(c, pauses[c.id], now) for c in clocks],
            correspondence=[
                DataQsCorrespondenceOut(
                    id=m.id,
                    kind=m.kind,
                    source=m.source,
                    inbound=m.inbound,
                    text=m.original_payload,
                    occurred_at=m.received_at or m.sent_at,
                    external_id=m.external_id,
                    recorded_by_name=names.get(m.recorded_by_id),
                    recorded_at=m.created_at,
                )
                for m in correspondence
            ],
            timeline=self._timeline(
                case, authorizations, packages, attempts, correspondence, cycles, assessments, staff
            ),
            messages=self._messages(case.id, staff),
            emails=self._emails(case.id) if staff else None,
            dataqs_reasons={r.value: label for r, label in DATAQS_REASON.items()},
            document_titles=DOCUMENT_TITLES,
            viewed_in_options=VIEWED_IN_OPTIONS,
            audit=(
                [
                    DataQsAuditEventOut(
                        action=a.action,
                        actor_name=names.get(a.actor_id) if a.actor_id is not None else None,
                        at=a.created_at,
                        detail=a.after,
                    )
                    for a in audit
                ]
                if audit is not None
                else None
            ),
            verification_checked_at=last_ok.created_at if last_ok else None,
            verification_error=checks[-1].error if staff and checks else None,
            verification_checks=[
                DataQsVerificationCheckOut(
                    at=c.created_at, found=c.found, changes=c.changes or [], error=None
                )
                for c in reversed(checks)
                if c.changes is not None
            ],
            client_users=self._client_users(case) if staff else None,
            carrier_verified=(
                case.usdot_number in self.repository.verified_usdots(case.organization_id)
                if staff
                else None
            ),
            related_cases=self._related_cases(case) if staff else None,
            can_check_fmcsa=(
                staff
                and case.work_status != DataQsWorkStatus.CLOSED
                and fmcsa_checkable(case)
                and bool(verification.to_check(issues))
            ),
            can_verify=(
                staff
                and case.work_status != DataQsWorkStatus.CLOSED
                and bool(verification.to_check(issues))
            ),
        )

    def _client_users(self, case: DataQsCase) -> list[DataQsClientUserOut]:
        return [
            DataQsClientUserOut(
                full_name=u.full_name,
                email=u.email,
                phone=u.phone,
                role="Account owner" if u.role == UserRole.CLIENT_ADMIN else "Viewer",
            )
            for u in DataQsNotifications(self.db).carrier_users(case)
        ]

    def _related_cases(self, case: DataQsCase) -> list[DataQsRelatedCaseOut]:
        """Other requests on the same inspection (any company): the duplicates check."""
        others = [
            c
            for c in self.repository.cases_for_event(case.usdot_number, case.source_event_id)
            if c.id != case.id
        ]
        issues: dict[int, list[str]] = defaultdict(list)
        for issue in self.repository.issues([c.id for c in others]):
            issues[issue.case_id].append(issue.violation_code or "whole inspection")
        names = self.repository.organization_names([c.organization_id for c in others])
        return [
            DataQsRelatedCaseOut(
                id=c.id,
                same_company=c.organization_id == case.organization_id,
                organization_name=names.get(c.organization_id),
                work_status=c.work_status,
                gov_request_id=c.gov_request_id,
                issues=issues[c.id],
                created_at=c.created_at,
            )
            for c in others
        ]

    def _messages(self, case_id: int, staff: bool) -> list[DataQsMessageOut]:
        messages = self.repository.messages(case_id)
        outbox = self.repository.outbox(case_id)
        names = self.repository.user_names([m.author_id for m in messages if m.author_id])
        by_message: dict[int, list[str]] = defaultdict(list)
        for row in outbox:
            message_id = (row.payload or {}).get("message_id")
            if message_id is not None:
                by_message[int(message_id)].append(row.status.value)
        result = []
        for m in reversed(messages):
            statuses = by_message.get(m.id, [])
            delivery = (
                "NOT_SENT"
                if not statuses
                else "SENT"
                if all(s == "SENT" for s in statuses)
                else "FAILED"
                if any(s == "FAILED" for s in statuses)
                else "WAITING"
            )
            result.append(
                DataQsMessageOut(
                    id=m.id,
                    kind=m.kind,
                    subject=m.subject,
                    body=m.body,
                    author_name=names.get(m.author_id) if m.author_id else None,
                    recipients=m.recipients if staff else [],
                    delivery=delivery,
                    created_at=m.created_at,
                )
            )
        return result

    def _emails(self, case_id: int) -> list[DataQsEmailOut]:
        result = []
        for row in reversed(self.repository.outbox(case_id)):
            payload = row.payload or {}
            result.append(
                DataQsEmailOut(
                    id=row.id,
                    kind=row.kind,
                    to=list(payload.get("to") or payload.get("sent_to") or []),
                    status=row.status.value,
                    scheduled_for=row.next_attempt_at,
                    sent_at=row.sent_at,
                    attempts=row.attempts,
                    last_error=row.last_error,
                )
            )
        return result

    @staticmethod
    def _clock_out(clock: Any, pauses: Any, now: datetime) -> DataQsClockOut:
        current = state(clock, pauses, now)
        return DataQsClockOut(
            id=clock.id,
            clock_type=clock.clock_type,
            label=CLOCK_LABELS[clock.clock_type],
            base_event=clock.base_event,
            base_at=clock.base_at,
            budget_days=clock.budget_days,
            due_at=current.due_at,
            paused=current.paused,
            days_left=round(current.remaining.total_seconds() / 86400, 1),
            confidence=clock.confidence.value,
            policy_version=clock.policy_version,
            authority_source=clock.authority_source,
            override_reason=clock.override_reason,
        )

    @staticmethod
    def _timeline(
        case: DataQsCase,
        authorizations: list[Any],
        packages: list[Any],
        attempts: list[Any],
        correspondence: list[Any],
        cycles: list[Any],
        assessments: list[Any],
        staff: bool,
    ) -> list[DataQsTimelineEventOut]:
        """What happened on the case, newest first, in words both portals can show (the
        assessment in the carrier's own words)."""
        events = [DataQsTimelineEventOut(at=case.created_at, title="Request opened", detail=None)]
        for a in authorizations:
            title = (
                "Authorized STS and submitted for review"
                if a.kind == DataQsAuthorizationKind.SERVICE_CONSENT
                else "Approved the request package"
            )
            events.append(
                DataQsTimelineEventOut(at=a.approved_at, title=title, detail=a.signer_name)
            )
        for a in assessments:
            events.append(
                DataQsTimelineEventOut(
                    at=a.created_at,
                    title=(
                        f"STS assessment: {OUTCOME_LABELS[a.outcome].lower()}"
                        if staff
                        else CARRIER_OUTCOME_LABELS[a.outcome]
                    ),
                    detail=a.carrier_message,
                )
            )
        for p in packages:
            events.append(
                DataQsTimelineEventOut(
                    at=p.created_at,
                    title=f"STS prepared request package v{p.package_version}",
                    detail=None,
                )
            )
        for a in attempts:
            if a.status.value == "CONFIRMED" and a.filed_at:
                events.append(
                    DataQsTimelineEventOut(
                        at=a.filed_at, title=f"Filed with DataQs ({a.gov_request_id})", detail=None
                    )
                )
        titles = {
            DataQsCorrespondenceKind.INFO_REQUEST: "The agency asked for more information",
            DataQsCorrespondenceKind.INFO_RESPONSE: "STS answered the agency",
            DataQsCorrespondenceKind.REOPENING: "The agency reopened the request",
            DataQsCorrespondenceKind.OTHER: "Message from the agency",
        }
        for m in correspondence:
            if m.kind in titles:
                events.append(
                    DataQsTimelineEventOut(
                        at=m.received_at or m.sent_at or m.created_at,
                        title=titles[m.kind],
                        detail=m.original_payload,
                    )
                )
        for c in cycles:
            if c.decision_issued_at and c.outcome:
                events.append(
                    DataQsTimelineEventOut(
                        at=c.decision_issued_at,
                        title=f"Decision on the {LEVEL_LABEL[c.level]}: {OUTCOME_LABEL[c.outcome]}",
                        detail=(c.decision or {}).get("reasons"),
                    )
                )
            if c.submitted_at is None:
                events.append(
                    DataQsTimelineEventOut(
                        at=c.created_at,
                        title=f"STS is preparing a request for {LEVEL_LABEL[c.level]}",
                        detail=None,
                    )
                )
        return sorted(events, key=lambda e: e.at, reverse=True)

    @staticmethod
    def _issue_label(issue: DataQsIssueOut) -> str:
        if issue.violation_code is None:
            return "the whole inspection"
        return f"{issue.violation_code} {issue.violation_description or ''}".strip()

    @staticmethod
    def _issue_out(
        issue: DataQsIssue, evidence_count: int, staff: bool, names: dict[int, str]
    ) -> DataQsIssueOut:
        v = issue.violation_snapshot or {}
        by_sts = issue.verified_by_id is not None
        return DataQsIssueOut(
            id=issue.id,
            violation_code=issue.violation_code,
            violation_description=v.get("description"),
            violation_unit=issue.violation_unit,
            out_of_service=bool(v.get("out_of_service")),
            citation_number=v.get("citation_number"),
            reason=issue.reason,
            reason_label=REASON_LABELS[issue.reason],
            dataqs_reason_label=DATAQS_REASON.get(issue.reason),
            recorded_value=issue.recorded_value,
            requested_value=issue.requested_value,
            factual_basis=issue.factual_basis,
            outcome=issue.outcome,
            evidence_count=evidence_count,
            checklist=CHECKLIST[issue.reason],
            decided_at=issue.resolved_at,
            verification_status=issue.verification_status,
            # Clients see what the check saw; STS's proof (e.g. a PSP report) and what STS still
            # has to confirm stay internal.
            verification_note=(
                issue.verification_note
                if staff
                or (
                    not by_sts
                    and issue.verification_status
                    in (DataQsVerificationStatus.WAITING, DataQsVerificationStatus.VERIFIED)
                )
                else None
            ),
            verified_at=issue.verified_at,
            verified_by_name=(
                names.get(issue.verified_by_id, "STS") if issue.verified_by_id is not None else None
            ),
            shown_at=issue.shown_at,
        )

    def _summaries(self, cases: list[DataQsCase]) -> list[DataQsCaseSummaryOut]:
        ids = [c.id for c in cases]
        issue_counts: dict[int, int] = defaultdict(int)
        issues = self.repository.issues(ids)
        for issue in issues:
            issue_counts[issue.case_id] += 1
        evidence_counts: dict[int, int] = defaultdict(int)
        evidence: list[DataQsEvidence] = self.repository.evidence(ids)
        for e in evidence:
            evidence_counts[e.case_id] += 1
        org_names = self.repository.organization_names([c.organization_id for c in cases])
        sts_orgs = self.repository.sts_organization_ids([c.organization_id for c in cases])
        linked_issues = {
            link.issue_id for link in self.repository.evidence_links([e.id for e in evidence])
        }
        evidence_gaps: dict[int, int] = defaultdict(int)
        for issue in issues:
            if issue.id not in linked_issues:
                evidence_gaps[issue.case_id] += 1
        open_tasks: dict[int, int] = defaultdict(int)
        overdue_tasks: dict[int, int] = defaultdict(int)
        at = _now()
        for task in self.repository.open_tasks(ids):
            open_tasks[task.case_id] += 1
            if task.due_at is not None and task.due_at < at:
                overdue_tasks[task.case_id] += 1
        owners = self.repository.user_names([c.owner_id for c in cases if c.owner_id])
        deadlines: dict[int, tuple[datetime, str]] = {}
        for clock in DataQsClockService(self.db).clocks(ids):
            if clock.due_at is None:
                continue
            soonest = deadlines.get(clock.case_id)
            if soonest is None or clock.due_at < soonest[0]:
                deadlines[clock.case_id] = (clock.due_at, CLOCK_LABELS[clock.clock_type])
        today = at.date()
        return [
            DataQsCaseSummaryOut(
                id=c.id,
                organization_id=c.organization_id,
                organization_name=org_names.get(c.organization_id),
                held_by_sts=c.organization_id in sts_orgs,
                usdot_number=c.usdot_number,
                carrier_name=c.source_snapshot.get("carrier_name"),
                event_type=c.event_type,
                source_event_id=c.source_event_id,
                inspection_report_number=c.inspection_report_number,
                event_date=c.event_date,
                event_state=c.event_state,
                viewed_in=c.viewed_in,
                work_status=c.work_status,
                government_raw_status=c.government_raw_status,
                gov_request_id=c.gov_request_id,
                review_level=c.review_level,
                action_owner=c.action_owner,
                outcome=c.outcome,
                issue_count=issue_counts[c.id],
                evidence_count=evidence_counts[c.id],
                evidence_gaps=evidence_gaps[c.id],
                owner_id=c.owner_id,
                owner_name=owners.get(c.owner_id) if c.owner_id else None,
                window_days_left=(
                    (
                        dataqs_eligibility.anniversary(
                            c.event_date, dataqs_eligibility.WINDOW_YEARS[c.event_type]
                        )
                        - today
                    ).days
                    if c.event_date
                    else None
                ),
                open_task_count=open_tasks[c.id],
                overdue_task_count=overdue_tasks[c.id],
                next_action=NEXT_ACTION[c.work_status],
                next_deadline_at=deadlines[c.id][0] if c.id in deadlines else None,
                next_deadline_label=deadlines[c.id][1] if c.id in deadlines else None,
                created_at=c.created_at,
                updated_at=c.updated_at,
                row_version=c.row_version,
            )
            for c in cases
        ]
