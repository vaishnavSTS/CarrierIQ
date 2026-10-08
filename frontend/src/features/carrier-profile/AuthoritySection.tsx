import { StatusBadge } from '../../components/StatusBadge'
import type { CarrierProfile } from '../../types/carrierProfile'
import { statusTone } from '../../utils/status'
import { Empty, Section } from './Section'
import { cellClass, headClass, tableClass } from './styles'

export function AuthoritySection({ profile }: { profile: CarrierProfile }) {
  const dockets = profile.authority.dockets
  return (
    <Section id="authority" title="Authority & Insurance">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Dockets
          </h3>
          {dockets.length === 0 ? (
            <Empty>No MC/MX/FF dockets on file (e.g. a private or intrastate carrier).</Empty>
          ) : (
            <table className={tableClass}>
              <thead className={headClass}>
                <tr>
                  <th className={cellClass}>Docket</th>
                  <th className={cellClass}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dockets.map((d) => (
                  <tr key={`${d.prefix}${d.number}`}>
                    <td className={`${cellClass} font-mono`}>
                      {d.prefix}
                      {d.number}
                    </td>
                    <td className={cellClass}>
                      {d.status ? (
                        <StatusBadge label={d.status} tone={statusTone(d.status)} />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Insurance
          </h3>
          <Empty>
            Insurance filings (BIPD, cargo, insurer, effective and cancellation dates) are not
            loaded yet.
          </Empty>
        </div>
      </div>
    </Section>
  )
}
