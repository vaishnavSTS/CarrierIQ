/** Mirrors backend/app/schemas/dataqs.py (DataQs build plan: docs/DataQ.md). */

export type DataQsWorkStatus =
  | 'DRAFT'
  | 'EVIDENCE_NEEDED'
  | 'STAFF_REVIEW'
  | 'AWAITING_APPROVAL'
  | 'READY_TO_FILE'
  | 'SUBMISSION_UNCONFIRMED'
  | 'MONITORING'
  | 'VERIFICATION'
  | 'CLOSED'

export type DataQsReason =
  | 'WRONG_ATTRIBUTION'
  | 'INACCURATE_VIOLATION'
  | 'DUPLICATE'
  | 'FIELD_CORRECTION'
  | 'COURT_OUTCOME'
  | 'UNSURE'

export type EligibilityStatus = 'POTENTIALLY_ELIGIBLE' | 'STAFF_REVIEW' | 'MANUAL_ASSESSMENT'

export interface Eligibility {
  status: EligibilityStatus
  window_years: number
  /** Last day of the state review window (the anniversary) */
  window_ends: string | null
  /** STS's earlier target date; an STS rule, not a government one */
  internal_cutoff: string | null
  days_left: number | null
  notes: string[]
  policy_version: string
}

export interface DataQsViolation {
  /** Position on the inspection: what an issue refers to */
  index: number
  code: string | null
  description: string | null
  applies_to: string | null
  unit_number: number | null
  out_of_service: boolean
  citation_number: string | null
}

export interface DataQsEvent {
  event_type: 'INSPECTION' | 'CRASH'
  inspection_id: string
  inspection_date: string | null
  level: number | null
  state: string | null
  location: string | null
  vin: string | null
  vehicle_oos: boolean
  driver_oos: boolean
  violations: DataQsViolation[]
  source_observed_at: string | null
}

export interface ReasonOption {
  reason: DataQsReason
  label: string
  /** Suggested evidence, not a government standard */
  checklist: string[]
}

export interface DataQsCaseSummary {
  id: number
  organization_id: number
  organization_name: string | null
  usdot_number: number
  carrier_name: string | null
  event_type: 'INSPECTION' | 'CRASH'
  source_event_id: string
  event_date: string | null
  event_state: string | null
  work_status: DataQsWorkStatus
  review_level: 'INITIAL' | 'RECONSIDERATION' | 'FINAL' | null
  action_owner: 'CARRIER' | 'STS' | 'AGENCY' | null
  outcome: string | null
  issue_count: number
  evidence_count: number
  /** Issues with no evidence linked */
  evidence_gaps: number
  /** The STS case specialist */
  owner_id: number | null
  owner_name: string | null
  /** Days until the state review window ends, from today */
  window_days_left: number | null
  open_task_count: number
  overdue_task_count: number
  next_action: string
  created_at: string
  updated_at: string
  row_version: number
}

export interface DataQsCheck {
  usdot_number: number
  carrier_name: string | null
  event: DataQsEvent
  eligibility: Eligibility
  can_open: boolean
  cannot_open_reason: string | null
  existing_cases: DataQsCaseSummary[]
  reasons: ReasonOption[]
}

export interface DataQsIssueInput {
  /** null: the inspection as a whole */
  violation_index: number | null
  reason: DataQsReason
  recorded_value: string | null
  requested_value: string | null
  factual_basis: string
}

export interface DataQsPriorActivity {
  has_prior_request: boolean
  prior_request_id: string | null
  prior_representative: string | null
  prior_decision: string | null
  pending_court: boolean
  notes: string | null
}

export interface DataQsCaseCreateInput {
  inspection_id: string
  issues: DataQsIssueInput[]
  prior_activity: DataQsPriorActivity
}

export interface DataQsSubmitInput {
  expected_version: number
  signer_name: string
  signer_title: string | null
  terms_version: string
  accept: true
}

export interface DataQsEvidence {
  id: number
  file_name: string
  mime_type: string
  size_bytes: number
  sha256: string
  document_date: string | null
  scan_status: 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED'
  uploaded_by_name: string | null
  uploaded_at: string
  links: { issue_id: number; relevance: string }[]
}

