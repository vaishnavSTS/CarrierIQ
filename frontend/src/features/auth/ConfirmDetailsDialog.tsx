import { ShieldCheck } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * Before a carrier account is created: the carrier checks its company name, USDOT number and name,
 * because a USDOT number can belong to one account only.
 */
export function ConfirmDetailsDialog({
  details,
  onConfirm,
  onCancel,
}: {
  details: { label: string; value: string }[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirm = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirm.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // On the page itself: inside the sign-up card a fixed overlay is boxed in by the card's styling.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-details-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl ring-1 ring-black/5 sm:p-8">
        <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-strong">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <h2 id="confirm-details-title" className="mt-4 text-xl font-semibold tracking-tight">
          Are these details correct?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Please cross-check them. A USDOT number can be claimed by one account only, so it can’t be
          used for another account once you confirm.
        </p>
        <dl className="mt-5 divide-y divide-slate-200 rounded-xl border border-slate-200">
          {details.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-semibold text-slate-900 break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 space-y-2.5">
          <button
            ref={confirm}
            type="button"
            onClick={onConfirm}
            className="block w-full rounded-xl bg-cta px-4 py-3 text-center text-sm font-medium text-cta-ink transition-colors hover:bg-cta-hover"
          >
            Confirm and create my account
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
          >
            Go back and edit
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
