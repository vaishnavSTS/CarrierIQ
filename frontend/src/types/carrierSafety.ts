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

/** One CSA BASIC as FMCSA's SMS publishes it */
export interface Basic {
  key: string
  label: string
  inspections_with_violation: number
  measure: number | null
  /** 0-100; FMCSA publishes it for passenger carriers only */
  percentile: number | null
  /** Passenger files only: percentile over FMCSA's intervention threshold */
  over_threshold: boolean | null
  /** Passenger files only: FMCSA's overall BASIC alert */
  alert: boolean | null
  /** Acute/critical violation found in an FMCSA investigation in the last 12 months */
  acute_critical: boolean | null
  note: string | null
}

/** FMCSA SMS (CSA) results, 24-month measurement period */
export interface Sms {
  /** null: the carrier is in none of FMCSA's SMS files */
  dataset_id: string | null
  dataset: string | null
  passenger: boolean
  inspections: number
  driver_inspections: number
  vehicle_inspections: number
  basics: Basic[]
}

export interface Crash {
  report_number: string
  report_date: string
  state: string | null
  city: string | null
  fatalities: number
  injuries: number
  tow_away: boolean
  hazmat_released: boolean
}

/** Crashes in FMCSA's Crash File, grouped by crash report */
export interface CrashSummary {
  years: number
  total: number
  fatal: number
  injury: number
  recent_months: number
  recent_total: number
  recent_fatal: number
  recent_injury: number
  /** Newest first */
  crashes: Crash[]
}

/** One FMCSA violation group within a BASIC, e.g. Tires in Vehicle Maintenance */
export interface ViolationGroup {
  group: string
  violations: number
  out_of_service: number
  /** Sum of FMCSA's total severity weights */
  weight: number
  /** Of the BASIC's total weight, 0..1 */
  share: number
  examples: string[]
}

/** What makes up one BASIC measure, from FMCSA's SMS input violations */
export interface BasicDriver {
  basic: string
  violations: number
  out_of_service: number
  weight: number
  /** Last 6 months, where FMCSA's time weight is highest (x3) */
  recent_violations: number
  groups: ViolationGroup[]
}

export interface CarrierSafety {
  usdot_number: number
  inspection_count: number
  quarters: Quarter[]
  by_level: Count[]
  by_state: Count[]
  violations: ViolationSummary
  /** null: not fetched yet */
  sms: Sms | null
  crashes: CrashSummary | null
  /** null: not fetched yet; heaviest BASIC first */
  drivers: BasicDriver[] | null
  /** CarrierIQ's estimate of FMCSA's ISS; null: monthly tables or carrier SMS not loaded */
  estimated_iss?: EstimatedIss | null
}

/** docs/estimated-iss-v1.md — mirrors EstimatedIssOut */
export interface EstimatedIss {
  /** 1-100, lower is better; null: not enough data */
  value: number | null
  band: 'INSPECT' | 'OPTIONAL' | 'PASS' | null
  /** FMCSA ISS-CSA group 1-13; 0 = out-of-service order */
  group: number | null
  reason: string
  basics: EstimatedIssBasic[]
  /** FMCSA SMS month the lookup tables were built from (YYYY-MM-DD) */
  data_month: string
  version: string
  /** SAFETY (enough data) | INSUFFICIENT_DATA (FMCSA's little-history rules) | OUT_OF_SERVICE | NONE */
  algorithm?: 'SAFETY' | 'INSUFFICIENT_DATA' | 'OUT_OF_SERVICE' | 'NONE'
}

export interface EstimatedIssBasic {
  basic: string
  label: string
  /** estimated percentile; null when FMCSA would assign none, or hidden from clients */
  percentile: number | null
  /** FMCSA would assign a percentile (enough inspections with violations) */
  assessed: boolean
  threshold: number
  over_threshold: boolean
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
