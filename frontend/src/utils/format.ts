const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

/** ISO timestamp -> "Oct 8, 2026, 3:00 PM" in the viewer's time zone; "—" when missing. */
export function formatDateTime(value: string | null): string {
  return value ? dateTime.format(new Date(value)) : '—'
}

/** ISO date (YYYY-MM-DD) -> "Oct 8, 2026"; read as UTC so it never shifts a day. */
export function formatDate(value: string | null): string {
  return value ? dateOnly.format(new Date(`${value}T00:00:00Z`)) : '—'
}
