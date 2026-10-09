import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import { useCarrierEquipment } from '../../hooks/useCarrierEquipment'
import type { EquipmentVehicle, Fleet, VinCarrier } from '../../types/carrierEquipment'
import { formatDate, humanize } from '../../utils/format'
import { Empty, Section, Stat } from './Section'
import { cellClass, headClass, tableClass } from './styles'

const PREVIEW_ROWS = 25

const FILTERS = [
  ['all', 'All'],
  ['power', 'Power units'],
  ['trailer', 'Trailers'],
  ['shared', 'Seen under other USDOTs'],
  ['check', 'Invalid check digit'],
] as const

type FilterId = (typeof FILTERS)[number][0]

function kind(v: EquipmentVehicle): 'power' | 'trailer' | 'unknown' {
  if (!v.vehicle_type) return 'unknown'
  return v.vehicle_type.toUpperCase() === 'TRAILER' ? 'trailer' : 'power'
}

function matches(v: EquipmentVehicle, filter: FilterId, text: string): boolean {
  if (filter === 'power' && kind(v) !== 'power') return false
  if (filter === 'trailer' && kind(v) !== 'trailer') return false
  if (filter === 'shared' && v.other_carriers.length === 0) return false
  if (filter === 'check' && v.check_digit_valid !== false) return false
  if (!text) return true
  const haystack = [v.vin, v.make, v.model, v.year, v.body_class].join(' ').toUpperCase()
  return haystack.includes(text.toUpperCase())
}

/** "Class 8: 33,001 lb and above (14,969 kg and above)" -> "Class 8" */
function weightClass(gvwr: string | null): string {
  return gvwr ? gvwr.split(':')[0] : '—'
}

function describe(v: EquipmentVehicle): string {
  const name = [v.year, v.make, v.model].filter(Boolean).join(' ')
  if (name) return name
  return v.decoded ? 'Not identified by NHTSA' : 'Not decoded yet'
}

function FleetNote({ fleet }: { fleet: Fleet }) {
  const registered = fleet.registered_power_units
  if (registered === null || fleet.observed_vehicles === 0) return null
  const recent = fleet.recent_power_units
  let text: string
  if (recent < registered) {
    text = `Inspections in the last ${fleet.recent_months} months show ${recent} of the ${registered} registered power units. Only some vehicles are ever inspected, so this reflects inspection coverage. It does not show that vehicles are missing or out of use.`
  } else if (recent > registered) {
    text = `More power units were inspected in the last ${fleet.recent_months} months (${recent}) than are registered (${registered}). The fleet may have grown since the last MCS-150 update, or vehicles may be leased or replaced.`
  } else {
    text = `Inspections in the last ${fleet.recent_months} months show as many power units as are registered (${registered}).`
  }
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <p>{text}</p>
      <p className="mt-1 text-xs text-slate-500">
        Vehicles seen {formatDate(fleet.first_observed)} – {formatDate(fleet.last_observed)}. Power
        units and trailers are told apart from the NHTSA VIN decode
        {fleet.observed_unknown_type > 0 &&
          `; ${fleet.observed_unknown_type} vehicle(s) have no decoded type yet`}
        .
      </p>
    </div>
  )
}

