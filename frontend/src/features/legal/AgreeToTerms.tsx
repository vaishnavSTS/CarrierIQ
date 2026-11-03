import { useId, useState } from 'react'

import { LegalDialog } from './LegalDialog'
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDocument } from './legalText'

export const MUST_AGREE =
  'Please agree to the Terms of Service and Privacy Policy to create your account.'

/**
 * Every sign-up form: the "I agree" box, with the Terms of Service and the Privacy Policy a click
 * away in a pop-up. The API refuses a sign-up without it and records when it was ticked.
 */
export function AgreeToTerms({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  const [reading, setReading] = useState<LegalDocument | null>(null)
  const link =
    'min-h-0 min-w-0 font-medium text-accent-strong underline underline-offset-2 hover:text-accent'

  return (
    <div className="flex items-start gap-3 text-sm text-slate-700">
      <label className="shrink-0 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          required
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 cursor-pointer accent-[var(--color-accent-strong)]"
        />
      </label>
      <p>
        <label htmlFor={id} className="cursor-pointer">
          I have read and agree to the
        </label>{' '}
        <button type="button" className={link} onClick={() => setReading(TERMS_OF_SERVICE)}>
          Terms of Service
        </button>{' '}
        and{' '}
        <button type="button" className={link} onClick={() => setReading(PRIVACY_POLICY)}>
          Privacy Policy
        </button>
        .
      </p>
      {reading && <LegalDialog document={reading} onClose={() => setReading(null)} />}
    </div>
  )
}
