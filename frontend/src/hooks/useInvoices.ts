import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchInvoice, fetchInvoices, payInvoice, voidInvoice } from '../api/invoices'
import type { InvoiceStatus } from '../types/invoice'

export function useInvoice(invoiceId: number, waitForPayment = false) {
  return useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: () => fetchInvoice(invoiceId),
    // Back from Stripe: the webhook marks it paid within seconds, so look again until it is.
    refetchInterval: (query) =>
      waitForPayment && query.state.data?.status === 'UNPAID' ? 3000 : false,
  })
}

export function useInvoices(status: InvoiceStatus | null, usdotNumber: number | null = null) {
  return useQuery({
    queryKey: ['invoices', 'all', status, usdotNumber],
    queryFn: () => fetchInvoices(status, usdotNumber),
  })
}

/** Opens Stripe Checkout in a tab opened on the click (browsers block tabs opened later). */
export function usePayInvoice() {
  return useMutation({ mutationFn: payInvoice })
}

export function useVoidInvoice() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: voidInvoice,
    onSuccess: () => client.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

/** Open `url` in a tab opened beforehand by the click (or this tab if it was blocked). */
export function openInTab(tab: Window | null, url: string) {
  if (tab) {
    tab.opener = null
    tab.location.href = url
  } else {
    window.location.href = url
  }
}
