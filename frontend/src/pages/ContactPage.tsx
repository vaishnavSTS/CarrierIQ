import { useMutation } from '@tanstack/react-query'
import { Clock, Globe, Mail, MapPin, Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { ApiError } from '../api/client'
import { sendContactMessage } from '../api/contact'
import { Field, FormError, SubmitButton } from '../features/auth/AuthCard'
import { useTurnstile } from '../features/auth/useTurnstile'
import { STS_CONTACT } from '../features/carrier-profile/packet/contact'
import stsLogo from '../features/carrier-profile/packet/sts-logo.png'
import { STS_ADDRESS, STS_HOURS } from '../features/landing/stsInfo'
import { formatPhone } from '../utils/format'

const EMPTY = { full_name: '', email: '', phone: '', company: '', usdot: '', message: '' }

/** Contact Us: how to reach Sky Transport Solutions, and a form that emails the team. */
export function ContactPage() {
  const [form, setForm] = useState(EMPTY)
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

  const reach = [
    {
      icon: Phone,
      label: formatPhone(STS_CONTACT.phone),
      href: `tel:+1${STS_CONTACT.phone}`,
    },
    { icon: Mail, label: STS_CONTACT.email, href: `mailto:${STS_CONTACT.email}` },
    { icon: Globe, label: STS_CONTACT.websiteLabel, href: STS_CONTACT.website },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:py-16">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
          Contact us
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 md:text-base">
          Questions about CarrierSafetyScan, your safety score or a DataQs challenge? The Sky
          Transport Solutions team can help.
        </p>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <aside className="rounded-2xl border border-slate-200 bg-surface p-6 sm:p-8">
          <img src={stsLogo} alt="Sky Transport Solutions" className="h-14 w-auto object-contain" />
          <h2 className="mt-5 font-semibold text-slate-900">{STS_CONTACT.company}</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            {reach.map(({ icon: Icon, label, href }) => (
              <li key={label}>
                <a
                  href={href}
                  className="flex items-center gap-2.5 break-all font-medium text-accent-strong hover:underline"
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </a>
              </li>
            ))}
            <li className="flex gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
              {STS_ADDRESS}
            </li>
            <li className="flex gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
              {STS_HOURS}
            </li>
          </ul>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-surface p-6 sm:p-8">
          {send.isSuccess ? (
            <div role="status">
              <h2 className="text-lg font-semibold text-slate-900">Thank you, {form.full_name}</h2>
              <p className="mt-2 text-sm text-slate-600">
                Your message was sent. The Sky Transport Solutions team will reply to {form.email}.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Send us a message</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Your name"
                  autoComplete="name"
                  required
                  maxLength={200}
                  value={form.full_name}
                  onChange={set('full_name')}
                />
                <Field
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={form.email}
                  onChange={set('email')}
                />
                <Field
                  label="Phone (optional)"
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  value={form.phone}
                  onChange={set('phone')}
                />
                <Field
                  label="Company (optional)"
                  autoComplete="organization"
                  maxLength={200}
                  value={form.company}
                  onChange={set('company')}
                />
              </div>
              <Field
                label="USDOT number (optional)"
                inputMode="numeric"
                maxLength={8}
                value={form.usdot}
                onChange={set('usdot')}
              />
              <label className="block">
                <span className="text-sm font-medium text-slate-700">How can we help?</span>
                <textarea
                  required
                  rows={5}
                  maxLength={5000}
                  value={form.message}
                  onChange={set('message')}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-canvas/70 px-3.5 py-2.5 text-sm text-slate-900 transition-shadow placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
                />
              </label>
              {human.widget}
              <FormError message={error} />
              <SubmitButton busy={send.isPending}>Send message</SubmitButton>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
