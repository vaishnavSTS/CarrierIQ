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

/** DataQs's own reasons (its request wizard, step 3); UNSURE is ours. */
export type DataQsReason =
  | 'CITATION_OUTCOME'
  | 'VIOLATION_INCORRECT'
  | 'WRONG_CARRIER'
  | 'DRIVER_INCORRECT'
  | 'DUPLICATE_INSPECTION'
  | 'INCORRECT_INFORMATION'
  | 'COPY_REQUEST'
  | 'MISSING_INSPECTION'
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
  /** The state's report number (null in older cases) */
  report_number: string | null
  /** Unit 1's plate: DataQs can search by it */
  plate: string | null
  plate_state: string | null
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
  /** Exactly as DataQs words it */
  dataqs_label: string | null
  /** Suggested evidence, not a government standard */
  checklist: string[]
  /** About the whole inspection, never one violation (e.g. a copy request) */
  whole_inspection_only: boolean
}

export interface DataQsCaseSummary {
  id: number
  organization_id: number
  organization_name: string | null
  usdot_number: number
  carrier_name: string | null
  event_type: 'INSPECTION' | 'CRASH'
  source_event_id: string
  /** The state's report number: what DataQs searches by (null: not in FMCSA's data) */
  inspection_report_number: string | null
  event_date: string | null
  event_state: string | null
  /** Where the carrier saw the record (DataQs step 4) */
  viewed_in: string | null
  work_status: DataQsWorkStatus
  /** Exactly what DataQs last showed */
  government_raw_status: string | null
  /** The DataQs request ID, once filed */
  gov_request_id: string | null
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
  /** The soonest active deadline */
  next_deadline_at: string | null
  next_deadline_label: string | null
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
  viewed_in: string | null
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
  /** The short title DataQs asks for */
  title: string | null
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
  dataqs_reason_label: string | null
  recorded_value: string | null
  requested_value: string | null
  factual_basis: string | null
  outcome: string | null
  evidence_count: number
  checklist: string[]
  /** Phase 6, for a corrected issue: the decision, FMCSA's record, then CarrierSafetyScan */
  decided_at: string | null
  verification_status: DataQsVerificationStatus | null
  /** What the check saw (clients: not STS's own proof) */
  verification_note: string | null
  verified_at: string | null
  /** null: the automatic check */
  verified_by_name: string | null
  shown_at: string | null
}

export type DataQsVerificationStatus = 'WAITING' | 'VERIFIED' | 'REVIEW' | 'MANUAL'

/** A look at FMCSA's record that saw something new */
export interface DataQsVerificationCheck {
  at: string
  found: boolean | null
  changes: string[]
  error: string | null
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
  /** Staff: start filing the approved package */
  can_file: boolean
  /** Staff, once filed: record agency events */
  can_record_correspondence: boolean
  /** Staff: appeal denied issues within 30 days */
  can_propose_review: boolean
  /** STS admin */
  can_override_deadlines: boolean
  /** Staff: email the carrier */
  can_message: boolean
  /** Staff: close the file (the carrier is emailed) */
  can_close: boolean
  /** False until the email service is set up: emails wait */
  email_enabled: boolean
  consent: { terms_version: string; text: string }
  /** What a carrier agrees to when approving a package */
  package_terms: { terms_version: string; text: string }
  assessments: DataQsAssessment[]
  assessment_checks: { key: string; label: string; hint: string }[]
  /** Staff: every version, newest first; clients: the current one */
  packages: DataQsPackage[]
  /** Open tasks (clients see only their own) */
  tasks: DataQsTask[]
  /** Staff: every filing attempt; clients: confirmed ones */
  attempts: DataQsAttempt[]
  review_cycles: DataQsReviewCycle[]
  /** Active deadlines */
  clocks: DataQsClock[]
  correspondence: DataQsCorrespondence[]
  /** Newest first */
  timeline: DataQsTimelineEvent[]
  /** Emails to the carrier, newest first */
  messages: DataQsMessage[]
  /** STS staff only: every queued email */
  emails: DataQsEmail[] | null
  /** reason -> DataQs's wording */
  dataqs_reasons: Record<string, string>
  document_titles: string[]
  viewed_in_options: string[]
  /** STS staff only */
  audit: { action: string; actor_name: string | null; at: string; detail: unknown }[] | null
  /** When FMCSA's record was last looked at for an approved correction */
  verification_checked_at: string | null
  /** STS staff only: the last look failed */
  verification_error: string | null
  verification_checks: DataQsVerificationCheck[]
  /** Staff: check FMCSA now, confirm a correction by hand */
  can_verify: boolean
  /** Staff: the inspection is in FMCSA's data to look at now */
  can_check_fmcsa: boolean
  /** STS staff only: how to reach the carrier (null: not given yet) */
  carrier_contact: DataQsCarrierContact | null
}

/** How STS reaches a carrier about its DataQs requests */
export interface DataQsCarrierContact {
  usdot_number: number
  carrier_name: string | null
  /** The email on the carrier's FMCSA account; null until given */
  email: string | null
  phone: string | null
  /** Only the account owner can see whether an encrypted password is saved */
  password_saved: boolean | null
  updated_at: string | null
  updated_by_name: string | null
}

export interface DataQsCarrierContactList {
  /** The company's account owner */
  can_edit: boolean
  carriers: DataQsCarrierContact[]
}

/** An inspection missing from the carrier's record, described by the carrier */
export interface DataQsMissingInspectionInput {
  state: string
  report_number: string
  inspection_date: string
  level: number | null
  location: string | null
  factual_basis: string
}

