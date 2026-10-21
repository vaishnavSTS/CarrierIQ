"""DataQs API shapes (docs/DataQ.md, Phase 2): intake check, case creation, evidence, submission."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.enums import (
    DataQsActionOwner,
    DataQsAssessmentOutcome,
    DataQsEventType,
    DataQsOutcome,
    DataQsReason,
    DataQsReviewLevel,
    DataQsScanStatus,
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
    inspection_id: str
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
    checklist: list[str]  # suggested evidence, not a government standard


class DataQsCheckOut(BaseModel):
    usdot_number: int
    carrier_name: str | None
    event: DataQsEventOut
    eligibility: EligibilityOut
    can_open: bool
    cannot_open_reason: str | None
    existing_cases: list["DataQsCaseSummaryOut"]  # open cases on this event the user may see
    reasons: list[ReasonOut]


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


class DataQsCaseCreateIn(BaseModel):
    inspection_id: str = Field(min_length=1, max_length=50)
    issues: list[DataQsIssueIn] = Field(min_length=1, max_length=30)
    prior_activity: DataQsPriorActivityIn = DataQsPriorActivityIn()


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
    narrative: str = Field(min_length=50, max_length=20000)
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


class DataQsCaseSummaryOut(BaseModel):
    id: int
    organization_id: int
    organization_name: str | None
    usdot_number: int
    carrier_name: str | None
    event_type: DataQsEventType
    source_event_id: str
    event_date: date | None
    event_state: str | None
    work_status: DataQsWorkStatus
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
    created_at: datetime
    updated_at: datetime
    row_version: int


class DataQsEvidenceLinkOut(BaseModel):
    issue_id: int
    relevance: str


class DataQsEvidenceOut(BaseModel):
    id: int
    file_name: str
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
    recorded_value: str | None
    requested_value: str | None
    factual_basis: str | None
    outcome: DataQsOutcome | None
    evidence_count: int
    checklist: list[str]


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
    consent: DataQsConsentOut  # the current authorization text, shown before submitting
    package_terms: DataQsConsentOut  # the text a carrier agrees to when approving a package
    assessments: list[DataQsAssessmentOut]
    assessment_checks: list[DataQsCheckDefOut]
    packages: list[DataQsPackageOut]  # staff: every version; clients: the current one
    tasks: list[DataQsTaskOut]  # open tasks (clients: only their own)
    audit: list[DataQsAuditEventOut] | None  # STS staff only


class DataQsCaseListOut(BaseModel):
    cases: list[DataQsCaseSummaryOut]


DataQsCheckOut.model_rebuild()
