import type { Invoice, InvoiceStatus, InvoiceSummary } from '../types/invoice'
import { apiGet, apiRequest } from './client'

export function fetchInvoice(invoiceId: number): Promise<Invoice> {
  return apiGet(`/invoices/${invoiceId}`)
}

/** Newest first. STS: every invoice, or one carrier's; clients: their own for one carrier. */
export function fetchInvoices(
  status: InvoiceStatus | null,
  usdotNumber: number | null = null,
): Promise<{ invoices: InvoiceSummary[] }> {
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  if (usdotNumber) query.set('usdot_number', String(usdotNumber))
  const qs = query.toString()
  return apiGet(`/invoices${qs ? `?${qs}` : ''}`)
}

/** Clients: a Stripe Checkout page for an unpaid invoice. */
export function payInvoice(invoiceId: number): Promise<{ url: string }> {
  return apiRequest(`/invoices/${invoiceId}/pay`, { method: 'POST' })
}

/** STS staff: cancel an unpaid invoice. */
export function voidInvoice(invoiceId: number): Promise<Invoice> {
  return apiRequest(`/invoices/${invoiceId}/void`, { method: 'POST' })
}
