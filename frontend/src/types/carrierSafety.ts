/** Mirrors backend/app/schemas/carrier_safety.py */

export interface Quarter {
  quarter: string // "2025-Q3"
  start_date: string
  inspections: number
  /** Inspections that examined the vehicle / driver: the base of each OOS rate */
  vehicle_inspections: number
  driver_inspections: number
  vehicle_oos: number
  driver_oos: number
  vehicle_oos_rate: number | null
  driver_oos_rate: number | null
  violations: number
}

export interface Count {
  key: string
  inspections: number
}

export interface ViolationPart {
  part: number | null
  title: string | null
  violations: number
  out_of_service: number
}

export interface ViolationCode {
  code: string | null
  description: string | null
  part: number | null
  violations: number
  out_of_service: number
  last_seen: string
}

export interface ViolationSummary {
  total: number
  header_total: number
  driver: number
  vehicle: number
  out_of_service: number
  by_part: ViolationPart[]
  top_codes: ViolationCode[]
}

export interface CarrierSafety {
  usdot_number: number
  inspection_count: number
  quarters: Quarter[]
  by_level: Count[]
  by_state: Count[]
  violations: ViolationSummary
}

export interface Violation {
  code: string | null
  description: string | null
  part: number | null
  part_title: string | null
  applies_to: 'DRIVER' | 'VEHICLE' | null
  unit_number: number | null
  out_of_service: boolean
  citation_number: string | null
}

export interface InspectionDetail {
  inspection_id: string
  inspection_date: string
  level: number | null
  state: string | null
  location: string | null
  vin: string | null
  vehicle_oos: boolean
  driver_oos: boolean
  violation_count: number
  violations: Violation[]
}

export interface InspectionPage {
  usdot_number: number
  page: number
  page_size: number
  total: number
  inspections: InspectionDetail[]
}
