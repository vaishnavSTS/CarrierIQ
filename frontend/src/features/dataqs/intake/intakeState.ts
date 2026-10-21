import type { DataQsPriorActivity, DataQsReason } from '../../../types/dataqs'

/** What the carrier says about one selected violation (or the whole inspection). */
export interface IssueDraft {
  reason: DataQsReason | ''
  recorded_value: string
  requested_value: string
  factual_basis: string
}

/** null is the inspection as a whole. */
export type Selection = (number | null)[]

export const MIN_BASIS = 20

export function emptyIssue(): IssueDraft {
  return { reason: '', recorded_value: '', requested_value: '', factual_basis: '' }
}

export function issueKey(index: number | null): string {
  return index === null ? 'whole' : String(index)
}

export function issueComplete(issue: IssueDraft | undefined): boolean {
  return !!issue && issue.reason !== '' && issue.factual_basis.trim().length >= MIN_BASIS
}

export const EMPTY_PRIOR: DataQsPriorActivity = {
  has_prior_request: false,
  prior_request_id: null,
  prior_representative: null,
  prior_decision: null,
  pending_court: false,
  notes: null,
}

export const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm'
export const labelClass = 'text-xs font-medium text-slate-600'
