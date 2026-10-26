import { Download, FileImage, FileText, Paperclip } from 'lucide-react'
import { useState } from 'react'

import { dataQsFilingProofUrl } from '../../api/dataqs'
import { useDataQsBase, useUploadDataQsFilingProof } from '../../hooks/useDataQs'
import { usePortalMode } from '../../hooks/usePortalMode'
import type { DataQsAttempt, DataQsCase, DataQsFilingProof } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'
import { labelClass } from './intake/intakeState'
import { fileSize } from './labels'
import { primaryButton, secondaryButton } from './ui'

const MAX_MB = 25
const ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'
const PROOF_TYPE = /\.(pdf|png|jpe?g)$/i

/**
 * Pick the DataQs confirmation (a PDF, or a screenshot as PNG or JPEG): the whole box opens the
 * file picker, and a file can be dropped on it. `id` must be unique on the page.
 */
export function ProofDropBox({
  id,
  file,
  onChange,
}: {
  id: string
  file: File | null
  onChange: (file: File | null) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState('')
  const choose = (picked: File | null) => {
    if (picked && !PROOF_TYPE.test(picked.name)) {
      setProblem('Choose a PDF, PNG or JPEG.')
      return
    }
    if (picked && picked.size > MAX_MB * 1024 * 1024) {
      setProblem(`The file is larger than ${MAX_MB} MB.`)
      return
    }
    setProblem('')
    onChange(picked)
  }
  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          choose(e.dataTransfer.files[0] ?? null)
        }}
        className={`relative flex cursor-pointer flex-wrap items-center gap-3 rounded-md border-2 border-dashed px-3 py-3 text-sm ${
          dragging
            ? 'border-accent bg-accent-soft'
            : 'border-slate-300 bg-surface hover:border-accent'
        } focus-within:ring-2 focus-within:ring-accent/40`}
      >
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-surface px-3 py-1.5 font-medium text-slate-800 shadow-sm">
          <Paperclip className="size-4" aria-hidden />
          {file ? 'Change file' : 'Choose a file'}
        </span>
        <span className={file ? 'min-w-0 break-all font-medium text-slate-900' : 'text-slate-500'}>
          {file ? `${file.name} (${fileSize(file.size)})` : 'or drag it here'}
        </span>
        <input
          id={id}
          type="file"
          accept={ACCEPT}
          onChange={(e) => {
            choose(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
          className="sr-only"
        />
      </label>
      {problem ? (
        <p className="mt-1 text-sm text-red-700" role="alert">
          {problem}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-600">PDF, PNG or JPEG, up to {MAX_MB} MB.</p>
      )}
    </div>
  )
}

/**
 * Once filed: the confirmation DataQs gave for each filing, to download. STS staff add it here
 * (the client is emailed a link to the case); clients see the proofs of confirmed filings.
 */
export function DataQsFilingProofs({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const staff = usePortalMode() === 'internal'
  const filings = c.attempts.filter((a) => a.status === 'CONFIRMED')
  const latest = filings[filings.length - 1]
  const proofs = filings.flatMap((a) => a.proofs.map((p) => ({ attempt: a, proof: p })))
  return (
    <div className="space-y-3 text-sm">
      {proofs.length === 0 ? (
        <p className="text-slate-600">
          {staff
            ? 'No confirmation uploaded yet. Add the PDF or screenshot DataQs gave when it was filed; the client is emailed a link to it.'
            : 'STS will add the confirmation DataQs gave when your request was filed. You’ll get an email when it’s here.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {proofs.map(({ attempt, proof }) => (
            <ProofRow
              key={proof.id}
              caseId={c.id}
              attempt={attempt}
              proof={proof}
              several={filings.length > 1}
            />
          ))}
        </ul>
      )}
      {staff && latest && <AddProof caseId={c.id} attempt={latest} />}
    </div>
  )
}

function ProofRow({
  caseId,
  attempt,
  proof,
  several,
}: {
  caseId: number
  attempt: DataQsAttempt
  proof: DataQsFilingProof
  several: boolean
}) {
  const base = useDataQsBase()
  const url = dataQsFilingProofUrl(base, caseId, proof.id)
  const Icon = proof.mime_type.startsWith('image/') ? FileImage : FileText
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:flex-nowrap">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={url}
          className="break-all font-medium text-slate-900 hover:text-accent-strong hover:underline"
        >
          {proof.file_name}
        </a>
        <div className="text-xs text-slate-600">
          {several && attempt.gov_request_id && `Request ${attempt.gov_request_id} · `}
          {fileSize(proof.size_bytes)} · added {formatDateTime(proof.uploaded_at)}
          {proof.uploaded_by_name && ` by ${proof.uploaded_by_name}, STS`}
        </div>
      </div>
      <a
        href={url}
        className={`${secondaryButton} inline-flex shrink-0 items-center gap-1.5`}
        aria-label={`Download ${proof.file_name}`}
      >
        <Download className="size-4" aria-hidden />
        Download
      </a>
    </li>
  )
}

/** STS: add the confirmation to the latest filing; the client is emailed a link to the case. */
function AddProof({ caseId, attempt }: { caseId: number; attempt: DataQsAttempt }) {
  const [file, setFile] = useState<File | null>(null)
  const upload = useUploadDataQsFilingProof(caseId)
  return (
    <form
      className="space-y-2 rounded-md bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (file) upload.mutate({ attemptId: attempt.id, file }, { onSuccess: () => setFile(null) })
      }}
    >
      <span className={labelClass}>
        Add the DataQs confirmation
        {attempt.gov_request_id && ` for request ${attempt.gov_request_id}`}
      </span>
      <ProofDropBox id={`proof-${attempt.id}`} file={file} onChange={setFile} />
      {upload.isError && (
        <p className="text-red-700" role="alert">
          Could not upload: {upload.error.message}
        </p>
      )}
      {upload.isSuccess && !file && (
        <p className="text-emerald-700" role="status">
          Uploaded. The client was emailed that it’s on their case.
        </p>
      )}
      <button type="submit" className={primaryButton} disabled={!file || upload.isPending}>
        {upload.isPending ? 'Uploading…' : 'Upload and email the client'}
      </button>
    </form>
  )
}
