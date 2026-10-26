"""DataQs API shapes (docs/DataQ.md, Phase 2): intake check, case creation, evidence, submission."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.enums import (
    DataQsActionOwner,
    DataQsAssessmentOutcome,
    DataQsAttemptStatus,
    DataQsClockType,
    DataQsCorrespondenceKind,
    DataQsCorrespondenceSource,
    DataQsEventType,
    DataQsOutcome,
    DataQsReason,
    DataQsReviewLevel,
    DataQsScanStatus,
    DataQsVerificationStatus,
    DataQsWorkStatus,
)
from app.services.dataqs_eligibility import EligibilityStatus

# --- Intake check: one inspection, before a case exists -------------------------------------------


class EligibilityOut(BaseModel):
    status: EligibilityStatus
    window_years: int
    window_ends: date | None
    internal_cutoff: date | None
    days_left: int | None
    notes: list[str]
    policy_version: str


class DataQsViolationOut(BaseModel):
    index: int  # position on the inspection: what an issue refers to
    code: str | None
    description: str | None
    applies_to: str | None  # DRIVER | VEHICLE
    unit_number: int | None
    out_of_service: bool
    citation_number: str | None


class DataQsEventOut(BaseModel):
    event_type: DataQsEventType
    inspection_id: str  # FMCSA's unique id
    report_number: str | None = None  # the state's report number (older snapshots: None)
    plate: str | None = None  # unit 1's plate (DataQs can search by it)
    plate_state: str | None = None
    inspection_date: date | None
    level: int | None
    state: str | None
    location: str | None
    vin: str | None
    vehicle_oos: bool
    driver_oos: bool
    violations: list[DataQsViolationOut]
    source_observed_at: datetime | None  # when CarrierSafetyScan last loaded it from FMCSA


class ReasonOut(BaseModel):
    reason: DataQsReason
    label: str
    dataqs_label: str | None  # exactly as DataQs words it (None: ours, e.g. "not sure")
    checklist: list[str]  # suggested evidence, not a government standard
    whole_inspection_only: bool = False  # never for one violation (e.g. a copy request)


class DataQsCheckOut(BaseModel):
    usdot_number: int
    carrier_name: str | None
    event: DataQsEventOut
    eligibility: EligibilityOut
    can_open: bool
    cannot_open_reason: str | None
    existing_cases: list["DataQsCaseSummaryOut"]  # open cases on this event the user may see
    reasons: list[ReasonOut]
    # STS staff only: the client company the case will belong to (its owner signs), or None
    # with held_by_sts when the carrier has no client company yet.
    opens_for: str | None = None
    held_by_sts: bool = False


# --- Creating a case ------------------------------------------------------------------------------


class DataQsIssueIn(BaseModel):
    violation_index: int | None = Field(default=None, ge=0)  # None: the inspection as a whole
    reason: DataQsReason
    recorded_value: str | None = Field(default=None, max_length=2000)
    requested_value: str | None = Field(default=None, max_length=2000)
    factual_basis: str = Field(min_length=20, max_length=5000)

    @field_validator("recorded_value", "requested_value")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("factual_basis")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 20:
            raise ValueError("Explain what is wrong and why, in at least a sentence")
        return value


class DataQsPriorActivityIn(BaseModel):
    has_prior_request: bool = False
    prior_request_id: str | None = Field(default=None, max_length=50)
    prior_representative: str | None = Field(default=None, max_length=200)
    prior_decision: str | None = Field(default=None, max_length=2000)
    pending_court: bool = False
    notes: str | None = Field(default=None, max_length=2000)


class DataQsMissingInspectionIn(BaseModel):
    """An inspection that should be on the carrier's record but isn't in FMCSA's data: the
    carrier describes it (DataQs: "Inspection missing from my report")."""

    state: str = Field(pattern=r"^[A-Z]{2}$")  # the state that inspected
    report_number: str = Field(min_length=3, max_length=40, pattern=r"^[A-Z0-9-]+$")
    inspection_date: date
    level: int | None = Field(default=None, ge=1, le=8)
    location: str | None = Field(default=None, max_length=100)
    factual_basis: str = Field(min_length=20, max_length=5000)
    prior_activity: DataQsPriorActivityIn = DataQsPriorActivityIn()
    viewed_in: str | None = Field(default=None, max_length=100)

    @field_validator("state", "report_number", mode="before")
    @classmethod
    def _upper(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("inspection_date")
    @classmethod
    def _not_in_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("The inspection date can't be in the future")
        return value

    @field_validator("factual_basis")
    @classmethod
    def _strip_basis(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 20:
            raise ValueError("Say a little more (at least 20 characters)")
        return value


class DataQsCaseCreateIn(BaseModel):
    inspection_id: str = Field(min_length=1, max_length=50)
    issues: list[DataQsIssueIn] = Field(min_length=1, max_length=30)
    prior_activity: DataQsPriorActivityIn = DataQsPriorActivityIn()
    viewed_in: str | None = Field(default=None, max_length=100)  # where they saw the record


class DataQsSubmitIn(BaseModel):
    """Step 6 (authorize service) and step 7 (submit for STS review) together."""

    expected_version: int  # the case's row_version as the carrier last saw it
    signer_name: str = Field(min_length=2, max_length=200)
    signer_title: str | None = Field(default=None, max_length=100)
    terms_version: str = Field(max_length=20)  # the consent text version the signer was shown
    accept: Literal[True]


# --- Reading cases --------------------------------------------------------------------------------


# --- Phase 3: assessment, package, approval -------------------------------------------------------

CheckResult = Literal["PASS", "ISSUE", "NA"]


class DataQsCheckIn(BaseModel):
    result: CheckResult
    note: str | None = Field(default=None, max_length=2000)


class DataQsOwnerIn(BaseModel):
    expected_version: int
    owner_id: int | None  # None: unassign


class DataQsAssessmentIn(BaseModel):
    expected_version: int
    outcome: DataQsAssessmentOutcome
    checks: dict[str, DataQsCheckIn]
    carrier_message: str | None = Field(default=None, max_length=5000)  # the carrier sees this
    internal_note: str | None = Field(default=None, max_length=5000)  # STS staff only


class DataQsPackageIn(BaseModel):
    expected_version: int
    # DataQs step 3: one reason per request (DataQs's own tiles; not "unsure")
    dataqs_reason: DataQsReason
    # DataQs step 4: "Where did you view the data you want reviewed?"
    viewed_in: str = Field(min_length=2, max_length=100)
    narrative: str = Field(min_length=50, max_length=20000)

    @field_validator("dataqs_reason")
    @classmethod
    def _a_dataqs_reason(cls, value: DataQsReason) -> DataQsReason:
        if value == DataQsReason.UNSURE:
            raise ValueError("Choose the DataQs reason the request will be filed under")
        return value

    evidence_ids: list[int] = Field(max_length=100)
    references: list[str] = Field(default=[], max_length=20)

    @field_validator("references")
    @classmethod
    def _clean_references(cls, value: list[str]) -> list[str]:
        cleaned = [r.strip() for r in value if r.strip()]
        if any(len(r) > 500 for r in cleaned):
            raise ValueError("Each reference can be at most 500 characters")
        return cleaned


class DataQsApprovalIn(BaseModel):
    """The carrier approves one exact package, named by its id and fingerprint."""

    expected_version: int
    package_id: int
    package_hash: str = Field(min_length=64, max_length=64)
    signer_name: str = Field(min_length=2, max_length=200)
    signer_title: str | None = Field(default=None, max_length=100)
    terms_version: str = Field(max_length=20)
    accept: Literal[True]


class DataQsChangesIn(BaseModel):
    expected_version: int
    message: str = Field(min_length=5, max_length=5000)


class DataQsVersionIn(BaseModel):
    expected_version: int


class DataQsCheckDefOut(BaseModel):
    key: str
    label: str
    hint: str


class DataQsAssessmentOut(BaseModel):
    id: int
    outcome: DataQsAssessmentOutcome
    outcome_label: str
    assessor_name: str | None
    created_at: datetime
    checks: dict[str, DataQsCheckIn]
    carrier_message: str | None
    internal_note: str | None  # None for clients, always


class DataQsPackageOut(BaseModel):
    id: int
    package_version: int
    narrative: str
    manifest: dict[str, object]
    manifest_hash: str
    created_by_name: str | None
    created_at: datetime
    invalidated_at: datetime | None
    approved: bool  # the carrier's approval of this exact package still stands


class DataQsTaskOut(BaseModel):
    id: int
    kind: str
    title: str
    detail: str | None
    action_owner: DataQsActionOwner
    assignee_name: str | None
    due_at: datetime | None
    created_at: datetime


class DataQsStaffUserOut(BaseModel):
    id: int
    full_name: str
    role: str


# --- Phase 4: filing ---------------------------------------------------------------------------


class DataQsAttemptStartIn(BaseModel):
    """STS starts filing the approved package in the DataQs portal."""

    package_id: int
    package_hash: str = Field(min_length=64, max_length=64)
    filing_account: str = Field(
        min_length=3, max_length=200
    )  # whose DataQs login; never a password


class DataQsConfirmIn(BaseModel):
    """What DataQs showed once the request was submitted (a saved draft is not a submission)."""

    gov_request_id: str = Field(min_length=1, max_length=50)
    filed_at: datetime
    assigned_agency: str | None = Field(default=None, max_length=200)
    acknowledgement: str = Field(min_length=3, max_length=5000)  # as shown, pasted
    package_version: int  # the version actually entered in DataQs
    portal_status: str | None = Field(default=None, max_length=100)  # e.g. "Submitted"

    @field_validator("gov_request_id")
    @classmethod
    def _strip_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter the DataQs request ID")
        return value

    @field_validator("filed_at")
    @classmethod
    def _aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("filed_at needs a time zone")
        return value


class DataQsNoteIn(BaseModel):
    note: str = Field(min_length=5, max_length=2000)


class DataQsAttemptOut(BaseModel):
    id: int
    status: DataQsAttemptStatus
    package_version: int | None
    filed_by_name: str | None
    filing_account: str | None
    started_at: datetime
    filed_at: datetime | None
    gov_request_id: str | None
    assigned_agency: str | None
    acknowledgement: str | None
    confirmed_at: datetime | None
    note: str | None


class DataQsReviewCycleOut(BaseModel):
    id: int
    level: DataQsReviewLevel
    cycle_number: int
    parent_cycle_id: int | None
    opened_reason: str | None
    submitted_at: datetime | None  # None: an appeal STS is preparing, not filed yet
    decision_issued_at: datetime | None
    outcome: DataQsOutcome | None
    decided_by: str | None
    reasons: str | None
    appeal_instructions: str | None
    procedural_reason: str | None
    appealed_issue_ids: list[int] | None
    grounds: str | None
    independence_concern: str | None  # STS only
    closed_at: datetime | None


# --- Phase 5: correspondence, decisions, appeals, deadlines --------------------------------------


class DataQsDecisionIn(BaseModel):
    """An agency decision, as issued. Give each decided issue an outcome, or a procedural
    reason when the agency closed it without deciding the merits."""

    issue_outcomes: dict[int, Literal["CORRECTED", "NOT_CORRECTED"]] = {}
    procedural_reason: Literal["INSUFFICIENT_INFORMATION", "NO_RESPONSE"] | None = None
    decided_by: str | None = Field(default=None, max_length=200)  # the government reviewer
    reasons: str | None = Field(default=None, max_length=10000)
    appeal_instructions: str | None = Field(default=None, max_length=5000)


class DataQsReopeningIn(BaseModel):
    # SAME_LEVEL: requested information supplied after closure (a fresh full period);
    # RETURN_TO_INITIAL: new evidence at appeal sends the request back to initial review.
    mode: Literal["SAME_LEVEL", "RETURN_TO_INITIAL"]
    reason: str = Field(min_length=5, max_length=1000)


class DataQsCorrespondenceIn(BaseModel):
    """A verified agency event, recorded by STS from the DataQs portal (or email, phone)."""

    expected_version: int
    kind: Literal["OPENED", "INFO_REQUEST", "INFO_RESPONSE", "DECISION", "REOPENING", "OTHER"]
    source: DataQsCorrespondenceSource = DataQsCorrespondenceSource.DATAQS_PORTAL
    text: str = Field(min_length=3, max_length=20000)  # exactly as written
    # When the agency issued it, or (an answer) when STS submitted the response
    occurred_at: datetime
    external_id: str | None = Field(default=None, max_length=100)
    portal_status: str | None = Field(default=None, max_length=100)
    assigned_agency: str | None = Field(default=None, max_length=200)  # OPENED: e.g. "NE SP"
    decision: DataQsDecisionIn | None = None
    reopening: DataQsReopeningIn | None = None

    @field_validator("occurred_at")
    @classmethod
    def _aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("occurred_at needs a time zone")
        return value


class DataQsReviewRequestIn(BaseModel):
    """STS proposes the next review stage for denied issues."""

    expected_version: int
    grounds: str = Field(min_length=50, max_length=20000)  # must address the prior decision
    issue_ids: list[int] = Field(min_length=1, max_length=30)


class DataQsCloseIn(BaseModel):
    """STS closes the file; the note is emailed to the carrier."""

    expected_version: int
    note: str = Field(min_length=5, max_length=5000)
    # Required while FMCSA's data doesn't show every approved correction: why close anyway.
    unverified_reason: str | None = Field(default=None, max_length=2000)


class DataQsVerifyIssueIn(BaseModel):
    """STS confirms by hand that FMCSA's records show a correction, and how it knows."""

    note: str = Field(min_length=5, max_length=2000)


