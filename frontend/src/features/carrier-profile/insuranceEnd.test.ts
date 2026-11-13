import { describe, expect, it } from 'vitest'

import { policyEnd } from './insuranceEnd'

const on = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('policyEnd', () => {
  it('ends one calendar year after the effective date', () => {
    expect(policyEnd('2025-09-23', on('2026-01-10'))).toEqual({
      date: '2026-09-23',
      daysLeft: 256,
      renewals: 0,
    })
  })

  it('moves to the next policy year once the end date has passed', () => {
    // Stingray's United Financial filing, seen on 2026-11-12: still on file, so it renewed.
    expect(policyEnd('2025-09-23', on('2026-11-12'))).toEqual({
      date: '2027-09-23',
      daysLeft: 315,
      renewals: 1,
    })
  })

  it('keeps an end date that is today', () => {
    expect(policyEnd('2025-09-23', on('2026-09-23'))?.daysLeft).toBe(0)
  })

  it('handles leap years', () => {
    // A year that contains Feb 29 is still one calendar year.
    expect(policyEnd('2023-03-01', on('2023-06-01'))?.date).toBe('2024-03-01')
    // Feb 29 has no match the next year: the policy ends Feb 28.
    expect(policyEnd('2024-02-29', on('2024-03-01'))?.date).toBe('2025-02-28')
    // ...and Feb 29 again in the next leap year.
    expect(policyEnd('2024-02-29', on('2027-03-01'))?.date).toBe('2028-02-29')
  })

  it('needs an effective date', () => {
    expect(policyEnd(null)).toBeNull()
    expect(policyEnd('not a date')).toBeNull()
  })
})
