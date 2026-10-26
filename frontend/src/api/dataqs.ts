import type {
  DataQsApprovalInput,
  DataQsAssessmentInput,
  DataQsCase,
  DataQsCaseCreateInput,
  DataQsMissingInspectionInput,
  DataQsOtpPreferenceInput,
  DataQsCaseSummary,
  DataQsAttemptStartInput,
  DataQsCheck,
  DataQsConfirmInput,
  DataQsCorrespondenceInput,
  DataQsPackageInput,
  DataQsStaffUser,
  DataQsSubmitInput,
  DataQsSupervisor,
} from '../types/dataqs'
import { apiGet, apiRequest } from './client'

/** /dataqs for STS staff, /portal/dataqs for clients (useDataQsBase). */
export type DataQsBase = '/dataqs' | '/portal/dataqs'

export function fetchDataQsCases(base: DataQsBase): Promise<{ cases: DataQsCaseSummary[] }> {
  return apiGet(`${base}/cases`)
}

export function fetchDataQsCase(base: DataQsBase, caseId: number): Promise<DataQsCase> {
  return apiGet(`${base}/cases/${caseId}`)
}

export function fetchDataQsCheck(
  base: DataQsBase,
  usdotNumber: number,
  inspectionId: string,
): Promise<DataQsCheck> {
  return apiGet(
    `${base}/carriers/${usdotNumber}/inspections/${encodeURIComponent(inspectionId)}/check`,
  )
}

/** Clients only. The key makes a repeated submit return the first case. */
export function createDataQsCase(
  base: DataQsBase,
  usdotNumber: number,
  input: DataQsCaseCreateInput,
  idempotencyKey: string,
): Promise<DataQsCase> {
  return apiRequest(`${base}/carriers/${usdotNumber}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
}

/** Open a DRAFT case for an inspection missing from the carrier's record. */
export function createDataQsMissingInspection(
  usdotNumber: number,
  input: DataQsMissingInspectionInput,
  idempotencyKey: string,
): Promise<DataQsCase> {
  return apiRequest(`/portal/dataqs/carriers/${usdotNumber}/missing-inspections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
}

export function uploadDataQsEvidence(
  base: DataQsBase,
  caseId: number,
  file: File,
  links: { issue_id: number; relevance: string }[],
  documentDate: string | null,
  title: string | null = null,
): Promise<DataQsCase> {
  const form = new FormData()
  form.append('file', file)
  form.append('links', JSON.stringify(links))
  if (documentDate) form.append('document_date', documentDate)
  if (title) form.append('title', title)
  return apiRequest(`${base}/cases/${caseId}/evidence`, { method: 'POST', body: form })
}

/** Clients only: sign the authorization and hand the case to STS. */
export function submitDataQsCase(caseId: number, input: DataQsSubmitInput): Promise<DataQsCase> {
  return apiRequest(`/portal/dataqs/cases/${caseId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** STS admins: exceptions across every case and each specialist's workload. */
export function fetchDataQsSupervisor(): Promise<DataQsSupervisor> {
  return apiGet('/dataqs/supervisor')
}

/** STS admins: the audit trail from `since` to `until` (YYYY-MM-DD, inclusive) as a CSV download. */
export function dataQsAuditExportUrl(since: string, until: string): string {
  const query = new URLSearchParams({ since, until })
  return `/api/v1/dataqs/supervisor/audit.csv?${query}`
}

/** A plain link: the browser downloads it with the session cookie; the API logs each download. */
export function dataQsEvidenceUrl(base: DataQsBase, caseId: number, evidenceId: number): string {
  return `/api/v1${base}/cases/${caseId}/evidence/${evidenceId}`
}

/** How the carrier gives STS the FMCSA login code (the carrier's owner, or STS for them). */
export function setDataQsOtpPreference(
  base: DataQsBase,
  caseId: number,
  input: DataQsOtpPreferenceInput,
): Promise<DataQsCase> {
  return apiRequest(`${base}/cases/${caseId}/otp-preference`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** STS: text or call the carrier for the code now, as they chose. */
export function requestDataQsOtp(caseId: number): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/otp-requests`, {})
}

/** STS: the code was used; wipe it. */
export function markDataQsOtpUsed(caseId: number, requestId: number): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/otp-requests/${requestId}/used`, {})
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// --- Phase 3: assessment, package, approval ---------------------------------------------------

/** Staff only: who a case can be assigned to. */
export function fetchDataQsStaff(): Promise<DataQsStaffUser[]> {
  return apiGet('/dataqs/staff')
}

export function assignDataQsOwner(
  caseId: number,
  expectedVersion: number,
  ownerId: number | null,
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/owner`, {
    expected_version: expectedVersion,
    owner_id: ownerId,
  })
}

