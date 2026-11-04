import { Receipt } from 'lucide-react'

import { CarrierInvoicesSection } from '../features/invoices/CarrierInvoicesSection'

/** Broker portal: the brokerage's own invoices (the monthly subscription), newest first. */
export function BrokerInvoicesPage() {
  return (
    <div className="space-y-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#101853] text-white shadow-sm">
          <Receipt className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-label text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-strong">
            Billing
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">Invoices</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Your Carrier Safety Scan subscription invoices. Each one is also emailed to you with its
            PDF when Stripe charges the month.
          </p>
        </div>
      </div>
      <CarrierInvoicesSection
        usdotNumber={null}
        empty="No invoices yet. One is created each month your subscription is charged."
      />
    </div>
  )
}