export interface DataQsIssue {
  id: number
  violation_code: string | null
  violation_description: string | null
  violation_unit: string | null
  out_of_service: boolean
  citation_number: string | null
  reason: DataQsReason
  reason_label: string
  recorded_value: string | null
  requested_value: string | null
  factual_basis: string | null
  outcome: string | null
  evidence_count: number
  checklist: string[]
}

export interface DataQsCase extends DataQsCaseSummary {
  event: DataQsEvent
  /** As assessed when the case was opened */
  eligibility: Eligibility
  prior_activity: DataQsPriorActivity | null
  issues: DataQsIssue[]
  evidence: DataQsEvidence[]
  authorizations: {
    kind: string
    signer_name: string
    signer_title: string | null
    terms_version: string
    approved_at: string
    revoked_at: string | null
  }[]
  missing_items: string[]
  can_act: boolean
  can_upload: boolean
  can_submit: boolean
  /** Carrier: send the case back to STS after adding evidence */
  can_resubmit: boolean
  /** Carrier: approve or ask for changes to the current package */
  can_approve: boolean
  can_assign: boolean
  can_assess: boolean
  can_build_package: boolean
  consent: { terms_version: string; text: string }
  /** What a carrier agrees to when approving a package */
  package_terms: { terms_version: string; text: string }
  assessments: DataQsAssessment[]
  assessment_checks: { key: string; label: string; hint: string }[]
  /** Staff: every version, newest first; clients: the current one */
  packages: DataQsPackage[]
  /** Open tasks (clients see only their own) */
  tasks: DataQsTask[]
  /** STS staff only */
  audit: { action: string; actor_name: string | null; at: string; detail: unknown }[] | null
}

export type DataQsAssessmentOutcome =
  | 'READY_TO_PREPARE'
  | 'EVIDENCE_NEEDED'
  | 'PENDING_EXTERNAL'
  | 'SPECIALIST_REVIEW'
  | 'INSUFFICIENT_BASIS'

export type CheckResult = 'PASS' | 'ISSUE' | 'NA'

/** One assessment check's answer. */
export interface DataQsCheckAnswer {
  result: CheckResult
  note: string | null
}

export interface DataQsAssessment {
  id: number
  outcome: DataQsAssessmentOutcome
  outcome_label: string
  assessor_name: string | null
  created_at: string
  checks: Record<string, DataQsCheckAnswer>
  /** Shown to the carrier */
  carrier_message: string | null
  /** STS only; always null for clients */
  internal_note: string | null
}

export interface DataQsManifest {
  format: string
  package_version: number
  carrier: { usdot_number: number; legal_name: string | null; company: string | null }
  representative: { company: string; email: string; phone: string; specialist: string | null }
  event: {
    type: string
    source_event_id: string
    inspection_report_number: string | null
    citation_number: string | null
    police_report_number: string | null
    date: string | null
    state: string | null
  }
  issues: {
    issue_id: number
    violation_code: string | null
    violation_unit: string | null
    description: string | null
    reason: DataQsReason
    recorded_value: string | null
    requested_value: string | null
  }[]
  narrative_sha256: string
  evidence: {
    evidence_id: number
    file_name: string
    mime_type: string
    size_bytes: number
    sha256: string
    document_date: string | null
    scan_status: string
    issue_ids: number[]
  }[]
  references: string[]
}

export interface DataQsPackage {
  id: number
  package_version: number
  narrative: string
  manifest: DataQsManifest
  /** SHA-256 of the manifest: the package's fingerprint */
  manifest_hash: string
  created_by_name: string | null
  created_at: string
  invalidated_at: string | null
  /** The carrier's approval of this exact package still stands */
  approved: boolean
}

export interface DataQsTask {
  id: number
  kind: string
  title: string
  detail: string | null
  action_owner: 'CARRIER' | 'STS' | 'AGENCY'
  assignee_name: string | null
  due_at: string | null
  created_at: string
}

export interface DataQsStaffUser {
  id: number
  full_name: string
  role: string
}

export interface DataQsAssessmentInput {
  expected_version: number
  outcome: DataQsAssessmentOutcome
  checks: Record<string, DataQsCheckAnswer>
  carrier_message: string | null
  internal_note: string | null
}

export interface DataQsPackageInput {
  expected_version: number
  narrative: string
  evidence_ids: number[]
  references: string[]
}

export interface DataQsApprovalInput {
  expected_version: number
  package_id: number
  package_hash: string
  signer_name: string
  signer_title: string | null
  terms_version: string
  accept: true
}
