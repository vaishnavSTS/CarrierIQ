"""DataQs intake: check an inspection, open a case, submit it for STS review (docs/DataQ.md,
Phase 2).

Flow (the spec's intake wizard):
1-5. The carrier's owner (CLIENT_ADMIN) picks an inspection of one of their STS-verified carriers,
     the violations, a reason and an explanation for each, and any prior DataQs activity. This
     creates a DRAFT case. The inspection is read from CarrierSafetyScan's own copy of the FMCSA
     record and preserved in the case, never taken from the request.
   - Evidence is uploaded to the DRAFT case (dataqs_evidence_service.py).
6-7. The owner signs the service authorization and submits: the case goes to STAFF_REVIEW, owned
     by STS, with a task to assess it. Nothing is filed with the government at this stage.

Repeating a create with the same Idempotency-Key returns the first case. An open case on the same
inspection that covers the same violation (or the whole inspection) blocks a second one, even if
another user or company opened it.
"""

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

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
    DataQsIssue,
    DataQsTask,
    Inspection,
    User,
)
from app.models.enums import (
    DataQsActionOwner,
    DataQsAssessmentOutcome,
    DataQsAuthorizationKind,
    DataQsEventType,
    DataQsReason,
    DataQsWorkStatus,
    UserRole,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import (
    DataQsAssessmentOut,
    DataQsAuditEventOut,
    DataQsAuthorizationOut,
    DataQsCaseCreateIn,
    DataQsCaseOut,
    DataQsCaseSummaryOut,
    DataQsCheckIn,
    DataQsCheckOut,
    DataQsConsentOut,
    DataQsEventOut,
    DataQsEvidenceLinkOut,
    DataQsEvidenceOut,
    DataQsIssueOut,
    DataQsPackageOut,
    DataQsPriorActivityIn,
    DataQsSubmitIn,
    DataQsTaskOut,
    DataQsViolationOut,
    EligibilityOut,
    ReasonOut,
)
from app.services import dataqs_eligibility
from app.services.dataqs_access import DataQsAccess, may_act
from app.services.dataqs_assessment_service import (
    ASSESS_TARGET,
    ASSESSABLE,
    ASSESSMENT_CHECKS,
    OUTCOME_LABELS,
)
from app.services.dataqs_checklist import CHECKLIST, REASON_LABELS
from app.services.dataqs_package_service import (
    BUILDABLE,
    PACKAGE_TERMS_TEXT,
    PACKAGE_TERMS_VERSION,
)
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
        if user.role.is_staff:
            reason = "Cases are opened by the carrier's account owner in the client portal"
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
            existing_cases=self._summaries(visible),
            reasons=[
                ReasonOut(reason=r, label=REASON_LABELS[r], checklist=CHECKLIST[r])
                for r in DataQsReason
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
        if user.role != UserRole.CLIENT_ADMIN:
            raise DataQsMissingAuthorityError(
                "DataQs cases are opened by the carrier's account owner in the client portal"
            )
        organization_id = user.organization_id
        if idempotency_key:
            existing = self.repository.by_idempotency_key(organization_id, idempotency_key)
            if existing is not None:
                if existing.source_event_id != body.inspection_id:
                    raise DataQsDuplicateCaseError("This request key was already used")
                return existing
        self.access.ensure_can_open_case(user, organization_id, usdot_number)

        carrier_name, inspection = self._event(usdot_number, body.inspection_id)
        event = event_from_inspection(inspection)
        violations = {v.index: v for v in event.violations}

        planned: list[tuple[DataQsViolationOut | None, Any]] = []
        seen: set[int | None] = set()
        for issue in body.issues:
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
                        f"DataQs case #{case.id} already covers this inspection and violation"
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
            inspection_report_number=inspection.inspection_id,
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
                title=f"Assess DataQs case #{case.id}",
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
        )

        links_by_evidence: dict[int, list[DataQsEvidenceLinkOut]] = defaultdict(list)
        evidence_per_issue: dict[int, int] = defaultdict(int)
        for link in links:
            links_by_evidence[link.evidence_id].append(
                DataQsEvidenceLinkOut(issue_id=link.issue_id, relevance=link.relevance)
            )
            evidence_per_issue[link.issue_id] += 1

        issue_out = [self._issue_out(issue, evidence_per_issue[issue.id]) for issue in issues]
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
        ready_to_prepare = bool(
            assessments and assessments[-1].outcome == DataQsAssessmentOutcome.READY_TO_PREPARE
        )
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
        return DataQsCaseOut(
            **summary.model_dump(),
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
            can_build_package=staff and ready_to_prepare and case.work_status in BUILDABLE,
            consent=DataQsConsentOut(terms_version=CONSENT_TERMS_VERSION, text=CONSENT_TEXT),
            package_terms=DataQsConsentOut(
                terms_version=PACKAGE_TERMS_VERSION, text=PACKAGE_TERMS_TEXT
            ),
            assessments=[
                DataQsAssessmentOut(
                    id=a.id,
                    outcome=a.outcome,
                    outcome_label=OUTCOME_LABELS[a.outcome],
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
        )

    @staticmethod
    def _issue_label(issue: DataQsIssueOut) -> str:
        if issue.violation_code is None:
            return "the whole inspection"
        return f"{issue.violation_code} {issue.violation_description or ''}".strip()

    @staticmethod
    def _issue_out(issue: DataQsIssue, evidence_count: int) -> DataQsIssueOut:
        v = issue.violation_snapshot or {}
        return DataQsIssueOut(
            id=issue.id,
            violation_code=issue.violation_code,
            violation_description=v.get("description"),
            violation_unit=issue.violation_unit,
            out_of_service=bool(v.get("out_of_service")),
            citation_number=v.get("citation_number"),
            reason=issue.reason,
            reason_label=REASON_LABELS[issue.reason],
            recorded_value=issue.recorded_value,
            requested_value=issue.requested_value,
            factual_basis=issue.factual_basis,
            outcome=issue.outcome,
            evidence_count=evidence_count,
            checklist=CHECKLIST[issue.reason],
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
        today = at.date()
        return [
            DataQsCaseSummaryOut(
                id=c.id,
                organization_id=c.organization_id,
                organization_name=org_names.get(c.organization_id),
                usdot_number=c.usdot_number,
                carrier_name=c.source_snapshot.get("carrier_name"),
                event_type=c.event_type,
                source_event_id=c.source_event_id,
                event_date=c.event_date,
                event_state=c.event_state,
                work_status=c.work_status,
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
                created_at=c.created_at,
                updated_at=c.updated_at,
                row_version=c.row_version,
            )
            for c in cases
        ]
