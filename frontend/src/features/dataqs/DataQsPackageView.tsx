import { StatusBadge } from '../../components/StatusBadge'
import type { DataQsPackage } from '../../types/dataqs'
import { formatDate, formatDateTime } from '../../utils/format'
import { fileSize } from './labels'
import { shortHash } from './ui'

/** A frozen filing package: exactly what STS will file once the carrier approves it. */
export function DataQsPackageView({ pkg }: { pkg: DataQsPackage }) {
  const m = pkg.manifest
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">Package v{pkg.package_version}</span>
        {pkg.approved && <StatusBadge label="Approved by carrier" tone="ok" />}
        {pkg.invalidated_at && <StatusBadge label="Replaced" tone="neutral" />}
        <span className="text-xs text-slate-500" title={pkg.manifest_hash}>
          Fingerprint <span className="font-mono">{shortHash(pkg.manifest_hash)}</span> · built{' '}
          {formatDateTime(pkg.created_at)}
          {pkg.created_by_name && ` by ${pkg.created_by_name}`}
        </span>
      </div>

      {(m.dataqs_reason_label || m.viewed_in) && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {m.dataqs_reason_label && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                DataQs reason
              </dt>
              <dd className="text-slate-800">{m.dataqs_reason_label}</dd>
            </div>
          )}
          {m.viewed_in && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Where the data was viewed
              </dt>
              <dd className="text-slate-800">{m.viewed_in}</dd>
            </div>
          )}
        </dl>
      )}

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Narrative</h3>
        <p className="mt-1 whitespace-pre-line rounded-md bg-slate-50 p-3 text-slate-800">
          {pkg.narrative}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Requested corrections
        </h3>
        <ul className="mt-1 space-y-1">
          {m.issues.map((issue) => (
            <li key={issue.issue_id}>
              {issue.violation_code ? (
                <>
                  {issue.description ?? 'Violation'}{' '}
                  <span className="font-mono text-xs text-slate-500">{issue.violation_code}</span>
                </>
              ) : (
                'The whole inspection'
              )}
              {issue.requested_value && (
                <span className="text-slate-600"> → {issue.requested_value}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Evidence ({m.evidence.length})
        </h3>
        {m.evidence.length === 0 ? (
          <p className="mt-1 text-slate-500">No files in this package.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {m.evidence.map((e) => (
              <li key={e.evidence_id} className="flex flex-wrap gap-x-3 py-1.5">
                <span className="font-medium text-slate-900">{e.title ?? e.file_name}</span>
                {e.title && <span className="text-xs text-slate-500">{e.file_name}</span>}
                <span className="text-xs text-slate-500">
                  {fileSize(e.size_bytes)}
                  {e.document_date && ` · dated ${formatDate(e.document_date)}`}
                </span>
                <span className="font-mono text-xs text-slate-500" title={e.sha256}>
                  SHA-256 {shortHash(e.sha256)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {m.references.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">References</h3>
          <ul className="mt-1 list-disc pl-5">
            {m.references.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Filed by {m.representative.company}
        {m.representative.specialist && ` (${m.representative.specialist})`} for{' '}
        {m.carrier.legal_name ?? `USDOT ${m.carrier.usdot_number}`}, inspection{' '}
        <span className="font-mono">
          {m.event.inspection_report_number ?? m.event.source_event_id}
        </span>
        {m.event.state && `, ${m.event.state}`}.
      </p>
    </div>
  )
}
