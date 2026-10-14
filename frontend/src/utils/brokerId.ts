/** The number typed, as digits ("MC-261603" → 261603), or null when it isn't one. */
export function parseBrokerId(value: string): number | null {
  const digits = value.trim().replace(/^MC[\s-]*/i, '')
  return /^\d{1,8}$/.test(digits) ? Number(digits) : null
}
