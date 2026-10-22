import { Paperclip } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'

import { useUploadDataQsEvidence } from '../../hooks/useDataQs'
import { inputClass, labelClass } from './intake/intakeState'
import { fileSize } from './labels'

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
  const [wrongType, setWrongType] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const upload = useUploadDataQsEvidence(caseId)

  const choose = (chosen: File | null) => {
    const extension = chosen?.name.match(/\.[^.]+$/)?.[0].toLowerCase() ?? ''
    const allowed = !chosen || ACCEPT.split(',').includes(extension)
    setWrongType(!allowed)
    setTooBig(!!chosen && chosen.size > MAX_MB * 1024 * 1024)
    setFile(allowed ? chosen : null)
    if (chosen && allowed && !title) setTitle(titleFromName(chosen.name))
  }
  // Why Upload is greyed out, so it never looks broken.
  const missing = !file
    ? 'Choose a file first.'
    : !title.trim()
      ? 'Add a title.'
      : relevance.trim().length < 5
        ? 'Say how the file supports the issue.'
        : null

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
          <span className={labelClass}>File (up to {MAX_MB} MB)</span>
          {/* The whole box opens the file picker; a file can also be dropped on it. */}
          <label
            htmlFor={`file-${issueId}`}
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
            className={`relative mt-1 flex cursor-pointer flex-wrap items-center gap-3 rounded-md border-2 border-dashed px-3 py-3 text-sm ${
              dragging
                ? 'border-accent bg-accent-soft'
                : 'border-slate-300 bg-surface hover:border-accent'
            } focus-within:ring-2 focus-within:ring-accent/40`}
          >
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-surface px-3 py-1.5 font-medium text-slate-800 shadow-sm">
              <Paperclip className="size-4" aria-hidden />
              {file ? 'Change file' : 'Choose a file'}
            </span>
            <span className={file ? 'font-medium text-slate-900' : 'text-slate-500'}>
              {file ? `${file.name} (${fileSize(file.size)})` : 'or drag it here'}
            </span>
            <input
              id={`file-${issueId}`}
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          {wrongType && (
            <p className="mt-1 text-sm text-red-700">
              DataQs doesn’t accept this type of file. Choose one of the types below.
            </p>
          )}
          <p className="mt-1 text-xs text-slate-600">
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
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={missing !== null || tooBig || upload.isPending}
          className="rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </button>
        {missing && <span className="text-xs text-slate-600">{missing}</span>}
        {upload.isSuccess && !file && (
          <span className="text-xs text-emerald-700">Uploaded. You can add another file.</span>
        )}
      </div>
    </form>
  )
}
