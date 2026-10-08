import type { Equipment } from '../../types/carrierProfile'
import { formatDate } from '../../utils/format'
import { Empty, Section, Stat } from './Section'
import { cellClass, headClass, tableClass } from './styles'

export function EquipmentSection({ equipment }: { equipment: Equipment }) {
  return (
    <Section id="equipment" title="Equipment">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Power units"
          value={equipment.power_units ?? '—'}
          note="As reported to FMCSA"
        />
        <Stat
          label="Vehicles observed"
          value={equipment.observed_vehicle_count}
          note="Distinct VINs on inspections"
        />
      </div>

      {equipment.vehicles.length === 0 ? (
        <div className="mt-4">
          <Empty>No vehicles observed on inspections.</Empty>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Most recently seen vehicles
            {equipment.observed_vehicle_count > equipment.vehicles.length &&
              ` (${equipment.vehicles.length} of ${equipment.observed_vehicle_count})`}
          </h3>
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>VIN</th>
                <th className={`${cellClass} text-right`}>Inspections</th>
                <th className={cellClass}>First seen</th>
                <th className={cellClass}>Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {equipment.vehicles.map((v) => (
                <tr key={v.vin}>
                  <td className={`${cellClass} font-mono text-xs`}>{v.vin}</td>
                  <td className={`${cellClass} text-right tabular-nums`}>{v.inspections}</td>
                  <td className={cellClass}>{formatDate(v.first_seen)}</td>
                  <td className={cellClass}>{formatDate(v.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
