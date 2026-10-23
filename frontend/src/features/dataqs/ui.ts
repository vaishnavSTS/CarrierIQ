/** Shared DataQs form styles. */
// Phones: at least 44px tall, a comfortable tap; wider screens: compact.
const button =
  'inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0'

export const primaryButton = `${button} bg-cta text-cta-ink ring-cta hover:bg-cta-hover active:bg-cta-active`
export const secondaryButton = `${button} bg-surface text-slate-900 ring-slate-300 hover:bg-slate-50`

/** "a1b2c3d4…e5f6" for showing a SHA-256 fingerprint; the full value is in the title. */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`
}

/** DataQs statuses: the first, second and last were seen in STS's recordings; staff can type
 * others DataQs shows. */
export const DATAQS_STATUSES = [
  'New',
  'Open - In Review',
  'Closed - Data Correction Made',
  'Closed - No Data Correction Made',
]