class DataQsMessageIn(BaseModel):
    """An email from STS to the carrier about the case."""

    subject: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=5, max_length=10000)


class DataQsMessageOut(BaseModel):
    id: int
    kind: str  # MESSAGE (written by staff) or the step that sent it (EVIDENCE_NEEDED, ...)
    subject: str
    body: str
    author_name: str | None  # None: sent by the app
    recipients: list[str]
    delivery: Literal["SENT", "WAITING", "FAILED", "NOT_SENT"]
    created_at: datetime


class DataQsEmailOut(BaseModel):
    """One queued email, for STS staff: what was sent, to whom, and what failed."""

    id: int
    kind: str
    to: list[str]
    status: str
    scheduled_for: datetime | None
    sent_at: datetime | None
    attempts: int
    last_error: str | None


class DataQsClockOverrideIn(BaseModel):
    expected_version: int
    due_at: datetime
    reason: str = Field(min_length=5, max_length=1000)


class DataQsClockOut(BaseModel):
    id: int
    clock_type: DataQsClockType
    label: str
    base_event: str
    base_at: datetime
    budget_days: int | None
    due_at: datetime | None  # None while paused
    paused: bool
    days_left: float  # remaining budget in days (negative once past)
    confidence: str
    policy_version: str
    authority_source: str | None
    override_reason: str | None