function OtherCarriers({ carriers }: { carriers: VinCarrier[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        The same VIN was recorded on inspections of these carriers. Equipment often moves between
        carriers legitimately (leases, sales, owner-operators), so this is a relationship to be
        aware of, not a finding.
      </p>
      <table className="text-xs">
        <tbody>
          {carriers.map((c) => (
            <tr key={c.usdot_number}>
              <td className="py-1 pr-4">
                <Link
                  to={`/carriers/${c.usdot_number}`}
                  className="font-mono text-slate-900 underline hover:text-slate-600"
                >
                  USDOT {c.usdot_number}
                </Link>
              </td>
              <td className="py-1 pr-4 text-slate-700">{c.legal_name ?? 'Not loaded yet'}</td>
              <td className="py-1 pr-4 tabular-nums text-slate-700">
                {c.inspections} inspection{c.inspections === 1 ? '' : 's'}
              </td>
              <td className="whitespace-nowrap py-1 pr-4 text-slate-700">
                {c.first_seen === c.last_seen
                  ? formatDate(c.first_seen)
                  : `${formatDate(c.first_seen)} – ${formatDate(c.last_seen)}`}
              </td>
              <td className="py-1">
                <StatusBadge label={`${c.confidence.toLowerCase()} confidence`} tone="neutral" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VehicleRow({
  vehicle: v,
  open,
  onToggle,
}: {
  vehicle: EquipmentVehicle
  open: boolean
  onToggle: () => void
}) {
  const shared = v.other_carriers.length
  return (
    <Fragment>
      <tr>
        <td className={`${cellClass} whitespace-nowrap font-mono text-xs`}>
          {v.vin}
          {v.check_digit_valid === false && (
            <span
              className="ml-2 align-middle"
              title="The VIN's check digit doesn't match: it was probably mistyped on the inspection report."
            >
              <StatusBadge label="check digit" tone="warn" />
            </span>
          )}
        </td>
        <td className={cellClass}>
          <div className={v.make ? 'text-slate-900' : 'text-slate-500'}>{describe(v)}</div>
          {v.body_class && <div className="text-xs text-slate-500">{v.body_class}</div>}
        </td>
        <td className={`${cellClass} whitespace-nowrap text-xs text-slate-700`}>
          {v.vehicle_type ? humanize(v.vehicle_type.toLowerCase()) : '—'}
          <div className="text-slate-500">{weightClass(v.gvwr)}</div>
        </td>
        <td className={`${cellClass} text-right tabular-nums`}>{v.inspections}</td>
        <td className={`${cellClass} whitespace-nowrap`}>{formatDate(v.first_seen)}</td>
        <td className={`${cellClass} whitespace-nowrap`}>{formatDate(v.last_seen)}</td>
        <td className={`${cellClass} whitespace-nowrap`}>
          {shared === 0 ? (
            <span className="text-slate-400">—</span>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="text-xs text-slate-900 underline hover:text-slate-600"
            >
              {shared} other USDOT{shared === 1 ? '' : 's'} {open ? '▴' : '▾'}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-3 py-3">
            <OtherCarriers carriers={v.other_carriers} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}

export function EquipmentSection({ usdotNumber }: { usdotNumber: number }) {
  const { data, error, isPending } = useCarrierEquipment(usdotNumber)
  const [filter, setFilter] = useState<FilterId>('all')
  const [text, setText] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [openVin, setOpenVin] = useState<string | null>(null)

  const rows = useMemo(
    () => (data ? data.vehicles.filter((v) => matches(v, filter, text.trim())) : []),
    [data, filter, text],
  )

  return (
    <Section id="equipment" title="Equipment">
      {isPending && (
        <p className="text-sm text-slate-500">
          Loading equipment… new VINs are decoded with NHTSA the first time, which can take a few
          seconds for a large fleet.
        </p>
      )}
      {error && <p className="text-sm text-red-700">Could not load equipment: {error.message}</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Registered power units"
              value={data.fleet.registered_power_units ?? '—'}
              note="As reported to FMCSA (MCS-150)"
            />
            <Stat
              label="Power units observed"
              value={data.fleet.observed_power_units}
              note={`${data.fleet.recent_power_units} in the last ${data.fleet.recent_months} months`}
            />
            <Stat
              label="Trailers observed"
              value={data.fleet.observed_trailers}
              note="Distinct VINs on inspections"
            />
            <Stat
              label="VINs under other USDOTs"
              value={data.shared_vin_count}
              note={
                data.other_carrier_count
                  ? `Across ${data.other_carrier_count} other USDOT number${data.other_carrier_count === 1 ? '' : 's'}`
                  : 'None found'
              }
            />
          </div>
          <FleetNote fleet={data.fleet} />

          {data.vehicles.length === 0 ? (
            <div className="mt-4">
              <Empty>No vehicles observed on this carrier’s inspections.</Empty>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {FILTERS.filter(
                  ([id]) =>
                    (id !== 'check' || data.invalid_check_digit_count > 0) &&
                    (id !== 'shared' || data.shared_vin_count > 0),
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filter === id}
                    onClick={() => {
                      setFilter(id)
                      setShowAll(false)
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs ring-1 ring-inset ${
                      filter === id
                        ? 'bg-accent text-white ring-accent'
                        : 'bg-surface text-slate-700 ring-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                    {id === 'check' && ` (${data.invalid_check_digit_count})`}
                    {id === 'shared' && ` (${data.shared_vin_count})`}
                  </button>
                ))}
                <input
                  type="search"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    setShowAll(false)
                  }}
                  placeholder="Search VIN, make, model, year"
                  aria-label="Search vehicles"
                  className="ml-auto w-full rounded-md border border-slate-300 px-2.5 py-1 text-sm sm:w-64"
                />
              </div>

              <p className="mt-3 text-xs text-slate-500">
                {rows.length} of {data.vehicles.length} vehicles · most recently inspected first ·
                make, model and year decoded from the VIN by NHTSA
              </p>
              {rows.length === 0 ? (
                <div className="mt-2">
                  <Empty>No vehicles match.</Empty>
                </div>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className={tableClass}>
                    <thead className={headClass}>
                      <tr>
                        <th className={cellClass}>VIN</th>
                        <th className={cellClass}>Vehicle</th>
                        <th className={cellClass}>Type</th>
                        <th className={`${cellClass} text-right`}>Inspections</th>
                        <th className={cellClass}>First seen</th>
                        <th className={cellClass}>Last seen</th>
                        <th className={cellClass}>Other USDOTs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(showAll ? rows : rows.slice(0, PREVIEW_ROWS)).map((v) => (
                        <VehicleRow
                          key={v.vin}
                          vehicle={v}
                          open={openVin === v.vin}
                          onToggle={() => setOpenVin(openVin === v.vin ? null : v.vin)}
                        />
                      ))}
                    </tbody>
                  </table>
                  {!showAll && rows.length > PREVIEW_ROWS && (
                    <button
                      type="button"
                      onClick={() => setShowAll(true)}
                      className="mt-2 text-xs text-slate-600 underline hover:text-slate-900"
                    >
                      Show all {rows.length}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Section>
  )
}
