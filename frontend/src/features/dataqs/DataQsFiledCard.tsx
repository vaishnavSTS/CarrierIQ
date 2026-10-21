import type { DataQsCase } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'

const LEVEL_LABEL = {
  INITIAL: 'Initial review',
  RECONSIDERATION: 'Reconsideration',
  FINAL: 'Final review',
} as const

/** Once filed: the DataQs request ID, when it was filed, and where the review stands. */
export function DataQsFiledCard({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const filed = c.attempts.find((a) => a.status === 'CONFIRMED')
  const cycle = c.review_cycles[c.review_cycles.length - 1]
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt className="text-xs text-slate-500">DataQs request ID</dt>
        <dd className="font-mono">{c.gov_request_id}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Filed</dt>
        <dd>
          {formatDateTime(filed?.filed_at ?? null)}
          {filed?.filed_by_name && (
            <span className="block text-xs text-slate-500">by {filed.filed_by_name}, STS</span>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Reviewing agency</dt>
        <dd>{filed?.assigned_agency ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Review stage</dt>
        <dd>
          {cycle ? LEVEL_LABEL[cycle.level] : '—'}
          {c.government_raw_status && (
            <span className="block text-xs text-slate-500">
              DataQs shows: {c.government_raw_status}
            </span>
          )}
        </dd>
      </div>
    </dl>
  )
}
