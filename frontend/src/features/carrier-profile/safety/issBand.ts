import type { EstimatedIss } from '../../../types/carrierSafety'
import type { Tone } from '../../../utils/status'

/** CarrierSafetyScan's plain-language status for each of FMCSA's ISS bands, and the values it covers. */
export const ISS_BAND: Record<
  NonNullable<EstimatedIss['band']>,
  { status: string; range: string; tone: Tone }
> = {
  PASS: { status: 'Satisfactory', range: '1–49', tone: 'ok' },
  OPTIONAL: { status: 'At risk', range: '50–74', tone: 'warn' },
  INSPECT: { status: 'High risk', range: '75–100', tone: 'down' },
}

/** A BASIC this many percentile points or fewer under its threshold is flagged as close to it. */
export const NEAR_THRESHOLD_POINTS = 15