class DataQsCorrespondenceOut(BaseModel):
    id: int
    kind: DataQsCorrespondenceKind
    source: DataQsCorrespondenceSource
    inbound: bool
    text: str
    occurred_at: datetime | None
    external_id: str | None
    recorded_by_name: str | None
    recorded_at: datetime


class DataQsTimelineEventOut(BaseModel):
    at: datetime
    title: str
    detail: str | None


class DataQsCaseSummaryOut(BaseModel):
    id: int
    organization_id: int
    organization_name: str | None
    # Opened by STS staff for a carrier with no client company yet; it moves to the carrier's
    # company when STS verifies the USDOT for one.
    held_by_sts: bool = False
    usdot_number: int
    carrier_name: str | None
    event_type: DataQsEventType
    source_event_id: str
    inspection_report_number: str | None  # the state's: what DataQs searches by
    event_date: date | None
    event_state: str | None
    viewed_in: str | None
    work_status: DataQsWorkStatus
    government_raw_status: str | None  # exactly what DataQs last showed
    gov_request_id: str | None  # the DataQs request ID, once filed
    review_level: DataQsReviewLevel | None
    action_owner: DataQsActionOwner | None
    outcome: DataQsOutcome | None
    issue_count: int
    evidence_count: int
    evidence_gaps: int  # issues with no evidence linked
    owner_id: int | None  # the STS case specialist
    owner_name: str | None
    window_days_left: int | None  # days until the state review window ends, from today
    open_task_count: int
    overdue_task_count: int
    next_action: str
    next_deadline_at: datetime | None  # the soonest active deadline
    next_deadline_label: str | None
    created_at: datetime
    updated_at: datetime
    row_version: int


