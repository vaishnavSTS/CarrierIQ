/** Mirrors backend/app/schemas/carrier_signals.py */

export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH'

export interface Evidence {
  /** RECORD | COMPARISON | THRESHOLD */
  evidence_type: string
  entity_type: string | null
  entity_id: number | null
  /** The stored source row behind it */
  raw_record_id: number | null
  field_name: string | null
  observed_value: string | null
  observed_at: string | null
  source: string | null
}

export interface Signal {
  id: number
  signal_type: string
  rule_id: string
  rule_version: string
  severity: Severity
  /** HIGH | MEDIUM | LOW */
  confidence: string
  /** OPEN | REVIEWED | DISMISSED */
  status: string
  title: string
  description: string | null
  first_detected_at: string | null
  last_detected_at: string | null
  evidence: Evidence[]
}

export interface CarrierSignals {
  usdot_number: number
  /** Highest severity first */
  signals: Signal[]
}
