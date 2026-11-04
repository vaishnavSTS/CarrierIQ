import { describe, expect, it } from 'vitest'

import type { Renewal } from '../../../types/carrierAuthority'
import type { CarrierProfile } from '../../../types/carrierProfile'
import type { DataQsCaseSummary } from '../../../types/dataqs'
import type { CarrierNetwork, RegistrationCheck } from '../../../types/network'
import { actionItems, needsAction, nextMcs150 } from './actionItems'

const TODAY = new Date(2026, 10, 4) // Nov 4, 2026

const profile = {
  usdot_number: 1234567, // MCS-150 month: July, even years
  last_mcs150_date: '2024-07-10',
  timeline: [],
  recent_changes: [],
} as unknown as CarrierProfile

function network(checks: Partial<RegistrationCheck>[] = []): CarrierNetwork {
  return {
    usdot_number: 1234567,
    linked_carriers: [],
    links_checked_at: null,
    registration_checks: checks.map((c, i) => ({
      key: `k${i}`,
      label: 'Check',
      status: 'ok',
      detail: '',
      source: 'FMCSA census',
      as_of: null,
      ...c,
    })),
    ownership: { state: 'NONE', summary: '', action: null },
    identity_events: [],
  }
}

const dataqsCase = (over: Partial<DataQsCaseSummary>) =>
  ({
    id: 7,
    usdot_number: 1234567,
    work_status: 'EVIDENCE_NEEDED',
    action_owner: 'CARRIER',
    next_action: 'Upload your evidence',
    next_deadline_at: null,
    next_deadline_label: null,
    event_date: '2026-09-01',
    event_state: 'CA',
    ...over,
  }) as DataQsCaseSummary

const renewal = (over: Partial<Renewal>): Renewal => ({
  docket: 'MC123',
  insurance_type: 'BIPD',
  current_effective: '2026-03-01',
  since: '2022-03-01',
  filings: 4,
  expected: '2027-03-01',
  data_as_of: null,
  state: 'pattern',
  summary: 'Filings have started around March 1 each year.',
  ...over,
})

const build = (over: Partial<Parameters<typeof actionItems>[0]> = {}) =>
  actionItems({
    profile,
    network: network(),
    renewals: [],
    cases: [],
    page: '/portal/carriers/1234567',
    today: TODAY,
    ...over,
  })

describe('nextMcs150', () => {
  it('follows 49 CFR 390.19 for the USDOT number', () => {
    expect(nextMcs150(1234567, '2024-07-10', TODAY)).toEqual({ month: 6, year: 2028 })
  })

  it('moves two years on once this cycle’s month has been filed', () => {
    const july2026 = new Date(2026, 6, 15)
    expect(nextMcs150(1234567, '2026-07-02', july2026)).toEqual({ month: 6, year: 2028 })
    expect(nextMcs150(1234567, '2024-07-02', july2026)).toEqual({ month: 6, year: 2026 })
  })
})

describe('actionItems', () => {
  it('puts broker flags and cases waiting on the carrier ahead of dates', () => {
    const items = build({
      network: network([{ key: 'boc3', status: 'alert', label: 'No BOC-3' }]),
      cases: [dataqsCase({}), dataqsCase({ id: 8, action_owner: 'STS' })],
      renewals: [renewal({})],
    })
    expect(items.map((i) => i.key)).toEqual([
      'check-boc3',
      'dataqs-7',
      'dataqs-8',
      'mcs150-schedule',
      'renewal-MC123-BIPD',
    ])
    expect(items.filter(needsAction).map((i) => i.key)).toEqual(['check-boc3', 'dataqs-7'])
  })

  it('leaves out closed cases and renewals that are flagged or passed', () => {
    const items = build({
      network: network([{ key: 'renewal_bipd', status: 'attention' }]),
      cases: [dataqsCase({ work_status: 'CLOSED' })],
      renewals: [
        renewal({ state: 'unconfirmed' }),
        renewal({ insurance_type: 'CARGO', state: 'passed' }),
      ],
    })
    expect(items.map((i) => i.key)).toEqual(['check-renewal_bipd', 'mcs150-schedule'])
  })

  it('shows an overdue MCS-150 as the broker flag only', () => {
    const items = build({ network: network([{ key: 'mcs150', status: 'attention' }]) })
    expect(items.map((i) => i.key)).toEqual(['check-mcs150'])
  })

  it('labels an expected renewal as an estimate', () => {
    const [item] = build({ renewals: [renewal({ state: 'upcoming' })] }).filter(
      (i) => i.kind === 'renewal',
    )
    expect(item.level).toBe('due')
    expect(item.badge?.label).toBe('Estimate')
    expect(item.title).toContain('expected around Mar 2027')
  })
})
