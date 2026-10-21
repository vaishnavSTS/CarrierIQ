import { useState, type FormEvent } from 'react'

import { useMe } from '../../hooks/useAuth'
import { useSubmitDataQsCase } from '../../hooks/useDataQs'
import type { DataQsCase } from '../../types/dataqs'
import { inputClass, labelClass } from './intake/intakeState'

/** Wizard steps 6 and 7: sign the authorization for STS and submit the case for STS review. */
export function DataQsSubmitPanel({ dataqsCase }: { dataqsCase: DataQsCase }) {
  const { data: me } = useMe()
  const [name, setName] = useState(me?.full_name ?? '')
  const [title, setTitle] = useState('')
  const [accepted, setAccepted] = useState(false)
  const submit = useSubmitDataQsCase(dataqsCase.id)
  const missingEvidence = dataqsCase.issues.some((issue) => issue.evidence_count === 0)

  const send = (event: FormEvent) => {
    event.preventDefault()
    submit.mutate({
      expected_version: dataqsCase.row_version,
      signer_name: name.trim(),
      signer_title: title.trim() || null,
      terms_version: dataqsCase.consent.terms_version,
      accept: true,
    })
  }

  return (
    <form onSubmit={send} className="space-y-3 text-sm">
      <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
        {dataqsCase.consent.text}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="signer-name" className={labelClass}>
            Your full name
          </label>
          <input
            id="signer-name"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="signer-title" className={labelClass}>
            Your title (optional)
          </label>
          <input
            id="signer-title"
            value={title}
            maxLength={100}
            placeholder="e.g. Owner, Safety manager"
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>I have read the authorization above and agree to it.</span>
      </label>
      {missingEvidence && (
        <p className="text-amber-800">
          Some issues have no evidence yet. You can still submit; STS will tell you what’s needed.
        </p>
      )}
      {submit.isError && (
        <p className="text-red-700" role="alert">
          Could not submit: {submit.error.message}
        </p>
      )}
      <button
        type="submit"
        disabled={!accepted || name.trim().length < 2 || submit.isPending}
        className="rounded-md bg-cta px-3 py-1.5 font-medium text-cta-ink hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submit.isPending ? 'Submitting…' : 'Authorize and submit to STS'}
      </button>
      <p className="text-xs text-slate-500">
        Authorization text version {dataqsCase.consent.terms_version}.
      </p>
    </form>
  )
}
