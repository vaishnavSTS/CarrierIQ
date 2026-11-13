import { describe, expect, it } from 'vitest'

import { policyEnd } from './insuranceEnd'

const on = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('policyEnd', () => {
  it('ends one calendar year after the effective date', () => {
    expect(policyEnd('2025-09-23', '2026-01-10', on('2026-01-10'))).toEqual({
      date: '2026-09-23',
      daysLeft: 256,
      renewals: 0,
      unconfirmed: false,
    })
  })

  it('moves to the next year when up-to-date data still shows it on file', () => {
    // Motus, refreshed today: still on file after Sep 23, 2026, so it renewed.
    expect(policyEnd('2025-09-23', '2026-11-12', on('2026-11-12'))).toEqual({
      date: '2027-09-23',
      daysLeft: 315,
      renewals: 1,
      unconfirmed: false,
    })
  })

  it('keeps a passed end date when the data stops before it', () => {
    // National Union, MC 207446: L&I frozen May 14, 2026, before the Jun 18, 2026 end.
    expect(policyEnd('2025-06-18', '2026-05-14', on('2026-11-12'))).toEqual({
      date: '2026-06-18',
      daysLeft: -147,
      renewals: 0,
      unconfirmed: true,
    })
    // Not yet passed: still a normal upcoming end date.
    expect(policyEnd('2025-09-23', '2026-05-14', on('2026-06-01'))?.unconfirmed).toBe(false)
  })

  it('rolls on only through years the data covers', () => {
    // On file since 2021 and seen on May 14, 2026: renewed through Jun 18, 2025, not 2026.
    expect(policyEnd('2021-06-18', '2026-05-14', on('2026-11-12'))?.date).toBe('2026-06-18')
  })

  it('keeps an end date that is today', () => {
    expect(policyEnd('2025-09-23', null, on('2026-09-23'))?.daysLeft).toBe(0)
  })

  it('handles leap years', () => {
    expect(policyEnd('2023-03-01', null, on('2023-06-01'))?.date).toBe('2024-03-01')
    expect(policyEnd('2024-02-29', null, on('2024-03-01'))?.date).toBe('2025-02-28')
    expect(policyEnd('2024-02-29', null, on('2027-03-01'))?.date).toBe('2028-02-29')
  })

  it('needs an effective date', () => {
    expect(policyEnd(null)).toBeNull()
    expect(policyEnd('not a date')).toBeNull()
  })
})
