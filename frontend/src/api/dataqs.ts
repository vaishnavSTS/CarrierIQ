import type {
  DataQsApprovalInput,
  DataQsAssessmentInput,
  DataQsCase,
  DataQsCaseCreateInput,
  DataQsCaseSummary,
  DataQsCheck,
  DataQsPackageInput,
  DataQsStaffUser,
  DataQsSubmitInput,
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
  usdotNumber: number,
  input: DataQsCaseCreateInput,
  idempotencyKey: string,
): Promise<DataQsCase> {
  return apiRequest(`/portal/dataqs/carriers/${usdotNumber}/cases`, {
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
): Promise<DataQsCase> {
  const form = new FormData()
  form.append('file', file)
  form.append('links', JSON.stringify(links))
  if (documentDate) form.append('document_date', documentDate)
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

/** A plain link: the browser downloads it with the session cookie; the API logs each download. */
export function dataQsEvidenceUrl(base: DataQsBase, caseId: number, evidenceId: number): string {
  return `/api/v1${base}/cases/${caseId}/evidence/${evidenceId}`
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
