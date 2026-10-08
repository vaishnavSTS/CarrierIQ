/** Mirrors backend/app/schemas/carrier_profile.py */

import type { Docket } from './carrier'

export interface Address {
  address_type: string
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  undeliverable: boolean
  first_seen: string
  last_seen: string
}

export interface Phone {
  phone_type: string
  number: string
  first_seen: string
}

export interface Inspection {
  inspection_id: string
  inspection_date: string
  level: number | null
  state: string | null
  location: string | null
  vin: string | null
  vehicle_oos: boolean
  driver_oos: boolean
  violations: number
}

export interface InspectionYear {
  year: number
  inspections: number
  vehicle_oos: number
  driver_oos: number
}

export interface Safety {
  inspection_count: number
  vehicle_oos_count: number
  driver_oos_count: number
  vehicle_oos_rate: number | null
  driver_oos_rate: number | null
  first_inspection_date: string | null
  last_inspection_date: string | null
  by_year: InspectionYear[]
  recent_inspections: Inspection[]
  crash_count: number | null
  safety_rating: string | null
  safety_rating_date: string | null
}

export interface Vehicle {
  vin: string
  inspections: number
  first_seen: string
  last_seen: string
}

export interface Equipment {
  power_units: number | null
  observed_vehicle_count: number
  vehicles: Vehicle[]
}

export interface Change {
  attribute: string
  old_value: string | null
  new_value: string | null
  changed_on: string
}

export interface TimelineEvent {
  event_type: string
  event_date: string
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH'
  title: string
  description: string | null
}

export interface CarrierProfile {
  usdot_number: number
  legal_name: string
  dba_name: string | null
  entity_type: string | null
  registration_status: string | null
  /** census CLASSDEF, ';'-separated, e.g. 'PRIVATE PROPERTY;AUTHORIZED FOR HIRE' */
  operation_classification: string | null
  email: string | null
  website: string | null
  driver_count: number | null
  first_registered_date: string | null
  last_mcs150_date: string | null
  last_refreshed_at: string | null
  stale: boolean
  addresses: Address[]
  phones: Phone[]
  officers: string[]
  domains: string[]
  authority: { status: string | null; dockets: Docket[] }
  /** ON_FILE | NOT_ON_FILE | null (no active operating authority) */
  insurance: { status: string | null; source_system: string | null; as_of: string | null }
  timeline: TimelineEvent[]
  safety: Safety
  equipment: Equipment
  recent_changes: Change[]
  review_status: string | null
}
