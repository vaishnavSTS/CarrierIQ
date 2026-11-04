import { useState } from 'react'

import { LegalDialog } from '../legal/LegalDialog'
import { PRIVACY_POLICY } from '../legal/legalText'
import { AUDIENCE_NAME, consent, setConsent, type Audience } from './audience'

/**
 * The cookie question at the foot of an audience page, until the visitor answers it once. Accept:
 * a cookie remembers that they're a carrier, broker or agent, so the site opens on their page next
 * time. Decline: it's remembered only until the tab closes. The answer is kept either way.
 */
export function CookieBar({ audience }: { audience: Audience }) {
  const [open, setOpen] = useState(() => consent() === null)
  const [reading, setReading] = useState(false)
  if (!open) return null

  const answer = (value: 'accepted' | 'declined') => {
    setConsent(value, audience)
    setOpen(false)
  }

  return (
    <div
      role="region"
      aria-label="Cookies"
      className="fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-slate-200 bg-surface p-4 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-xl print:hidden"
    >
      <p className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">
          Remember that you’re {audience === 'agent' ? 'an' : 'a'} {AUDIENCE_NAME[audience]}?
        </span>{' '}
        With your OK, a cookie keeps your choice so CarrierSafetyScan opens on this page next time.
        If you decline, we remember it only until you close this tab.{' '}
        <button
          type="button"
          onClick={() => setReading(true)}
          className="min-h-0 min-w-0 font-medium text-accent-strong underline underline-offset-2"
        >
          Privacy Policy
        </button>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => answer('accepted')}
          className="rounded-lg bg-cta px-4 py-2 text-sm font-semibold text-cta-ink hover:bg-cta-hover"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => answer('declined')}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Decline
        </button>
      </div>
      {reading && <LegalDialog document={PRIVACY_POLICY} onClose={() => setReading(false)} />}
    </div>
  )
}
