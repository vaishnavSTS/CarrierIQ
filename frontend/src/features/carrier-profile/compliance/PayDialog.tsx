import { useEffect, useState } from 'react'

import { useComplianceCheckout } from '../../../hooks/useCompliance'
import type { ComplianceServiceId, PriceOption, ServicePrice } from '../../../types/compliance'

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** The driver-files option for a number of drivers. */
function tierFor(options: PriceOption[], drivers: number): PriceOption | undefined {
  return options.find(
    (o) => drivers >= o.min_units && (o.max_units === null || drivers <= o.max_units),
  )
}

/**
 * Pay for a service: pick the option (or the number of drivers), see the price, then continue to
 * STS's payment page. CarrierSafetyScan creates the invoice on STS's website first.
 */
export function PayDialog({
  usdotNumber,
  service,
  title,
  price,
  preselect,
  onClose,
}: {
  usdotNumber: number
  service: ComplianceServiceId
  title: string
  price: ServicePrice
  preselect: string | null
  onClose: () => void
}) {
  const single = price.options.length === 1 ? price.options[0].key : null
  const [option, setOption] = useState<string | null>(single ?? preselect ?? price.suggested)
  const [drivers, setDrivers] = useState(price.drivers ? String(price.drivers) : '')
  const [note, setNote] = useState('')
  const checkout = useComplianceCheckout(usdotNumber)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const count = Number.parseInt(drivers, 10)
  const tier = price.per_driver && count > 0 ? tierFor(price.options, count) : undefined
  const chosen = price.per_driver ? tier : price.options.find((o) => o.key === option)
  const total = chosen ? Number(chosen.amount) * (price.per_driver ? count : 1) : null

  const pay = () => {
    if (!chosen) return
    // Open the tab now (a click), then point it at the payment page: browsers block later tabs.
    const tab = window.open('', '_blank')
    checkout.mutate(
      {
        service,
        option: chosen.key,
        drivers: price.per_driver ? count : null,
        note: note.trim() || null,
      },
      {
        onSuccess: ({ payment_url }) => {
          if (tab) {
            tab.opener = null
            tab.location.href = payment_url
          } else {
            window.location.href = payment_url
          }
          onClose()
        },
        onError: () => tab?.close(),
      },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl">
        <h2 id="pay-title" className="text-lg font-semibold text-slate-950">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          USDOT {usdotNumber}. You’ll pay on Sky Transport Solutions’ secure payment page, and STS
          starts on it once it’s paid.
        </p>

        {price.per_driver ? (
          <div className="mt-4">
            <label htmlFor="pay-drivers" className="block text-xs font-medium text-slate-600">
              Number of drivers
            </label>
            <input
              id="pay-drivers"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={drivers}
              onChange={(e) => setDrivers(e.target.value)}
              className="mt-1 w-32 rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm"
            />
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
              {price.options.map((o) => (
                <li
                  key={o.key}
                  className={tier?.key === o.key ? 'font-semibold text-slate-900' : ''}
                >
                  {o.label}: {money(Number(o.amount))} per driver
                </li>
              ))}
            </ul>
          </div>
        ) : (
          price.options.length > 1 && (
            <fieldset className="mt-4 space-y-2">
              <legend className="text-xs font-medium text-slate-600">Choose one</legend>
              {price.options.map((o) => (
                <label
                  key={o.key}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
                    option === o.key
                      ? 'border-accent bg-accent-soft'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="pay-option"
                      checked={option === o.key}
                      onChange={() => setOption(o.key)}
                    />
                    <span className="text-slate-900">{o.label}</span>
                    {price.suggested === o.key && (
                      <span className="text-xs text-slate-500">(from your FMCSA record)</span>
                    )}
                  </span>
                  <span className="font-medium text-slate-900">{money(Number(o.amount))}</span>
                </label>
              ))}
            </fieldset>
          )
        )}

        {price.too_big && <p className="mt-2 text-xs text-slate-600">{price.too_big}</p>}
        {price.note && <p className="mt-2 text-xs text-amber-800">{price.note}</p>}

        <label htmlFor="pay-note" className="mt-4 block text-xs font-medium text-slate-600">
          Anything we should know? (optional)
        </label>
        <textarea
          id="pay-note"
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm"
        />

        <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-3">
          <span className="text-sm text-slate-600">Total</span>
          <span className="text-lg font-semibold text-slate-950">
            {total !== null && !Number.isNaN(total) ? money(total) : '—'}
          </span>
        </div>
        {price.per_driver && count > 0 && !tier && (
          <p className="mt-1 text-sm text-red-700">Enter 1 to 500 drivers.</p>
        )}
        {checkout.isError && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {checkout.error.message}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={pay}
            disabled={!chosen || total === null || checkout.isPending}
            className="rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
          >
            {checkout.isPending ? 'Creating invoice…' : 'Continue to payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
