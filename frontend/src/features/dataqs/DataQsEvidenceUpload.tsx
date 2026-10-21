import { useRef, useState, type FormEvent } from 'react'

import { useUploadDataQsEvidence } from '../../hooks/useDataQs'
import { inputClass, labelClass } from './intake/intakeState'

const ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.csv,.mp4,application/pdf,image/jpeg,image/png,text/csv,video/mp4'
const MAX_MB = 25

/** Upload one file for an issue, with a short note on how it supports it. The server decides the
 * file's type from its content and refuses anything that isn't PDF, JPEG, PNG, CSV or MP4. */
export function DataQsEvidenceUpload({ caseId, issueId }: { caseId: number; issueId: number }) {
  const [file, setFile] = useState<File | null>(null)
  const [relevance, setRelevance] = useState('')
  const [documentDate, setDocumentDate] = useState('')
  const [tooBig, setTooBig] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const upload = useUploadDataQsEvidence(caseId)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!file) return
    upload.mutate(
      {
        file,
        links: [{ issue_id: issueId, relevance: relevance.trim() }],
        documentDate: documentDate || null,
      },
      {
        onSuccess: () => {
          setFile(null)
          setRelevance('')
          setDocumentDate('')
          if (fileInput.current) fileInput.current.value = ''
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <div>
          <label htmlFor={`file-${issueId}`} className={labelClass}>
            File (PDF, JPEG, PNG, CSV or MP4, up to {MAX_MB} MB)
          </label>
          <input
            id={`file-${issueId}`}
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            onChange={(e) => {
              const chosen = e.target.files?.[0] ?? null
              setTooBig(!!chosen && chosen.size > MAX_MB * 1024 * 1024)
              setFile(chosen)
            }}
            className="mt-1 block w-full text-sm"
          />
        </div>
        <div>
          <label htmlFor={`docdate-${issueId}`} className={labelClass}>
            Document date
          </label>
          <input
            id={`docdate-${issueId}`}
            type="date"
            value={documentDate}
            onChange={(e) => setDocumentDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`relevance-${issueId}`} className={labelClass}>
          How does this file support the issue?
        </label>
        <input
          id={`relevance-${issueId}`}
          value={relevance}
          maxLength={2000}
          placeholder="e.g. brake adjustment record from the morning of the inspection"
          onChange={(e) => setRelevance(e.target.value)}
          className={inputClass}
        />
      </div>
      {tooBig && <p className="text-sm text-red-700">The file is larger than {MAX_MB} MB.</p>}
      {upload.isError && (
        <p className="text-sm text-red-700" role="alert">
          Upload failed: {upload.error.message}
        </p>
      )}
      <button
        type="submit"
        disabled={!file || tooBig || relevance.trim().length < 5 || upload.isPending}
        className="rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {upload.isPending ? 'Uploading…' : 'Upload'}
      </button>
    </form>
  )
}