export function assessDataQsCase(
  caseId: number,
  input: DataQsAssessmentInput,
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/assessments`, input)
}

export function buildDataQsPackage(caseId: number, input: DataQsPackageInput): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/packages`, input)
}

/** Clients only: send the case back to STS after adding evidence. */
export function resubmitDataQsCase(caseId: number, expectedVersion: number): Promise<DataQsCase> {
  return post(`/portal/dataqs/cases/${caseId}/resubmit`, { expected_version: expectedVersion })
}

/** Clients only: approve one exact package (id + fingerprint). */
export function approveDataQsPackage(
  caseId: number,
  input: DataQsApprovalInput,
): Promise<DataQsCase> {
  return post(`/portal/dataqs/cases/${caseId}/approvals`, input)
}

/** Clients only: ask STS to change the package. */
export function requestDataQsPackageChanges(
  caseId: number,
  expectedVersion: number,
  message: string,
): Promise<DataQsCase> {
  return post(`/portal/dataqs/cases/${caseId}/package-changes`, {
    expected_version: expectedVersion,
    message,
  })
}

// --- Phase 4: manual filing (staff only) --------------------------------------------------------

/** Record that filing has started; the key makes a repeated click return the same attempt. */
export function startDataQsFiling(
  caseId: number,
  input: DataQsAttemptStartInput,
  idempotencyKey: string,
): Promise<DataQsCase> {
  return apiRequest(`/dataqs/cases/${caseId}/submission-attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
}

export function confirmDataQsFiling(
  caseId: number,
  attemptId: number,
  input: DataQsConfirmInput,
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/submission-attempts/${attemptId}/confirm`, input)
}

/** `unconfirmed`: the portal timed out; `abandon`: nothing was submitted / not found in DataQs. */
export function settleDataQsFiling(
  caseId: number,
  attemptId: number,
  action: 'unconfirmed' | 'abandon',
  note: string,
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/submission-attempts/${attemptId}/${action}`, { note })
}

// --- Phase 5: agency events, appeals, deadlines (staff only) -----------------------------------

export function recordDataQsCorrespondence(
  caseId: number,
  input: DataQsCorrespondenceInput,
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/correspondence`, input)
}

export function proposeDataQsReview(
  caseId: number,
  expectedVersion: number,
  grounds: string,
  issueIds: number[],
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/review-requests`, {
    expected_version: expectedVersion,
    grounds,
    issue_ids: issueIds,
  })
}

/** STS admin: set a deadline by hand, with the reason. */
export function overrideDataQsClock(
  caseId: number,
  clockId: number,
  expectedVersion: number,
  dueAt: string,
  reason: string,
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/clocks/${clockId}/override`, {
    expected_version: expectedVersion,
    due_at: dueAt,
    reason,
  })
}

// --- Emails to the carrier, closing the file (staff only) --------------------------------------

export function emailDataQsCarrier(
  caseId: number,
  subject: string,
  body: string,
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/messages`, { subject, body })
}

/** Close the file; the carrier is emailed that it is closed, with the note. */
export function closeDataQsFile(
  caseId: number,
  expectedVersion: number,
  note: string,
  unverifiedReason?: string,
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/close`, {
    expected_version: expectedVersion,
    note,
    unverified_reason: unverifiedReason || null,
  })
}

/** Look at FMCSA's inspection record now instead of waiting for the daily check. */
export function checkDataQsCorrection(caseId: number): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/verification/check`, {})
}

/** STS confirms by hand, with its proof, that FMCSA's records show the correction. */
export function confirmDataQsCorrection(
  caseId: number,
  issueId: number,
  note: string,
): Promise<DataQsCase> {
  return post(`/dataqs/cases/${caseId}/issues/${issueId}/verification`, { note })
}
