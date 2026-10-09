import { useNavigate } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import type { CarrierSearchResult } from '../../types/carrier'
import { formatDateTime } from '../../utils/format'
import { reviewLabel } from '../../utils/review'
import { INSURANCE_LABEL, insuranceTone, severityTone, statusTone } from '../../utils/status'

function DocketList({ result }: { result: CarrierSearchResult }) {
  if (result.dockets.length === 0) return <span className="text-slate-400">—</span>
  return (
    <div className="space-y-0.5">
      {result.dockets.map((d) => (
        <div key={`${d.prefix}${d.number}`} className="whitespace-nowrap">
          {d.prefix}
          {d.number}
          {d.status && d.status !== 'ACTIVE' && (
            <span className="ml-1 text-xs text-slate-400">({d.status.toLowerCase()})</span>
          )}
        </div>
      ))}
    </div>
  )
}

export function CarrierSearchResults({ results }: { results: CarrierSearchResult[] }) {
  const navigate = useNavigate()

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-surface">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Carrier</th>
            <th className="px-3 py-2">USDOT</th>
            <th className="px-3 py-2">MC / Docket</th>
            <th className="px-3 py-2">Authority</th>
            <th className="px-3 py-2">Registration</th>
            <th className="px-3 py-2">Insurance</th>
            <th className="px-3 py-2 text-right">Fleet</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Review status</th>
            <th className="px-3 py-2">Last updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {results.map((r) => (
            <tr
              key={r.usdot_number}
              onClick={() => navigate(`/carriers/${r.usdot_number}`)}
              className="cursor-pointer align-top hover:bg-slate-50"
            >
              <td className="px-3 py-2">
                <a
                  href={`/carriers/${r.usdot_number}`}
                  onClick={(event) => {
                    event.preventDefault()
                    navigate(`/carriers/${r.usdot_number}`)
                  }}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {r.legal_name}
                </a>
                {r.dba_name && <div className="text-xs text-slate-500">DBA {r.dba_name}</div>}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.usdot_number}</td>
              <td className="px-3 py-2 font-mono text-xs">
                <DocketList result={r} />
              </td>
              <td className="px-3 py-2">
                {r.authority_status ? (
                  <StatusBadge label={r.authority_status} tone={statusTone(r.authority_status)} />
                ) : (
                  <span className="whitespace-nowrap text-xs text-slate-400">No dockets</span>
                )}
              </td>
              <td className="px-3 py-2">
                {r.registration_status && (
                  <StatusBadge
                    label={r.registration_status}
                    tone={statusTone(r.registration_status)}
                  />
                )}
              </td>
              <td className="px-3 py-2">
                {r.insurance_status ? (
                  <StatusBadge
                    label={INSURANCE_LABEL[r.insurance_status] ?? r.insurance_status}
                    tone={insuranceTone(r.insurance_status)}
                  />
                ) : (
                  <span className="whitespace-nowrap text-xs text-slate-400">
                    {r.loaded ? 'No active authority' : '—'}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.fleet_size ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {[r.city, r.state].filter(Boolean).join(', ') || '—'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-xs">
                {r.review_status === 'OPEN_SIGNALS' ? (
                  <StatusBadge
                    label={reviewLabel(r.review_status, r.open_signal_count) ?? ''}
                    tone={severityTone(r.highest_open_severity ?? 'LOW')}
                  />
                ) : (
                  <span className="text-slate-400">
                    {reviewLabel(r.review_status, r.open_signal_count) ?? '—'}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                {r.loaded ? (
                  <>
                    {formatDateTime(r.last_refreshed_at)}
                    {r.stale && (
                      <div className="mt-1">
                        <StatusBadge label="stale" tone="warn" />
                      </div>
                    )}
                  </>
                ) : (
                  <span title="Found in FMCSA data; opening it loads the full record">
                    Not loaded yet
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
