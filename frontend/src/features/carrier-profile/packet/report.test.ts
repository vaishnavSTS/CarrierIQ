import { describe, expect, it } from 'vitest'

import type { CarrierAuthority } from '../../../types/carrierAuthority'
import type { CarrierProfile } from '../../../types/carrierProfile'
import type { EstimatedIss, SmsInspection, SmsViolation } from '../../../types/carrierSafety'
import type { CarrierNetwork } from '../../../types/network'
import { carrierSummary } from '../carrierSummary'
import type { BrokerFlag } from '../network/brokerFlags'
import { packetItems } from './packetItems'
import { rollOff, timeWeightOn, truckRecords, violationText } from './recordDetail'

const TODAY = new Date('2026-11-02T12:00:00')

function violation(over: Partial<SmsViolation> = {}): SmsViolation {
  return {
    code: '393.47',
    description: 'Brakes',
    basic: 'Vehicle Maint.',
    group: null,
    unit: '1',
    out_of_service: false,
    severity_weight: 4,
    time_weight: 3,
    total_weight: 4,
    ...over,
  }
}

function inspection(id: string, date: string, over: Partial<SmsInspection> = {}): SmsInspection {
  return {
    inspection_id: id,
    inspection_date: date,
    report_number: null,
    state: 'CA',
    level: 1,
    plate: 'ABC123',
    plate_state: 'CA',
    vin: 'VIN1',
    vehicle_oos: false,
    driver_oos: false,
    violations: [violation()],
    ...over,
  }
}

describe('timeWeightOn', () => {
  it('follows FMCSA: 3 for 6 months, 2 until 12, 1 until 24, then nothing', () => {
    expect(timeWeightOn('2026-01-15', new Date('2026-07-14T00:00:00'))).toBe(3)
    expect(timeWeightOn('2026-01-15', new Date('2026-07-15T00:00:00'))).toBe(2)
    expect(timeWeightOn('2026-01-15', new Date('2027-01-15T00:00:00'))).toBe(1)
    expect(timeWeightOn('2026-01-15', new Date('2028-01-14T00:00:00'))).toBe(1)
    expect(timeWeightOn('2026-01-15', new Date('2028-01-15T00:00:00'))).toBe(0)
  })
})

describe('rollOff', () => {
  it('starts at severity × today’s weight, only falls, and reaches zero', () => {
    const months = rollOff([inspection('a', '2026-10-01')], TODAY)
    expect(months).toHaveLength(25)
    expect(months[0].points).toBe(12) // severity 4 × weight 3
    for (let i = 1; i < months.length; i += 1) {
      expect(months[i].points).toBeLessThanOrEqual(months[i - 1].points)
    }
    expect(months[months.length - 1].points).toBe(0)
  })

  it('applies FMCSA’s cap of 30 per inspection in a BASIC', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      violation({ code: `c${i}`, severity_weight: 10, total_weight: 10 }),
    )
    const months = rollOff([inspection('a', '2026-10-01', { violations: many })], TODAY)
    expect(months[0].points).toBeCloseTo(90) // capped at 30 × weight 3
  })
})

describe('truckRecords', () => {
  it('groups by VIN, finds repeats, and leaves out trailer and driver violations', () => {
    const { trucks, unmatched } = truckRecords([
      inspection('a', '2026-10-01'),
      inspection('b', '2026-09-01', {
        violations: [
          violation({ out_of_service: true, severity_weight: 6, total_weight: 6 }),
          violation({ code: 'trailer', unit: '2' }),
          violation({ code: 'log', unit: 'D', basic: 'HOS Compliance' }),
        ],
      }),
      inspection('c', '2026-08-01', { vin: 'VIN2', plate: 'XYZ', violations: [violation()] }),
    ])
    expect(unmatched).toBe(0)
    expect(trucks.map((t) => t.id)).toEqual(['VIN1', 'VIN2'])
    expect(trucks[0].inspections).toBe(2)
    expect(trucks[0].violations).toBe(2)
    expect(trucks[0].outOfService).toBe(1)
    expect(trucks[0].repeats).toEqual([{ code: '393.47', description: 'Brakes', inspections: 2 }])
    expect(trucks[1].repeats).toEqual([])
  })

  it('falls back to the plate, and only counts an inspection with neither', () => {
    const { trucks, unmatched } = truckRecords([
      inspection('a', '2026-10-01', { vin: null }),
      inspection('b', '2026-10-01', { vin: null, plate: null }),
    ])
    expect(trucks[0].id).toBe('CA ABC123')
    expect(trucks[0].vin).toBeNull()
    expect(unmatched).toBe(1)
  })
})

