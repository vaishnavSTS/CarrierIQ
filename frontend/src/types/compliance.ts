/** Mirrors backend/app/schemas/compliance.py */

import type { InvoiceStatus } from './invoice'

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
  /** Paid online: what was chosen and its CarrierSafetyScan invoice */
  option_label: string | null
  quantity: number | null
  /** e.g. "277.00" */
  amount: string | null
  invoice_id: number | null
  invoice_number: number | null
  invoice_status: InvoiceStatus | null
  /** Requests from before 2026-10-27: the STS website's invoice */
  sts_invoice_no: number | null
  sts_payment_url: string | null
}

export interface PriceOption {
  key: string
  label: string
  /** e.g. "277"; per driver for driver files */
  amount: string
  min_units: number
  max_units: number | null
}

/** A service paid online, as offered for one carrier. */
export interface ServicePrice {
  service: ComplianceServiceId
  options: PriceOption[]
  per_driver: boolean
  note: string | null
  /** Above the last option: contact STS */
  too_big: string | null
  /** The option that fits the carrier's FMCSA fleet or driver count */
  suggested: string | null
  /** FMCSA's driver count (driver files) */
  drivers: number | null
}

export interface ComplianceCheckoutInput {
  service: ComplianceServiceId
  option: string
  drivers: number | null
  note: string | null
}
