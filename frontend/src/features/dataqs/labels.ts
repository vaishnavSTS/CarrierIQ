import type {
  DataQsOtpMethod,
  DataQsOtpPreference,
  DataQsWorkStatus,
  EligibilityStatus,
} from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'
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
  'filing_proof.uploaded': 'Proof of filing added',
  'call.booking_link': 'Opened STS’s booking page for a call',
  'call.booked': 'Call with STS booked',
  'otp.preference_set': 'Chose how STS signs in to file',
  'agent_access.requested_by_carrier': 'Asked STS to request FMCSA Portal access',
  'agent_access.request_sent': 'STS requested FMCSA Portal access',
  'agent_access.reminded': 'Reminded to approve STS’s access',
  'agent_access.granted': 'FMCSA Portal access approved',
  'agent_access.withdrawn': 'Access request withdrawn (another way chosen)',
  'call.moved': 'Call with STS moved',
  'call.cancelled': 'Call with STS cancelled',
  'call.done': 'Call with STS held',
  'filing_proof.downloaded': 'Proof of filing downloaded',
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

/** How the carrier gives STS the FMCSA login code. */
export const OTP_METHOD_LABEL: Record<DataQsOtpMethod, string> = {
  TEXT: 'Text message',
  AI_CALL: 'Automated call',
  SCHEDULED_CALL: 'A call at a booked time',
  AUTHORIZED_AGENT: 'Authorize STS as an agent',
}

export function otpChoiceText(p: DataQsOtpPreference): string {
  if (p.method === 'SCHEDULED_CALL' && p.call_at) {
    return `A call to ${p.phone} within 5 minutes of ${formatDateTime(p.call_at)}`
  }
  if (p.method === 'SCHEDULED_CALL') {
    return `A call to ${p.phone} at the time booked on STS’s appointment page`
  }
  if (p.method === 'AUTHORIZED_AGENT') {
    return 'Authorizing STS as an agent in the FMCSA Portal (no login code needed)'
  }
  return `${OTP_METHOD_LABEL[p.method]} to ${p.phone}`
}