class DataQsEvidenceLinkOut(BaseModel):
    issue_id: int
    relevance: str


class DataQsEvidenceOut(BaseModel):
    id: int
    file_name: str
    title: str | None
    mime_type: str
    size_bytes: int
    sha256: str
    document_date: date | None
    scan_status: DataQsScanStatus
    uploaded_by_name: str | None
    uploaded_at: datetime
    links: list[DataQsEvidenceLinkOut]


class DataQsIssueOut(BaseModel):
    id: int
    violation_code: str | None
    violation_description: str | None
    violation_unit: str | None
    out_of_service: bool
    citation_number: str | None
    reason: DataQsReason
    reason_label: str
    dataqs_reason_label: str | None
    recorded_value: str | None
    requested_value: str | None
    factual_basis: str | None
    outcome: DataQsOutcome | None
    evidence_count: int
    checklist: list[str]
    # Phase 6, for a corrected issue: the decision, then FMCSA's record, then CarrierSafetyScan.
    decided_at: datetime | None = None
    verification_status: DataQsVerificationStatus | None = None
    verification_note: str | None = None  # what the check saw (clients: not STS's own proof)
    verified_at: datetime | None = None
    verified_by_name: str | None = None  # None: the automatic check
    shown_at: datetime | None = None


class DataQsVerificationCheckOut(BaseModel):
    """A look at FMCSA's record that saw something new (or, for STS, failed)."""

    at: datetime
    found: bool | None
    changes: list[str]
    error: str | None


