import type { Invoice, InvoiceStatus, InvoiceSummary } from '../types/invoice'
import { apiGet, apiRequest } from './client'

export function fetchInvoice(invoiceId: number): Promise<Invoice> {
  return apiGet(`/invoices/${invoiceId}`)
}

/** STS staff: every invoice, newest first (status: one, or all). */
export function fetchInvoices(
  status: InvoiceStatus | null,
): Promise<{ invoices: InvoiceSummary[] }> {
  return apiGet(`/invoices${status ? `?status=${status}` : ''}`)
}

/** Clients: a Stripe Checkout page for an unpaid invoice. */
export function payInvoice(invoiceId: number): Promise<{ url: string }> {
  return apiRequest(`/invoices/${invoiceId}/pay`, { method: 'POST' })
}

/** STS staff: cancel an unpaid invoice. */
export function voidInvoice(invoiceId: number): Promise<Invoice> {
  return apiRequest(`/invoices/${invoiceId}/void`, { method: 'POST' })
}
