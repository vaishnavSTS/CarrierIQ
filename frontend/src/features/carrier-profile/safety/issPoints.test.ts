import { describe, expect, it } from 'vitest'

import type { EstimatedIss, IssHistoryEntry } from '../../../types/carrierSafety'
import { issChanges, issPoints } from './issPoints'

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

// Newest first, as the API sends it.
const history = [
  saved('2026-11-01', 72, '2026-11-10T09:00:00Z'),
  saved('2026-11-01', 72, '2026-11-09T09:00:00Z'),
  saved('2026-10-01', 80, '2026-10-20T09:00:00Z'),
  saved('2026-10-01', 80, '2026-10-15T09:00:00Z'),
  saved('2026-10-01', 60, '2026-10-02T09:00:00Z'),
]

describe('issPoints', () => {
  it('draws every saved check, oldest first, ending on the live score', () => {
    expect(issPoints(iss, history).map((p) => [p.at.slice(0, 10), p.value])).toEqual([
      ['2026-10-02', 60],
      ['2026-10-15', 80],
      ['2026-10-20', 80],
      ['2026-11-09', 72],
      ['2026-11-10', 72],
    ])
  })

  it('adds the live score when it is not saved yet', () => {
    const now = new Date('2026-11-11T12:00:00Z')
    const points = issPoints({ ...iss, value: 68 }, history, now)
    expect(points).toHaveLength(6)
    expect(points[5]).toMatchObject({ at: now.toISOString(), value: 68 })
    expect(issPoints(iss, [], now)).toEqual([
      { at: now.toISOString(), value: 72, band: 'OPTIONAL', data_month: '2026-11-01' },
    ])
  })
})

describe('issChanges', () => {
  it('keeps only the checks where the score or its FMCSA month changed', () => {
    expect(issChanges(history).map((h) => h.recorded_at.slice(0, 10))).toEqual([
      '2026-11-09',
      '2026-10-15',
      '2026-10-02',
    ])
  })
})