class DataQsAuthorizationOut(BaseModel):
    kind: str
    signer_name: str
    signer_title: str | None
    terms_version: str
    approved_at: datetime
    revoked_at: datetime | None


class DataQsConsentOut(BaseModel):
    terms_version: str
    text: str


class DataQsAuditEventOut(BaseModel):
    action: str
    actor_name: str | None
    at: datetime
    detail: dict[str, object] | None


class DataQsClientUserOut(BaseModel):
    """Someone at the client company (STS staff only)."""

    full_name: str
    email: str
    phone: str | None
    role: str  # "Account owner" or "Viewer"


class DataQsRelatedCaseOut(BaseModel):
    """Another request on the same inspection, from any company (STS staff only)."""

    id: int
    same_company: bool
    organization_name: str | None
    work_status: DataQsWorkStatus
    gov_request_id: str | None
    issues: list[str]  # violation codes; "whole inspection"
    created_at: datetime


class DataQsCaseOut(DataQsCaseSummaryOut):
    event: DataQsEventOut
    eligibility: EligibilityOut  # as assessed when the case was opened
    prior_activity: DataQsPriorActivityIn | None
    issues: list[DataQsIssueOut]
    evidence: list[DataQsEvidenceOut]
    authorizations: list[DataQsAuthorizationOut]
    missing_items: list[str]
    can_act: bool  # this user may change the case (upload, submit)
    can_upload: bool
    can_submit: bool
    can_resubmit: bool  # carrier: send the case back to STS after adding evidence
    can_approve: bool  # carrier: approve or ask for changes to the current package
    can_assign: bool  # staff
    can_assess: bool  # staff
    can_build_package: bool  # staff
    can_file: bool  # staff: start filing the approved package
    can_record_correspondence: bool  # staff, once filed
    can_propose_review: bool  # staff: appeal denied issues within 30 days
    can_override_deadlines: bool  # STS admin
    can_message: bool  # staff: email the carrier
    can_close: bool  # staff: close the file (the carrier is emailed)
    email_enabled: bool  # False until RESEND_API_KEY is set: emails wait
    consent: DataQsConsentOut  # the current authorization text, shown before submitting
    package_terms: DataQsConsentOut  # the text a carrier agrees to when approving a package
    assessments: list[DataQsAssessmentOut]
    assessment_checks: list[DataQsCheckDefOut]
    packages: list[DataQsPackageOut]  # staff: every version; clients: the current one
    tasks: list[DataQsTaskOut]  # open tasks (clients: only their own)
    attempts: list[DataQsAttemptOut]  # staff: every filing attempt; clients: confirmed ones
    review_cycles: list[DataQsReviewCycleOut]
    clocks: list[DataQsClockOut]  # active deadlines
    correspondence: list[DataQsCorrespondenceOut]
    timeline: list[DataQsTimelineEventOut]  # newest first
    messages: list[DataQsMessageOut]  # emails to the carrier, newest first
    emails: list[DataQsEmailOut] | None  # STS staff only: every queued email
    dataqs_reasons: dict[str, str]  # reason -> DataQs's wording (package builder)
    document_titles: list[str]  # suggested file titles
    viewed_in_options: list[str]
    audit: list[DataQsAuditEventOut] | None  # STS staff only
    # Phase 6: when FMCSA's record was last looked at, and what each look saw new.
    verification_checked_at: datetime | None = None
    verification_error: str | None = None  # STS staff only: the last look failed
    verification_checks: list[DataQsVerificationCheckOut] = []
    can_verify: bool = False  # staff: check now, confirm by hand
    # STS staff only (None for clients): who the client is, whether STS verified the carrier
    # for the company, and other requests on the same inspection.
    client_users: list[DataQsClientUserOut] | None = None
    carrier_verified: bool | None = None
    related_cases: list[DataQsRelatedCaseOut] | None = None
    can_check_fmcsa: bool = False  # staff: the inspection is in FMCSA's data to look at


class DataQsCaseListOut(BaseModel):
    cases: list[DataQsCaseSummaryOut]


class DataQsExceptionOut(BaseModel):
    """Something on a case an STS supervisor should look at (the supervisor view)."""

    kind: str  # e.g. DEADLINE_OVERDUE, UNASSIGNED, EMAIL_FAILED, STALE
    severity: Literal["HIGH", "MEDIUM", "LOW"]
    case_id: int
    organization_name: str | None
    usdot_number: int
    owner_name: str | None
    work_status: DataQsWorkStatus
    title: str
    detail: str
    at: datetime | None  # when it was due, failed or last moved


class DataQsWorkloadOut(BaseModel):
    """Open cases (sent to STS, not closed) per case specialist; owner_id None = unassigned."""

    owner_id: int | None
    owner_name: str | None
    active_cases: int = 0
    needs_sts: int = 0
    waiting_carrier: int = 0
    waiting_agency: int = 0
    overdue_tasks: int = 0
    overdue_deadlines: int = 0


class DataQsSupervisorOut(BaseModel):
    generated_at: datetime
    stale_days: int
    exceptions: list[DataQsExceptionOut]  # most serious first
    workload: list[DataQsWorkloadOut]


DataQsCheckOut.model_rebuild()
