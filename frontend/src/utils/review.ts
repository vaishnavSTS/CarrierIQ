/** "3 open signals" / "No open signals"; null when signals haven't been computed. */
export function reviewLabel(status: string | null, count: number): string | null {
  if (status === null) return null
  if (status === 'NO_OPEN_SIGNALS') return 'No open signals'
  return `${count} open signal${count === 1 ? '' : 's'}`
}
