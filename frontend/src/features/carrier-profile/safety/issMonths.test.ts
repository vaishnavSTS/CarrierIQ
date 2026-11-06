import { describe, expect, it } from 'vitest'

import type { EstimatedIss, IssHistoryEntry } from '../../../types/carrierSafety'
import { issByMonth } from './issMonths'

const iss = {
  value: 72,
  band: 'OPTIONAL',
  data_month: '2026-11-01',
} as EstimatedIss

function saved(data_month: string, value: number | null, recorded_at: string): IssHistoryEntry {
  return {
    value,
    band: value === null ? null : value >= 75 ? 'INSPECT' : value >= 50 ? 'OPTIONAL' : 'PASS',
    reason: '',
    data_month,
    version: 'iss-est v2.1',
    recorded_at,
  }
}

describe('issByMonth', () => {
  it('keeps the newest result in a month and ends on the live one', () => {
    const history = [
      saved('2026-11-01', 72, '2026-11-02T10:00:00Z'),
      saved('2026-10-01', 80, '2026-10-31T10:00:00Z'),
      saved('2026-10-01', 60, '2026-10-15T10:00:00Z'),
    ]
    expect(issByMonth(iss, history).map((m) => [m.month, m.value, m.carried])).toEqual([
      ['2026-10-01', 80, false],
      ['2026-11-01', 72, false],
    ])
  })

  it('carries a score through months with nothing saved', () => {
    const history = [saved('2026-08-01', 40, '2026-08-20T10:00:00Z')]
    expect(issByMonth(iss, history).map((m) => [m.month, m.value, m.carried])).toEqual([
      ['2026-08-01', 40, false],
      ['2026-09-01', 40, true],
      ['2026-10-01', 40, true],
      ['2026-11-01', 72, false],
    ])
  })

  it('crosses a year end', () => {
    const january = { ...iss, data_month: '2027-01-01' }
    const history = [saved('2026-12-01', 55, '2026-12-20T10:00:00Z')]
    expect(issByMonth(january, history).map((m) => m.month)).toEqual(['2026-12-01', '2027-01-01'])
  })

  it('has one month when everything saved is from the current month', () => {
    expect(issByMonth(iss, [saved('2026-11-01', 72, '2026-11-02T10:00:00Z')])).toHaveLength(1)
  })
})
