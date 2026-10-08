import type { Change } from '../../types/carrierProfile'
import { formatDate, humanize } from '../../utils/format'
import { Empty, Section } from './Section'
import { cellClass, headClass, tableClass } from './styles'

export function TimelineSection({ changes }: { changes: Change[] }) {
  return (
    <Section id="timeline" title="Timeline — recent changes">
      {changes.length === 0 ? (
        <Empty>
          No changes recorded yet. CarrierIQ keeps a history from the first time it loads a carrier;
          changes appear here as FMCSA updates the record.
        </Empty>
      ) : (
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={cellClass}>Date</th>
              <th className={cellClass}>Field</th>
              <th className={cellClass}>Before</th>
              <th className={cellClass}>After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {changes.map((c) => (
              <tr key={`${c.attribute}-${c.changed_on}-${c.new_value}`}>
                <td className={`${cellClass} whitespace-nowrap`}>{formatDate(c.changed_on)}</td>
                <td className={cellClass}>{humanize(c.attribute)}</td>
                <td className={`${cellClass} text-slate-500 line-through`}>
                  {c.old_value ?? '(empty)'}
                </td>
                <td className={cellClass}>{c.new_value ?? '(empty)'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}
