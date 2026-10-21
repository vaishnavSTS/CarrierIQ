import type { DataQsWorkStatus, EligibilityStatus } from '../../types/dataqs'
import type { Tone } from '../../utils/status'

export const WORK_STATUS: Record<DataQsWorkStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  EVIDENCE_NEEDED: { label: 'Evidence needed', tone: 'warn' },
  STAFF_REVIEW: { label: 'STS review', tone: 'pending' },
  AWAITING_APPROVAL: { label: 'Awaiting approval', tone: 'warn' },
  READY_TO_FILE: { label: 'Ready to file', tone: 'pending' },
  SUBMISSION_UNCONFIRMED: { label: 'Filing unconfirmed', tone: 'warn' },
  MONITORING: { label: 'With the agency', tone: 'pending' },
  VERIFICATION: { label: 'Verifying correction', tone: 'pending' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
}

export const ELIGIBILITY: Record<EligibilityStatus, { label: string; tone: Tone }> = {
  POTENTIALLY_ELIGIBLE: { label: 'Potentially eligible for review', tone: 'ok' },
  STAFF_REVIEW: { label: 'STS will confirm timing', tone: 'warn' },
  MANUAL_ASSESSMENT: { label: 'Outside the usual window', tone: 'neutral' },
}

/** "Unit 1", "Driver", or the whole inspection. */
export function unitLabel(appliesTo: string | null, unit: number | string | null): string {
  if (appliesTo === 'DRIVER' || unit === 'D') return 'Driver'
  return unit !== null && unit !== undefined ? `Unit ${unit}` : 'Vehicle'
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
