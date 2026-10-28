import type { InvoiceStatus } from '../../types/invoice'
import type { Tone } from '../../utils/status'

/** How each invoice status is shown (a StatusBadge). */
export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  UNPAID: { label: 'Unpaid', tone: 'warn' },
  PAID: { label: 'Paid', tone: 'ok' },
  VOID: { label: 'Void', tone: 'neutral' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
}
