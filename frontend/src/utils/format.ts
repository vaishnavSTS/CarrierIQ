const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

/** ISO timestamp -> "Oct 8, 2026, 3:00 PM" in the viewer's time zone; "—" when missing. */
export function formatDateTime(value: string | null): string {
  return value ? dateTime.format(new Date(value)) : '—'
}

const localDay = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

/** ISO timestamp -> "Oct 8, 2026" in the viewer's time zone; "—" when missing. */
export function formatLocalDate(value: string | null): string {
  return value ? localDay.format(new Date(value)) : '—'
}

/** ISO date (YYYY-MM-DD) -> "Oct 8, 2026"; read as UTC so it never shifts a day. */
export function formatDate(value: string | null): string {
  return value ? dateOnly.format(new Date(`${value}T00:00:00Z`)) : '—'
}

/** 0.0748 -> "7.5%"; "—" when there is nothing to divide. */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

/** 3604794800 -> "(360) 479-4800"; other lengths are shown as stored. */
export function formatPhone(digits: string): string {
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : digits
}

/** "legal_name" -> "Legal name" */
export function humanize(field: string): string {
  const text = field.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "1000000.00" -> "$1,000,000"; "—" when missing. */
export function formatMoney(value: string | number | null): string {
  if (value === null || value === '') return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

/** Where an authority / insurance status came from, for display. */
export function sourceLabel(source: string | null, asOf: string | null): string {
  if (source === 'MOTUS') return `FMCSA Motus · ${formatDate(asOf)}`
  if (source === 'LEGACY_LI') return `FMCSA L&I · as of ${formatDate(asOf)} (no longer updated)`
  if (source === 'CENSUS') return 'Census docket status only — no authority record found'
  if (source === 'MIXED') return `FMCSA Motus and L&I · as of ${formatDate(asOf)}`
  return '—'
}
