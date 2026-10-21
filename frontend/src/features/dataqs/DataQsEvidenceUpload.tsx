import { useRef, useState, type FormEvent } from 'react'

import { useUploadDataQsEvidence } from '../../hooks/useDataQs'
import { inputClass, labelClass } from './intake/intakeState'

/** The file types DataQs accepts (ZIP and ETHOS excepted until uploads are scanned). */
const ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.tif',
  '.tiff',
  '.txt',
  '.wpd',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.mp4',
  '.avi',
  '.mkv',
  '.mpeg',
  '.mpg',
  '.wmv',
].join(',')
const MAX_MB = 25

/** "brake-log_2025-03-14.pdf" -> "brake log 2025 03 14": a starting title from the file name. */
function titleFromName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** Upload one file for an issue, with the short title DataQs asks for and a note on how it
 * supports the issue. The server decides the file's type from its content. */
export function DataQsEvidenceUpload({
  caseId,
  issueId,
  titles,
}: {
  caseId: number
  issueId: number
  /** Suggested titles */
  titles: string[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
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
        title: title.trim() || null,
      },
      {
        onSuccess: () => {
          setFile(null)
          setTitle('')
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
            File (up to {MAX_MB} MB)
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
              if (chosen && !title) setTitle(titleFromName(chosen.name))
            }}
            className="mt-1 block w-full text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            PDF, Word, Excel, TIF, TXT, WordPerfect, JPEG, PNG, GIF, MP4, AVI, MKV, MPEG or WMV: the
            types DataQs accepts. Save ELD exports as PDF, Excel or TXT.
          </p>
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
        <label htmlFor={`title-${issueId}`} className={labelClass}>
          Title (DataQs asks a brief title for each file)
        </label>
        <input
          id={`title-${issueId}`}
          list={`titles-${issueId}`}
          value={title}
          maxLength={200}
          placeholder="e.g. Maintenance records"
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
        <datalist id={`titles-${issueId}`}>
          {titles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
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
        disabled={
          !file || tooBig || !title.trim() || relevance.trim().length < 5 || upload.isPending
        }
        className="rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {upload.isPending ? 'Uploading…' : 'Upload'}
      </button>
    </form>
  )
}
