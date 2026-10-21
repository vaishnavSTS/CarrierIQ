import type {
  DataQsCase,
  DataQsCaseCreateInput,
  DataQsCaseSummary,
  DataQsCheck,
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
