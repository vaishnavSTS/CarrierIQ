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
  consent: { terms_version: string; text: string }
  /** STS staff only */
  audit: { action: string; actor_name: string | null; at: string; detail: unknown }[] | null
}
