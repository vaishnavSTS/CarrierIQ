import { useState, type FormEvent } from 'react'

import { useMe } from '../../hooks/useAuth'
import { useApproveDataQsPackage, useRequestDataQsPackageChanges } from '../../hooks/useDataQs'
import type { DataQsCase, DataQsPackage } from '../../types/dataqs'
import { inputClass, labelClass } from './intake/intakeState'
import { primaryButton, secondaryButton } from './ui'

/** Carrier: approve this exact package, or ask STS for changes. */
export function DataQsPackageReview({
  dataqsCase,
  pkg,
}: {
  dataqsCase: DataQsCase
  pkg: DataQsPackage
}) {
  const { data: me } = useMe()
  const [name, setName] = useState(me?.full_name ?? '')
  const [title, setTitle] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [changes, setChanges] = useState('')
  const [asking, setAsking] = useState(false)
  const approve = useApproveDataQsPackage(dataqsCase.id)
  const requestChanges = useRequestDataQsPackageChanges(dataqsCase.id)

  const submitApproval = (event: FormEvent) => {
    event.preventDefault()
    approve.mutate({
      expected_version: dataqsCase.row_version,
      package_id: pkg.id,
      package_hash: pkg.manifest_hash,
      signer_name: name.trim(),
      signer_title: title.trim() || null,
      terms_version: dataqsCase.package_terms.terms_version,
      accept: true,
    })
  }

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4 text-sm">
      <form onSubmit={submitApproval} className="space-y-3">
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
          {dataqsCase.package_terms.text}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="approver-name" className={labelClass}>
              Your full name
            </label>
            <input
              id="approver-name"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="approver-title" className={labelClass}>
              Your title (optional)
            </label>
            <input
              id="approver-title"
              value={title}
              maxLength={100}
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
          <span>
            I have reviewed package v{pkg.package_version} and approve filing exactly this package.
          </span>
        </label>
        {approve.isError && (
          <p className="text-red-700" role="alert">
            Could not approve: {approve.error.message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={primaryButton}
            disabled={!accepted || name.trim().length < 2 || approve.isPending}
          >
            {approve.isPending ? 'Approving…' : 'Approve this package'}
          </button>
          <button type="button" className={secondaryButton} onClick={() => setAsking((a) => !a)}>
            Ask for changes
          </button>
        </div>
      </form>

      {asking && (
        <div className="space-y-2">
          <label htmlFor="changes" className={labelClass}>
            What should STS change?
          </label>
          <textarea
            id="changes"
            rows={3}
            value={changes}
            maxLength={5000}
            onChange={(e) => setChanges(e.target.value)}
            className={inputClass}
          />
          {requestChanges.isError && (
            <p className="text-red-700" role="alert">
              Could not send: {requestChanges.error.message}
            </p>
          )}
          <button
            type="button"
            className={secondaryButton}
            disabled={changes.trim().length < 5 || requestChanges.isPending}
            onClick={() =>
              requestChanges.mutate({ version: dataqsCase.row_version, message: changes.trim() })
            }
          >
            Send to STS
          </button>
        </div>
      )}
    </div>
  )
}
