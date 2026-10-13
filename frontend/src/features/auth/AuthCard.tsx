import type { InputHTMLAttributes, ReactNode } from 'react'

/** Centered card that frames the login and sign-up forms. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 md:py-20">
      <section className="rounded-2xl border border-slate-200 bg-surface/90 p-6 shadow-xl backdrop-blur md:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </section>
      <p className="mt-4 text-center text-sm text-slate-500">{footer}</p>
    </div>
  )
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        {...input}
        className="mt-1 w-full rounded-md border border-slate-300 bg-canvas px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </p>
  )
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
    >
      {busy ? 'Please wait…' : children}
    </button>
  )
}
