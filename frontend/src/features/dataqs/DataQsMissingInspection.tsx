import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { useCreateDataQsMissingInspection, useDataQsCasePath } from '../../hooks/useDataQs'
import { US_STATES } from '../carrier-profile/safety/usStates'
import { levelLabel } from '../carrier-profile/safety/inspectionLevels'
import { inputClass, labelClass } from './intake/intakeState'
import { primaryButton } from './ui'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * DataQs's "Inspection missing from my report": an inspection that should be on the carrier's
 * record but isn't in FMCSA's data (so not in the list above). The carrier describes it; the draft
 * case then takes evidence (their copy of the report) and is submitted like any other.
 */
export function DataQsMissingInspection({ usdotNumber }: { usdotNumber: number }) {
  const [state, setState] = useState('')
  const [reportNumber, setReportNumber] = useState('')
  const [date, setDate] = useState('')
  const [level, setLevel] = useState('')
  const [location, setLocation] = useState('')
  const [basis, setBasis] = useState('')
  const [key] = useState(() => crypto.randomUUID())
  const create = useCreateDataQsMissingInspection(usdotNumber)
  const casePath = useDataQsCasePath()
  const navigate = useNavigate()

  const report = reportNumber.trim().toUpperCase()
  const ready =
    state !== '' &&
    /^[A-Z0-9-]{3,40}$/.test(report) &&
    date !== '' &&
    date <= today() &&
    basis.trim().length >= 20

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(
      {
        key,
        input: {
          state,
          report_number: report,
          inspection_date: date,
          level: level ? Number(level) : null,
          location: location.trim() || null,
          factual_basis: basis.trim(),
        },
      },
      { onSuccess: (created) => navigate(casePath(created.id)) },
    )
  }

  return (
    <details className="border-t border-slate-100 pt-4">
      <summary className="cursor-pointer text-sm font-semibold text-accent-strong">
        An inspection is missing from my record
      </summary>
      <form onSubmit={submit} className="mt-3 space-y-4 text-sm">
        <p className="text-slate-700">
          For an inspection that isn’t in the list above, for example a clean inspection that should
          count on your record. Tell us what you know; you’ll add your copy of the report next.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="missing-state" className={labelClass}>
              State that inspected
            </label>
            <select
              id="missing-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose…</option>
              {Object.entries(US_STATES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} – {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="missing-report" className={labelClass}>
              Report number
            </label>
            <input
              id="missing-report"
              value={reportNumber}
              maxLength={40}
              placeholder="From the inspection report"
              onChange={(e) => setReportNumber(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="missing-date" className={labelClass}>
              Inspection date
            </label>
            <input
              id="missing-date"
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="missing-level" className={labelClass}>
              Level (optional)
            </label>
            <select
              id="missing-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={inputClass}
            >
              <option value="">Not sure</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {levelLabel(n)}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="missing-location" className={labelClass}>
              Where (optional)
            </label>
            <input
              id="missing-location"
              value={location}
              maxLength={100}
              placeholder="e.g. I-40 weigh station, Tulsa"
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor="missing-basis" className={labelClass}>
            Tell us about it
          </label>
          <textarea
            id="missing-basis"
            rows={3}
            value={basis}
            maxLength={5000}
            placeholder="e.g. A clean level 1 inspection of our truck in Tulsa; the officer gave our driver the report."
            onChange={(e) => setBasis(e.target.value)}
            className={inputClass}
          />
        </div>
        {create.isError && (
          <p className="text-red-700" role="alert">
            Could not open the case: {create.error.message}
          </p>
        )}
        <button type="submit" disabled={!ready || create.isPending} className={primaryButton}>
          {create.isPending ? 'Opening…' : 'Open draft case and add evidence'}
        </button>
      </form>
    </details>
  )
}