export interface DataQsCarrierContactInput {
  email: string
  phone: string
  password?: string
  clear_password?: boolean
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
  dataqs_reason?: DataQsReason
  dataqs_reason_label?: string
  viewed_in?: string
  review_level?: DataQsReviewLevel
  narrative_sha256: string
  evidence: {
    evidence_id: number
    file_name: string
    title?: string
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
  dataqs_reason: DataQsReason
  viewed_in: string
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

export type DataQsAttemptStatus = 'STARTED' | 'UNCONFIRMED' | 'CONFIRMED' | 'ABANDONED'

export interface DataQsAttempt {
  id: number
  status: DataQsAttemptStatus
  package_version: number | null
  filed_by_name: string | null
  /** STS only */
  filing_account: string | null
  started_at: string
  filed_at: string | null
  gov_request_id: string | null
  assigned_agency: string | null
  /** STS only: the acknowledgement as DataQs showed it */
  acknowledgement: string | null
  confirmed_at: string | null
  /** STS only: why it was left unconfirmed or abandoned */
  note: string | null
}

export type DataQsReviewLevel = 'INITIAL' | 'RECONSIDERATION' | 'FINAL'

export interface DataQsReviewCycle {
  id: number
  level: DataQsReviewLevel
  cycle_number: number
  parent_cycle_id: number | null
  opened_reason: string | null
  /** null: an appeal STS is preparing, not filed yet */
  submitted_at: string | null
  decision_issued_at: string | null
  outcome: string | null
  decided_by: string | null
  reasons: string | null
  appeal_instructions: string | null
  procedural_reason: string | null
  appealed_issue_ids: number[] | null
  /** STS only */
  grounds: string | null
  /** STS only */
  independence_concern: string | null
  closed_at: string | null
}

export interface DataQsAttemptStartInput {
  package_id: number
  package_hash: string
  filing_account: string
}

export interface DataQsConfirmInput {
  gov_request_id: string
  filed_at: string
  assigned_agency: string | null
  acknowledgement: string
  package_version: number
  portal_status: string | null
}

export interface DataQsClock {
  id: number
  clock_type: 'FILING_WINDOW' | 'AGENCY_REVIEW' | 'REQUESTER_INFO' | 'APPEAL' | 'INTERNAL'
  label: string
  base_event: string
  base_at: string
  budget_days: number | null
  /** null while paused */
  due_at: string | null
  paused: boolean
  /** Remaining budget in days; negative once past */
  days_left: number
  confidence: string
  policy_version: string
  authority_source: string | null
  override_reason: string | null
}

export type DataQsCorrespondenceKind =
  | 'ACKNOWLEDGEMENT'
  | 'OPENED'
  | 'INFO_REQUEST'
  | 'INFO_RESPONSE'
  | 'DECISION'
  | 'REOPENING'
  | 'OTHER'

export interface DataQsCorrespondence {
  id: number
  kind: DataQsCorrespondenceKind
  source: string
  inbound: boolean
  text: string
  occurred_at: string | null
  external_id: string | null
  recorded_by_name: string | null
  recorded_at: string
}

export interface DataQsTimelineEvent {
  at: string
  title: string
  detail: string | null
}

export interface DataQsCorrespondenceInput {
  expected_version: number
  kind: 'OPENED' | 'INFO_REQUEST' | 'INFO_RESPONSE' | 'DECISION' | 'REOPENING' | 'OTHER'
  source: 'DATAQS_PORTAL' | 'EMAIL' | 'PHONE' | 'OTHER'
  text: string
  occurred_at: string
  external_id: string | null
  portal_status: string | null
  assigned_agency: string | null
  decision: {
    issue_outcomes: Record<number, 'CORRECTED' | 'NOT_CORRECTED'>
    procedural_reason: 'INSUFFICIENT_INFORMATION' | 'NO_RESPONSE' | null
    decided_by: string | null
    reasons: string | null
    appeal_instructions: string | null
  } | null
  reopening: { mode: 'SAME_LEVEL' | 'RETURN_TO_INITIAL'; reason: string } | null
}

export interface DataQsMessage {
  id: number
  /** MESSAGE (written by STS staff) or the step that sent it */
  kind: string
  subject: string
  body: string
  /** null: sent by the app */
  author_name: string | null
  /** STS only */
  recipients: string[]
  delivery: 'SENT' | 'WAITING' | 'FAILED' | 'NOT_SENT'
  created_at: string
}

export interface DataQsEmail {
  id: number
  kind: string
  to: string[]
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
  scheduled_for: string | null
  sent_at: string | null
  attempts: number
  last_error: string | null
}

/** Something on a case an STS supervisor should look at */
export interface DataQsException {
  /** e.g. DEADLINE_OVERDUE, UNASSIGNED, EMAIL_FAILED, STALE */
  kind: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  case_id: number
  organization_name: string | null
  usdot_number: number
  owner_name: string | null
  work_status: DataQsWorkStatus
  title: string
  detail: string
  /** When it was due, failed or last moved */
  at: string | null
}

/** Open cases per case specialist; owner_id null = unassigned */
export interface DataQsWorkload {
  owner_id: number | null
  owner_name: string | null
  active_cases: number
  needs_sts: number
  waiting_carrier: number
  waiting_agency: number
  overdue_tasks: number
  overdue_deadlines: number
}

/** STS admins only */
export interface DataQsSupervisor {
  generated_at: string
  stale_days: number
  /** Most serious first */
  exceptions: DataQsException[]
  workload: DataQsWorkload[]
}
