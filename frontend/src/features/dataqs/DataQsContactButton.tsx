import { Phone, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import { useDataQsContacts, useSaveDataQsContact } from '../../hooks/useDataQs'
import type { DataQsCarrierContact } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'
import { inputClass, labelClass } from './intake/intakeState'
import { primaryButton, secondaryButton } from './ui'

/**
 * Client portal: how STS reaches the company's carriers about DataQs requests (the email on the
 * carrier's FMCSA account and a phone number), in a pop-up. The account owner
 * edits it; other users see it.
 */
export function DataQsContactButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${secondaryButton} inline-flex items-center gap-1.5`}
      >
        <Phone className="size-4" aria-hidden />
        FMCSA contact
      </button>
      {open && <ContactDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function ContactDialog({ onClose }: { onClose: () => void }) {
  const { data, isPending, error } = useDataQsContacts()
  const [chosen, setChosen] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const carriers = data?.carriers ?? []
  const current = carriers.find((c) => c.usdot_number === chosen) ?? carriers[0]

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="contact-title" className="text-lg font-semibold text-slate-950">
              FMCSA contact
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              How STS reaches you about your DataQs requests.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-5">
          {isPending ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-700">Could not load: {error.message}</p>
          ) : !current ? (
            <p className="text-sm text-slate-700">
              STS hasn’t verified a carrier for your company yet. Once it has, you can add the
              contact details here.
            </p>
          ) : (
            <>
              {carriers.length > 1 && (
                <div className="mb-4">
                  <label htmlFor="contact-carrier" className={labelClass}>
                    Carrier
                  </label>
                  <select
                    id="contact-carrier"
                    value={current.usdot_number}
                    onChange={(e) => setChosen(Number(e.target.value))}
                    className={inputClass}
                  >
                    {carriers.map((c) => (
                      <option key={c.usdot_number} value={c.usdot_number}>
                        {c.carrier_name ?? 'Carrier'} · USDOT {c.usdot_number}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {data.can_edit ? (
                <ContactForm key={current.usdot_number} contact={current} onDone={onClose} />
              ) : (
                <ContactView contact={current} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ContactForm({
  contact: c,
  onDone,
}: {
  contact: DataQsCarrierContact
  onDone: () => void
}) {
  const [email, setEmail] = useState(c.email ?? '')
  const [phone, setPhone] = useState(c.phone ?? '')
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const save = useSaveDataQsContact()
  const ready = /^\S+@\S+\.\S+$/.test(email.trim()) && phone.replace(/\D/g, '').length >= 7

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate(
      {
        usdot: c.usdot_number,
        input: {
          email: email.trim(),
          phone: phone.trim(),
          ...(password ? { password } : {}),
          ...(clearPassword ? { clear_password: true } : {}),
        },
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      {carrierLine(c)}
      <div>
        <label htmlFor="contact-email" className={labelClass}>
          Email on your FMCSA account
        </label>
        <input
          id="contact-email"
          type="email"
          autoComplete="email"
          value={email}
          maxLength={254}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="contact-phone" className={labelClass}>
          Phone number STS can call
        </label>
        <input
          id="contact-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          maxLength={30}
          placeholder="e.g. (555) 010-2030"
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="contact-password" className={labelClass}>
          FMCSA account password
        </label>
        <input
          id="contact-password"
          type="password"
          autoComplete="new-password"
          value={password}
          maxLength={200}
          onChange={(e) => {
            setPassword(e.target.value)
            if (e.target.value) setClearPassword(false)
          }}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-600">
          Encrypted before storage. Leave blank to keep the saved password.
        </p>
      </div>
      {c.password_saved && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={clearPassword}
            onChange={(e) => {
              setClearPassword(e.target.checked)
              if (e.target.checked) setPassword('')
            }}
          />
          Remove the saved password
        </label>
      )}
      {save.isError && (
        <p className="text-red-700" role="alert">
          Could not save: {save.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={secondaryButton}>
          Cancel
        </button>
        <button type="submit" disabled={!ready || save.isPending} className={primaryButton}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

/** Users other than the account owner: what STS has on file. */
function ContactView({ contact: c }: { contact: DataQsCarrierContact }) {
  return (
    <div className="space-y-3 text-sm">
      {carrierLine(c)}
      {c.email ? (
        <dl className="space-y-2">
          <div>
            <dt className={labelClass}>Email on the FMCSA account</dt>
            <dd className="text-slate-900">{c.email}</dd>
          </div>
          <div>
            <dt className={labelClass}>Phone number</dt>
            <dd className="text-slate-900">{c.phone}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-slate-700">No contact details yet.</p>
      )}
      <p className="text-xs text-slate-600">Only your company’s account owner can change these.</p>
    </div>
  )
}

function carrierLine(c: DataQsCarrierContact) {
  return (
    <p className="text-slate-700">
      <span className="font-medium text-slate-900">{c.carrier_name ?? 'Carrier'}</span> · USDOT{' '}
      {c.usdot_number}
      {c.updated_at && (
        <span className="block text-xs text-slate-600">
          Last updated {formatDateTime(c.updated_at)}
          {c.updated_by_name && ` by ${c.updated_by_name}`}
        </span>
      )}
    </p>
  )
}
