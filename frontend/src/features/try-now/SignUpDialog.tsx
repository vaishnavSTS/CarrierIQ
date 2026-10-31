import { Lock, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

/** The pop-up a Try Now visitor sees for anything that needs an account. */
export function SignUpDialog({
  title,
  message,
  onClose,
}: {
  title: string
  message: string
  onClose: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-up-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl ring-1 ring-black/5 sm:p-8">
        <button
          ref={close}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="size-5" aria-hidden />
        </button>
        <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-strong">
          <Lock className="size-5" aria-hidden />
        </span>
        <h2 id="sign-up-title" className="mt-4 pr-8 text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 space-y-2.5">
          <Link
            to="/register"
            className="block rounded-xl bg-cta px-4 py-3 text-center text-sm font-medium text-cta-ink transition-colors hover:bg-cta-hover active:bg-cta-active"
          >
            Sign up as a carrier
          </Link>
          <Link
            to="/broker/register"
            className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
          >
            Sign up as a broker
          </Link>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-strong hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
