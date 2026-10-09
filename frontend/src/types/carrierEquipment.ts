/** Mirrors backend/app/schemas/carrier_equipment.py */

export interface VinCarrier {
  usdot_number: number
  /** Only when that carrier is loaded in CarrierIQ */
  legal_name: string | null
  inspections: number
  first_seen: string
  last_seen: string
  /** HIGH (2+ inspections) | MEDIUM (1) */
  confidence: string
}

export interface EquipmentVehicle {
  vin: string
  inspections: number
  first_seen: string
  last_seen: string
  decoded: boolean
  make: string | null
  model: string | null
  year: number | null
  body_class: string | null
  /** vPIC, e.g. TRUCK, TRAILER, BUS */
  vehicle_type: string | null
  gvwr: string | null
  check_digit_valid: boolean | null
  other_carriers: VinCarrier[]
}

export interface Fleet {
  registered_power_units: number | null
  observed_vehicles: number
  observed_power_units: number
  observed_trailers: number
  observed_unknown_type: number
  recent_power_units: number
  recent_months: number
  first_observed: string | null
  last_observed: string | null
}

export interface CarrierEquipment {
  usdot_number: number
  fleet: Fleet
  shared_vin_count: number
  other_carrier_count: number
  invalid_check_digit_count: number
  /** Most recently seen first */
  vehicles: EquipmentVehicle[]
}
