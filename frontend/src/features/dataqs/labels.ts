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

/** Audit trail actions in words (the code stays as a tooltip for STS). */
const AUDIT_ACTIONS: Record<string, string> = {
  'case.created': 'Request opened',
  'case.submitted': 'Submitted to STS',
  'case.resubmitted': 'Sent back to STS with more evidence',
  'case.assessed': 'STS assessment recorded',
  'case.closed': 'File closed',
  'owner.changed': 'Case specialist changed',
  'evidence.uploaded': 'File uploaded',
  'evidence.downloaded': 'File downloaded',
  'package.built': 'Request package prepared',
  'package.approved': 'Carrier approved the package',
  'package.changes_requested': 'Carrier asked for changes to the package',
  'filing.started': 'Filing started',
  'filing.confirmed': 'Filing confirmed',
  'filing.unconfirmed': 'Filing marked unconfirmed',
  'filing.abandoned': 'Filing attempt abandoned',
  'agency.acknowledgement': 'Agency acknowledgement recorded',
  'agency.opened': 'Agency opened the request',
  'agency.info_request': 'Agency asked for information',
  'agency.info_response': 'Answer to the agency recorded',
  'agency.decision': 'Agency decision recorded',
  'agency.reopening': 'Agency reopened the request',
  'agency.other': 'Agency message recorded',
  'appeal.proposed': 'Appeal proposed',
  'deadline.overridden': 'Deadline changed by hand',
  'message.sent': 'Email to the carrier',
  'verification.seen': 'Correction seen in FMCSA’s data',
  'verification.confirmed': 'Correction confirmed by STS',
}

export function auditLabel(action: string): string {
  const words = action.replace(/[._]/g, ' ')
  return AUDIT_ACTIONS[action] ?? words.charAt(0).toUpperCase() + words.slice(1)
}
