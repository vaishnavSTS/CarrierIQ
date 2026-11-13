import { describe, expect, it } from 'vitest'

import type { Operation } from '../types/carrierProfile'
import { driverSplit, hazmatLabel, operatingArea, operationSummary, rangeSplit } from './operation'

const op = (over: Partial<Operation>): Operation => ({
  operation: null,
  hazmat: null,
  interstate_drivers: null,
  intrastate_drivers: null,
  cdl_drivers: null,
  interstate_beyond_100_miles: null,
  interstate_within_100_miles: null,
  intrastate_beyond_100_miles: null,
  intrastate_within_100_miles: null,
  cargo: [],
  ...over,
})

describe('operation labels', () => {
  it('reads the census operation codes', () => {
    expect(operatingArea(op({ operation: 'INTERSTATE' }))).toBe('Interstate')
    expect(operatingArea(op({ operation: 'INTRASTATE_HAZMAT' }))).toBe('Intrastate only')
    expect(operatingArea(op({ operation: 'INTRASTATE_NON_HAZMAT' }))).toBe('Intrastate only')
    expect(operatingArea(op({}))).toBeNull()
    expect(operatingArea(null)).toBeNull()
  })

  it('says hazmat only when the census says so', () => {
    expect(hazmatLabel(op({ hazmat: true }))).toBe('Hazmat')
    expect(hazmatLabel(op({ hazmat: false }))).toBe('No hazmat')
    expect(hazmatLabel(op({}))).toBeNull()
  })

  it('summarises what is known', () => {
    expect(operationSummary(op({ operation: 'INTERSTATE', hazmat: true }))).toBe(
      'Interstate · Hazmat',
    )
    expect(operationSummary(op({ hazmat: false }))).toBe('No hazmat')
    expect(operationSummary(op({}))).toBeNull()
  })

  it('splits drivers', () => {
    expect(driverSplit(op({ interstate_drivers: 2, intrastate_drivers: 0, cdl_drivers: 1 }))).toBe(
      '2 interstate · 0 intrastate · 1 driver with a CDL',
    )
    expect(driverSplit(op({}))).toBeNull()
    expect(rangeSplit(2, 0)).toBe('2 beyond 100 miles')
    expect(rangeSplit(0, null)).toBeNull()
  })
})
