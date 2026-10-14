import type { EstimatedIss } from '../../../types/carrierSafety'
import type { Tone } from '../../../utils/status'

/** FMCSA's band and CarrierIQ's plain-language status for it. */
export const ISS_BAND: Record<
  NonNullable<EstimatedIss['band']>,
  { label: string; status: string; tone: Tone }
> = {
  PASS: { label: 'Pass', status: 'Satisfactory', tone: 'ok' },
  OPTIONAL: { label: 'Optional', status: 'At risk', tone: 'warn' },
  INSPECT: { label: 'Inspect', status: 'Needs inspection', tone: 'down' },
}