describe('violationText', () => {
  it('marks only what FMCSA itself cut off', () => {
    const short = violationText('Brakes', 'fallback')
    expect(short).toContain('Brakes')
    expect(violationText(null, 'fallback')).toContain('fallback')
  })
})

const authority = {
  dockets: [],
  current_insurance: [],
  authority_history: [],
  process_agents: [],
} as unknown as CarrierAuthority
const network = { registration_checks: [], linked_carriers: [] } as unknown as CarrierNetwork
const profile = {
  safety: { recent: null, safety_rating: null },
  insurance: { status: null },
  first_registered_date: null,
} as unknown as CarrierProfile

describe('packetItems', () => {
  const flag = (level: BrokerFlag['level']): BrokerFlag => ({
    key: `flag-${level}`,
    level,
    title: 'Same phone as 5 other carriers',
    why: 'Some vetting tools flag this. More text.',
    fix: 'Explain it.',
  })

  it('keeps broker flags out of what hurts the score', () => {
    const lists = packetItems(profile, authority, network, [
      flag('alert'),
      flag('attention'),
      flag('info'),
    ])
    expect(lists.hurting).toEqual([])
    expect(lists.redFlags.map((i) => i.key)).toEqual(['flag-alert'])
    expect(lists.watch.map((i) => i.key)).toEqual(['flag-attention'])
    expect(JSON.stringify(lists)).not.toContain('flag-info')
  })

  it('says how many categories are over, and only calls one the furthest over', () => {
    const basic = (key: string, percentile: number, threshold: number) => ({
      basic: key,
      label: key,
      percentile,
      assessed: true,
      threshold,
      over_threshold: percentile >= threshold,
    })
    const iss = {
      basics: [basic('hos', 90, 65), basic('veh', 95, 80), basic('fit', 10, 80)],
    } as unknown as EstimatedIss
    const lists = packetItems(profile, authority, network, [], null, null, iss)
    expect(lists.hurting).toHaveLength(2)
    expect(lists.hurting[0].detail).toContain('Furthest over its threshold of the 2')
    expect(lists.hurting[1].detail).toContain('One of 2')
  })

  it('counts a fatal crash as hurting and doesn’t claim a clean crash record', () => {
    const crashes = { recent_fatal: 1, recent_total: 1, recent_months: 24 }
    const lists = packetItems(profile, authority, network, [], null, crashes as never)
    expect(lists.hurting.map((i) => i.key)).toEqual(['fatal-crash'])
    expect(lists.good.map((i) => i.key)).not.toContain('no-crashes')
  })

  it('lists out-of-service rates over the national average as roadside risk, not score', () => {
    const recent = {
      months: 24,
      vehicle_oos_rate: 0.5,
      national_vehicle_oos_rate: 0.22,
      vehicle_oos: 5,
      vehicle_inspections: 10,
      driver_oos_rate: 0.01,
      national_driver_oos_rate: 0.06,
      driver_oos: 0,
      driver_inspections: 10,
    }
    const withRecent = { ...profile, safety: { recent } } as unknown as CarrierProfile
    const lists = packetItems(withRecent, authority, network, [])
    expect(lists.hurting).toEqual([])
    expect(lists.roadside.map((i) => i.key)).toEqual(['vehicle-oos'])
    expect(lists.good.map((i) => i.key)).toContain('driver-oos')
  })
})

describe('carrierSummary', () => {
  const base = {
    registration_status: 'ACTIVE',
    authority: { status: 'ACTIVE' },
    safety: {
      recent: {
        months: 24,
        inspections: 12,
        vehicle_oos_rate: 0.25,
        national_vehicle_oos_rate: 0.22,
        driver_oos_rate: null,
        national_driver_oos_rate: 0.06,
      },
    },
  } as unknown as CarrierProfile

  it('leaves the inspections out of Try Now', () => {
    const text = carrierSummary(base, 'On file', true)
    expect(text).toBe(
      'FMCSA lists registration active, operating authority active, insurance on file.',
    )
  })

  it('gives only the rates FMCSA’s record has', () => {
    const text = carrierSummary(base, 'On file', false)
    expect(text).toContain('12 inspections in the last 24 months')
    expect(text).toContain('vehicle out-of-service')
    expect(text).not.toContain('driver out-of-service')
    expect(text).not.toMatch(/undefined|null|NaN/)
  })

  it('says so when nothing is listed', () => {
    const none = {
      registration_status: null,
      authority: { status: null },
      safety: { recent: null },
    } as unknown as CarrierProfile
    expect(carrierSummary(none, null, false)).toBe(
      'FMCSA lists registration status unknown, no operating authority listed, no insurance filing listed. No roadside inspections in the last 24 months.',
    )
  })
})
