import { Radar } from 'lucide-react'

import type { Invoice } from '../../types/invoice'

/** "10-27-2026", as on STS's invoices. */
function day(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}`
}

const money = (value: string) =>
  Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STAMP: Partial<Record<Invoice['status'], { label: string; color: string }>> = {
  PAID: { label: 'PAID', color: '#c8102e' },
  VOID: { label: 'VOID', color: '#6b7280' },
  REFUNDED: { label: 'REFUNDED', color: '#6b7280' },
}

/**
 * The invoice as a page: the same layout as STS's invoices, with the CarrierSafetyScan logo
 * ("Powered by Sky Transport Solutions"). Always black on white, also in dark mode and in print
 * (the browser's "Save as PDF" makes the PDF).
 */
export function InvoiceDocument({ invoice: inv }: { invoice: Invoice }) {
  const stamp = STAMP[inv.status]
  const to = inv.bill_to
  return (
    <article
      id="invoice-print"
      className="relative mx-auto w-full max-w-[816px] bg-white px-6 py-8 text-[13px] leading-relaxed text-[#1f2328] shadow-sm ring-1 ring-black/5 sm:px-12 sm:py-10 print:max-w-none print:px-0 print:py-0 print:shadow-none print:ring-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Radar className="size-6" aria-hidden />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-semibold tracking-tight text-[#14121f]">
              CarrierSafetyScan
            </span>
            <span className="text-[12px] font-medium text-[#6b6880]">
              Powered by{' '}
              <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text font-bold text-transparent">
                Sky Transport Solutions
              </span>
            </span>
          </span>
        </div>
        <h1 className="text-2xl font-bold text-[#1f2328]">Invoice #{inv.number}</h1>
      </header>

      <section className="mt-8 flex flex-wrap justify-between gap-6">
        <div>
          <div className="text-[#4b5563]">From</div>
          <div className="font-semibold">{inv.issuer.name}</div>
          <div>{inv.issuer.street}</div>
          <div>{inv.issuer.city_state_zip}</div>
          <div>Phone: {inv.issuer.phone}</div>
          <div>Email: {inv.issuer.email}</div>
        </div>
        <dl className="space-y-3 text-right">
          <div>
            <dt className="inline font-semibold">Date: </dt>
            <dd className="inline">{day(inv.issued_at)}</dd>
          </div>
          {inv.paid_at && (
            <div>
              <dt className="inline font-semibold">Paid on: </dt>
              <dd className="inline">{day(inv.paid_at)}</dd>
            </div>
          )}
          {inv.voided_at && (
            <div>
              <dt className="inline font-semibold">Voided on: </dt>
              <dd className="inline">{day(inv.voided_at)}</dd>
            </div>
          )}
          {inv.usdot_number !== null && (
            <div>
              <dt className="inline font-semibold">USDOT: </dt>
              <dd className="inline">{inv.usdot_number}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="mt-8">
        <div className="text-[#4b5563]">To</div>
        <div className="font-semibold uppercase">{to.name}</div>
        {to.street && <div>{to.street}</div>}
        {to.city_state_zip && <div>{to.city_state_zip}</div>}
        {to.phone && <div>Phone: {to.phone}</div>}
        {to.emails && to.emails.length > 0 && <div>Email: {to.emails.join(', ')}</div>}
      </section>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-y border-[#e5e7eb] font-semibold">
              <th className="px-2 py-2.5">#</th>
              <th className="px-2 py-2.5">Item</th>
              <th className="px-2 py-2.5">Description</th>
              <th className="px-2 py-2.5">Qnt</th>
              <th className="px-2 py-2.5">Rate</th>
              <th className="px-2 py-2.5">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((line) => (
              <tr key={line.position} className="border-b border-white odd:bg-[#f3f4f6]">
                <td className="px-2 py-2.5">{line.position}</td>
                <td className="px-2 py-2.5 uppercase">{line.item}</td>
                <td className="px-2 py-2.5">{line.description}</td>
                <td className="px-2 py-2.5">{line.quantity}</td>
                <td className="px-2 py-2.5">{money(line.rate)}</td>
                <td className="px-2 py-2.5">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end gap-8 border-t border-[#e5e7eb] pt-3 pr-2">
        <span className="font-semibold">Total:</span>
        <span>${money(inv.total)}</span>
      </div>

      {stamp && (
        <div
          aria-label={`Status: ${stamp.label}`}
          className="pointer-events-none mt-6 ml-16 inline-block -rotate-12 rounded-md border-[5px] px-5 py-1 text-4xl font-black tracking-widest opacity-90"
          style={{ borderColor: stamp.color, color: stamp.color }}
        >
          {stamp.label}
        </div>
      )}

      <footer className="mt-12 border-t border-[#e5e7eb] pt-3 text-[11px] text-[#4b5563]">
        <span className="font-semibold text-[#1f2328]">Payment dispute policy:</span>{' '}
        {inv.dispute_policy}
      </footer>
    </article>
  )
}
