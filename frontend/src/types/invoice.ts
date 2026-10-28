/** Mirrors backend/app/schemas/invoice.py */

export type InvoiceStatus = 'UNPAID' | 'PAID' | 'VOID' | 'REFUNDED'

export interface InvoiceSummary {
  id: number
  number: number
  status: InvoiceStatus
  organization_name: string | null
  /** null: a brokerage's subscription invoice without a USDOT number */
  usdot_number: number | null
  billed_to: string
  /** e.g. "277.00" */
  total: string
  issued_at: string
  paid_at: string | null
  voided_at: string | null
  refunded_at: string | null
}

export interface InvoiceLine {
  position: number
  item: string
  description: string
  quantity: number
  rate: string
  amount: string
}

export interface Invoice extends InvoiceSummary {
  /** From: name, street, city_state_zip, phone, email */
  issuer: Record<string, string>
  /** To: name, street, city_state_zip, phone, emails */
  bill_to: {
    name?: string | null
    street?: string | null
    city_state_zip?: string | null
    phone?: string | null
    emails?: string[]
    usdot_number?: number
  }
  lines: InvoiceLine[]
  dispute_policy: string
  can_pay: boolean
  can_void: boolean
}
