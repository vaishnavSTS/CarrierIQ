import { describe, expect, it } from 'vitest'

import { sourceLabel } from './format'

describe('sourceLabel', () => {
  it('names Motus when the data came from it', () => {
    expect(sourceLabel('MOTUS', '2026-11-10')).toBe('FMCSA Motus · as of Nov 10, 2026')
  })

  it('says an L&I source means Motus had no record, and when Motus was checked', () => {
    expect(sourceLabel('LEGACY_LI', '2026-05-14', '2026-11-10T19:48:00Z')).toBe(
      'FMCSA L&I · as of May 14, 2026 (no longer updated) · not in Motus (checked Nov 10, 2026)',
    )
    expect(sourceLabel('LEGACY_LI', '2026-05-14')).toBe(
      'FMCSA L&I · as of May 14, 2026 (no longer updated) · not in Motus',
    )
  })

  it('names both systems for mixed data', () => {
    expect(sourceLabel('MIXED', '2026-11-10')).toBe('FMCSA Motus and L&I · as of Nov 10, 2026')
  })
})
