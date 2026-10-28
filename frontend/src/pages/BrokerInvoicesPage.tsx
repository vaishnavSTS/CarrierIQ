import { CarrierInvoicesSection } from '../features/invoices/CarrierInvoicesSection'

/** Broker portal: the brokerage's own invoices (the monthly subscription), newest first. */
export function BrokerInvoicesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your CarrierSafetyScan subscription invoices. Each one is also emailed to you with its PDF
          when Stripe charges the month.
        </p>
      </div>
      <CarrierInvoicesSection
        usdotNumber={null}
        empty="No invoices yet. One is created each month your subscription is charged."
      />
    </div>
  )
}
