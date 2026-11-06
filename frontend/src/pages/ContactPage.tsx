import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { sendContactMessage } from '../api/contact'
import { Field, FormError, SubmitButton } from '../features/auth/AuthCard'
import { useTurnstile } from '../features/auth/useTurnstile'
import { STS_CONTACT } from '../features/carrier-profile/packet/contact'
import { formatPhone } from '../utils/format'

const EMPTY = { full_name: '', email: '', phone: '', company: '', usdot: '', message: '' }

/** Contact Us: a form that emails the Sky Transport Solutions team. How else to reach them
 * (phone, email, offices, hours) is in the site footer, shown once on every page. */
export function ContactPage() {
  const [params] = useSearchParams()
  // "Fix it with Sky Transport Solutions" on a carrier's page says which carrier and what for.
  const [form, setForm] = useState(() => {
    const topic = params.get('topic')?.slice(0, 200)
    return {
      ...EMPTY,
      usdot: /^\d{1,8}$/.test(params.get('usdot') ?? '') ? (params.get('usdot') ?? '') : '',
      // "Schedule a demo" in the header: ?demo=1.
      message: topic
        ? `I’d like help fixing: ${topic}`
        : params.get('demo') === '1'
          ? 'I’d like to schedule a demo of Carrier Safety Scan. A good time to reach me is:'
          : '',
    }
  })
  const [localError, setLocalError] = useState<string | null>(null)
  const human = useTurnstile()
  const send = useMutation({
    mutationFn: () => sendContactMessage(form, human.headers),
    onError: human.reset,
  })

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    if (form.usdot.trim() && !/^\d{1,8}$/.test(form.usdot.trim())) {
      setLocalError('A USDOT number is digits only, up to 8 of them.')
      return
    }
    if (human.pending) {
      setLocalError(human.problem ?? 'The security check isn’t finished yet. Please wait a moment.')
      return
    }
    send.mutate()
  }

  const error =
    localError ??
    (send.error instanceof ApiError
      ? send.error.message
      : send.error
        ? `We couldn’t send your message. Please call us at ${formatPhone(STS_CONTACT.phone)}.`
        : null)

  return (
    // Compact, so the whole form and its Send button fit on a laptop's first screen.
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Contact us</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
          Questions about Carrier Safety Scan, your safety score or a DataQs challenge? The Sky
          Transport Solutions team can help.
        </p>
      </header>

      <div className="mx-auto mt-6 max-w-2xl">
        <section className="rounded-2xl border border-slate-200 bg-surface p-6">
          {send.isSuccess ? (
            <div role="status">
              <h2 className="text-lg font-semibold text-slate-900">Thank you, {form.full_name}</h2>
              <p className="mt-2 text-sm text-slate-600">
                Your message was sent. The Sky Transport Solutions team will reply to {form.email}.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Send us a message</h2>
              {/* Name and email on one row; phone, company and USDOT on the next. */}
              <div className="grid gap-3 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <Field
                    label="Your name"
                    autoComplete="name"
                    required
                    maxLength={200}
                    value={form.full_name}
                    onChange={set('full_name')}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Field
                    label="Email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={form.email}
                    onChange={set('email')}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="Phone (optional)"
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                    value={form.phone}
                    onChange={set('phone')}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="Company (optional)"
                    autoComplete="organization"
                    maxLength={200}
                    value={form.company}
                    onChange={set('company')}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="USDOT (optional)"
                    inputMode="numeric"
                    maxLength={8}
                    value={form.usdot}
                    onChange={set('usdot')}
                  />
                </div>
              </div>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">How can we help?</span>
                <textarea
                  required
                  rows={3}
                  maxLength={5000}
                  value={form.message}
                  onChange={set('message')}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-canvas/70 px-3.5 py-2.5 text-sm text-slate-900 transition-shadow placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
                />
              </label>
              <FormError message={error} />
              {/* The security check and Send side by side; stacked on phones. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:min-w-[300px] sm:flex-1">{human.widget}</div>
                <div className="sm:w-48">
                  <SubmitButton busy={send.isPending}>Send message</SubmitButton>
                </div>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
