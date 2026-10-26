/** Mirrors backend/app/schemas/compliance.py */

export type ComplianceServiceId =
  | 'DOT_MC_AUTHORITY'
  | 'UCR'
  | 'CA_MCP'
  | 'DRUG_ALCOHOL'
  | 'DRIVER_FILES'
  | 'MVR'
  | 'BACKGROUND_CHECK'
  | 'GOOD_STANDING'
  | 'CLEARINGHOUSE'

export interface UcrStatus {
  usdot_number: number
  current_year: number
  /** null: could not check (see error) */
  registered_current: boolean | null
  /** Next year's registration is open (from October 1) */
  next_year: number | null
  registered_next: boolean | null
  years: { year: number; fee_paid: boolean; updated: string | null }[]
  checked_at: string | null
  error: string | null
  source_url: string
}

export interface ComplianceRequest {
  id: number
  usdot_number: number
  service: ComplianceServiceId
  service_label: string
  note: string | null
  status: 'OPEN' | 'HANDLED'
  organization_name: string | null
  requested_by_name: string | null
  requested_by_email: string | null
  requested_by_phone: string | null
  created_at: string
  handled_by_name: string | null
  handled_at: string | null
  /** The email to STS failed (staff) */
  email_error: string | null
}
