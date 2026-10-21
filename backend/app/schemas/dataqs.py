"""DataQs API shapes (docs/DataQ.md, Phase 2): intake check, case creation, evidence, submission."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.enums import (
    DataQsActionOwner,
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
    consent: DataQsConsentOut  # the current authorization text, shown before submitting
    audit: list[DataQsAuditEventOut] | None  # STS staff only


class DataQsCaseListOut(BaseModel):
    cases: list[DataQsCaseSummaryOut]


DataQsCheckOut.model_rebuild()
