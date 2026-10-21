import { Copy, Download } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { dataQsEvidenceUrl } from '../../../api/dataqs'
import { StatusBadge } from '../../../components/StatusBadge'
import { useMe } from '../../../hooks/useAuth'
import {
  useConfirmDataQsFiling,
  useSettleDataQsFiling,
  useStartDataQsFiling,
} from '../../../hooks/useDataQs'
import type { DataQsAttempt, DataQsCase, DataQsPackage } from '../../../types/dataqs'
import { formatDate, formatDateTime } from '../../../utils/format'
import { inputClass, labelClass } from '../intake/intakeState'
import { primaryButton, secondaryButton, shortHash } from '../ui'

const ATTEMPT_TONE = {
  STARTED: 'pending',
  UNCONFIRMED: 'warn',
  CONFIRMED: 'ok',
  ABANDONED: 'neutral',
} as const

/** "2026-10-21T10:35" in local time, for a datetime-local input. */
function localNow(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/**
 * STS: file the approved package by hand in the DataQs portal, then record the receipt.
 * Start → (file in DataQs) → Confirm with the request ID and acknowledgement. If the portal times
 * out, mark it unconfirmed: no new attempt until it is checked against DataQs.
 */
export function DataQsSubmissionConsole({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const pkg = c.packages.find((p) => p.approved && !p.invalidated_at)
  const open = c.attempts.find((a) => a.status === 'STARTED' || a.status === 'UNCONFIRMED')
  return (
    <div className="space-y-5 text-sm">
      {c.can_file && pkg && <StartFiling dataqsCase={c} pkg={pkg} />}
      {open && pkg && <OpenAttempt dataqsCase={c} pkg={pkg} attempt={open} />}
      {c.attempts.length > 0 && <AttemptHistory attempts={c.attempts} />}
    </div>
  )
}

function StartFiling({ dataqsCase: c, pkg }: { dataqsCase: DataQsCase; pkg: DataQsPackage }) {
  const { data: me } = useMe()
  const [account, setAccount] = useState(`STS DataQs account (${me?.full_name ?? 'me'})`)
  const [key] = useState(() => crypto.randomUUID())
  const start = useStartDataQsFiling(c.id)
  const prior = c.prior_activity
  return (
    <div className="space-y-3">
      <p className="text-slate-700">
        Package v{pkg.package_version} is approved by the carrier. Before filing:
      </p>
      <ul className="list-disc space-y-1 pl-5 text-slate-700">
        <li>
          Search DataQs for an existing request on inspection{' '}
          <span className="font-mono text-xs">{c.event.inspection_id}</span>
          {prior?.has_prior_request &&
            ` (the carrier says one was filed before${prior.prior_request_id ? `: ${prior.prior_request_id}` : ''})`}
          .
        </li>
        <li>
          File it with the agency for the state where the inspection happened (
          {c.event.state ?? 'unknown state'}), not the carrier’s home state.
        </li>
        <li>Use your own STS DataQs login; never a shared or carrier password.</li>
      </ul>
      <div className="max-w-md">
        <label htmlFor="filing-account" className={labelClass}>
          Filing account (who signs in to DataQs)
        </label>
        <input
          id="filing-account"
          value={account}
          maxLength={200}
          onChange={(e) => setAccount(e.target.value)}
          className={inputClass}
        />
      </div>
      {start.isError && (
        <p className="text-red-700" role="alert">
          Could not start: {start.error.message}
        </p>
      )}
      <button
        type="button"
        className={primaryButton}
        disabled={account.trim().length < 3 || start.isPending}
        onClick={() =>
          start.mutate({
            input: {
              package_id: pkg.id,
              package_hash: pkg.manifest_hash,
              filing_account: account.trim(),
            },
            key,
          })
        }
      >
        {start.isPending ? 'Starting…' : 'Start filing in DataQs'}
      </button>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong hover:underline"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      <Copy className="size-3.5" aria-hidden />
      {copied ? 'Copied' : label}
    </button>
  )
}

function OpenAttempt({
  dataqsCase: c,
  pkg,
  attempt,
}: {
  dataqsCase: DataQsCase
  pkg: DataQsPackage
  attempt: DataQsAttempt
}) {
  const unconfirmed = attempt.status === 'UNCONFIRMED'
  return (
    <div className="space-y-4">
      {unconfirmed ? (
        <div className="rounded-md bg-amber-50 p-3 text-amber-900">
          <p className="font-medium">Filing attempt #{attempt.id} is unconfirmed.</p>
          <p>
            {attempt.note && <>“{attempt.note}”. </>}Search DataQs for inspection{' '}
            <span className="font-mono text-xs">{c.event.inspection_id}</span>. If the request is
            there, record its details below. If it isn’t, mark it not found, then file again.
          </p>
        </div>
      ) : (
        <FilingGuide dataqsCase={c} pkg={pkg} />
      )}
      <ConfirmForm dataqsCase={c} pkg={pkg} attempt={attempt} />
      <SettleForm caseId={c.id} attempt={attempt} />
    </div>
  )
}

/** What to enter in DataQs: the record to find, the approved narrative and files. */
function FilingGuide({ dataqsCase: c, pkg }: { dataqsCase: DataQsCase; pkg: DataQsPackage }) {
  return (
    <ol className="list-decimal space-y-3 pl-5 text-slate-700">
      <li>
        Sign in to DataQs and find the inspection: report{' '}
        <span className="font-mono text-xs">{c.event.inspection_id}</span>{' '}
        <CopyButton text={c.event.inspection_id} label="Copy" />,{' '}
        {formatDate(c.event.inspection_date)}
        {c.event.state && `, ${c.event.state}`}, USDOT {c.usdot_number}.
      </li>
      <li>
        Choose the request type that fits, and enter the approved narrative exactly:{' '}
        <CopyButton text={pkg.narrative} label="Copy narrative" />
        <p className="mt-1 whitespace-pre-line rounded-md bg-slate-50 p-3 text-slate-800">
          {pkg.narrative}
        </p>
      </li>
      <li>
        Upload these files, and only these:
        <ul className="mt-1 space-y-1">
          {pkg.manifest.evidence.map((e) => (
            <li key={e.evidence_id} className="flex flex-wrap items-center gap-2">
              <a
                href={dataQsEvidenceUrl('/dataqs', c.id, e.evidence_id)}
                className="inline-flex items-center gap-1 font-medium text-accent-strong hover:underline"
              >
                <Download className="size-3.5" aria-hidden />
                {e.file_name}
              </a>
              <span className="font-mono text-xs text-slate-500" title={e.sha256}>
                SHA-256 {shortHash(e.sha256)}
              </span>
            </li>
          ))}
        </ul>
      </li>
      <li>Submit, then record what DataQs shows below. A saved draft is not a submission.</li>
    </ol>
  )
}

function ConfirmForm({
  dataqsCase: c,
  pkg,
  attempt,
}: {
  dataqsCase: DataQsCase
  pkg: DataQsPackage
  attempt: DataQsAttempt
}) {
  const [requestId, setRequestId] = useState('')
  const [filedAt, setFiledAt] = useState(localNow)
  const [agency, setAgency] = useState(c.event.state ?? '')
  const [ack, setAck] = useState('')
  const [portalStatus, setPortalStatus] = useState('Submitted')
  const [sure, setSure] = useState(false)
  const confirm = useConfirmDataQsFiling(c.id)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    confirm.mutate({
      attemptId: attempt.id,
      input: {
        gov_request_id: requestId.trim(),
        filed_at: new Date(filedAt).toISOString(),
        assigned_agency: agency.trim() || null,
        acknowledgement: ack.trim(),
        package_version: pkg.package_version,
        portal_status: portalStatus.trim() || null,
      },
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 p-4">
      <h3 className="font-medium text-slate-900">
        {attempt.status === 'UNCONFIRMED' ? 'Found it in DataQs' : 'Record the submission'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="gov-id" className={labelClass}>
            DataQs request ID
          </label>
          <input
            id="gov-id"
            value={requestId}
            maxLength={50}
            onChange={(e) => setRequestId(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="filed-at" className={labelClass}>
            Submitted at (your local time)
          </label>
          <input
            id="filed-at"
            type="datetime-local"
            value={filedAt}
            onChange={(e) => setFiledAt(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="agency" className={labelClass}>
            Assigned agency
          </label>
          <input
            id="agency"
            value={agency}
            maxLength={200}
            placeholder="e.g. Texas DPS"
            onChange={(e) => setAgency(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="portal-status" className={labelClass}>
            Status shown in DataQs
          </label>
          <input
            id="portal-status"
            value={portalStatus}
            maxLength={100}
            onChange={(e) => setPortalStatus(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="ack" className={labelClass}>
          Acknowledgement (paste exactly what DataQs showed)
        </label>
        <textarea
          id="ack"
          rows={3}
          value={ack}
          maxLength={5000}
          onChange={(e) => setAck(e.target.value)}
          className={inputClass}
        />
      </div>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={sure}
          onChange={(e) => setSure(e.target.checked)}
        />
        <span>
          I submitted package v{pkg.package_version} in DataQs and saw this acknowledgement.
        </span>
      </label>
      {confirm.isError && (
        <p className="text-red-700" role="alert">
          Could not record it: {confirm.error.message}
        </p>
      )}
      <button
        type="submit"
        className={primaryButton}
        disabled={!sure || !requestId.trim() || ack.trim().length < 3 || confirm.isPending}
      >
        {confirm.isPending ? 'Saving…' : 'Confirm submission'}
      </button>
    </form>
  )
}

function SettleForm({ caseId, attempt }: { caseId: number; attempt: DataQsAttempt }) {
  const [note, setNote] = useState('')
  const settle = useSettleDataQsFiling(caseId)
  const unconfirmed = attempt.status === 'UNCONFIRMED'
  const act = (action: 'unconfirmed' | 'abandon') =>
    settle.mutate({ attemptId: attempt.id, action, note: note.trim() })
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-4">
      <h3 className="font-medium text-slate-900">
        {unconfirmed ? 'Not in DataQs?' : 'Something went wrong?'}
      </h3>
      <label htmlFor="settle-note" className={labelClass}>
        What happened
      </label>
      <input
        id="settle-note"
        value={note}
        maxLength={2000}
        placeholder={
          unconfirmed
            ? 'e.g. Searched DataQs by report number: no request found'
            : 'e.g. Portal timed out after Submit'
        }
        onChange={(e) => setNote(e.target.value)}
        className={inputClass}
      />
      {settle.isError && (
        <p className="text-red-700" role="alert">
          Could not save: {settle.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!unconfirmed && (
          <button
            type="button"
            className={secondaryButton}
            disabled={note.trim().length < 5 || settle.isPending}
            onClick={() => act('unconfirmed')}
          >
            Not sure it was submitted
          </button>
        )}
        <button
          type="button"
          className={secondaryButton}
          disabled={note.trim().length < 5 || settle.isPending}
          onClick={() => act('abandon')}
        >
          {unconfirmed ? 'Not found: file again' : 'Nothing was submitted'}
        </button>
      </div>
    </div>
  )
}

function AttemptHistory({ attempts }: { attempts: DataQsAttempt[] }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Filing attempts
      </h3>
      <ul className="mt-1 divide-y divide-slate-100">
        {[...attempts].reverse().map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="text-slate-900">#{a.id}</span>
            <StatusBadge label={a.status.toLowerCase()} tone={ATTEMPT_TONE[a.status]} />
            <span className="text-xs text-slate-500">
              v{a.package_version} · started {formatDateTime(a.started_at)}
              {a.filed_by_name && ` by ${a.filed_by_name}`}
              {a.filing_account && ` · ${a.filing_account}`}
            </span>
            {a.gov_request_id && (
              <span className="font-mono text-xs text-slate-700">{a.gov_request_id}</span>
            )}
            {a.note && <span className="w-full text-xs text-slate-600">{a.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
