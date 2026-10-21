import { useState, type FormEvent } from 'react'

import { useBuildDataQsPackage } from '../../../hooks/useDataQs'
import type { DataQsCase } from '../../../types/dataqs'
import { formatDate } from '../../../utils/format'
import { inputClass, labelClass } from '../intake/intakeState'
import { primaryButton } from '../ui'

/** A first draft from the carrier's own words, for the specialist to edit. Every fact in it must
 * still be confirmed against the evidence before it is sent. */
function draftNarrative(c: DataQsCase): string {
  const where = [c.event.location, c.event.state].filter(Boolean).join(', ')
  const lines = [
    `On ${formatDate(c.event.inspection_date)}, ${c.carrier_name ?? 'the carrier'} (USDOT ${c.usdot_number}) ` +
      `was inspected${where ? ` in ${where}` : ''} (report ${c.event.inspection_id}).`,
    '',
    'The carrier requests the following corrections:',
  ]
  for (const issue of c.issues) {
    const what = issue.violation_code
      ? `${issue.violation_description ?? 'Violation'} (${issue.violation_code})`
      : 'The whole inspection'
    lines.push(
      `- ${what}: ${issue.requested_value ?? 'review and correct'}. ${issue.factual_basis ?? ''}`,
    )
  }
  return lines.join('\n').trim()
}

/** STS: freeze the narrative, the chosen evidence and references as a package for approval. */
export function DataQsPackageBuilder({ dataqsCase }: { dataqsCase: DataQsCase }) {
  const current = dataqsCase.packages.find((p) => !p.invalidated_at)
  const [narrative, setNarrative] = useState(() => current?.narrative ?? draftNarrative(dataqsCase))
  const [evidenceIds, setEvidenceIds] = useState<number[]>(
    () =>
      current?.manifest.evidence.map((e) => e.evidence_id) ?? dataqsCase.evidence.map((e) => e.id),
  )
  const [references, setReferences] = useState(() => current?.manifest.references.join('\n') ?? '')
  const build = useBuildDataQsPackage(dataqsCase.id)

  const toggle = (id: number) =>
    setEvidenceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    build.mutate({
      expected_version: dataqsCase.row_version,
      narrative: narrative.trim(),
      evidence_ids: evidenceIds,
      references: references
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      <div>
        <label htmlFor="narrative" className={labelClass}>
          Narrative (at least 50 characters). Confirm every fact against the evidence.
        </label>
        <textarea
          id="narrative"
          rows={8}
          value={narrative}
          maxLength={20000}
          onChange={(e) => setNarrative(e.target.value)}
          className={inputClass}
        />
      </div>
      <fieldset>
        <legend className={labelClass}>Evidence to include</legend>
        {dataqsCase.evidence.length === 0 && (
          <p className="mt-1 text-slate-500">No files on the case.</p>
        )}
        {dataqsCase.evidence.map((e) => (
          <label key={e.id} className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={evidenceIds.includes(e.id)}
              onChange={() => toggle(e.id)}
            />
            {e.file_name}
            {e.scan_status !== 'CLEAN' && (
              <span className="text-xs text-slate-500">(scan {e.scan_status.toLowerCase()})</span>
            )}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="references" className={labelClass}>
          References, one per line (e.g. 49 CFR 396.3(a)(1))
        </label>
        <textarea
          id="references"
          rows={3}
          value={references}
          onChange={(e) => setReferences(e.target.value)}
          className={inputClass}
        />
      </div>
      {current && (
        <p className="text-xs text-slate-500">
          Changing anything makes a new package version and cancels any approval of v
          {current.package_version}; the carrier must approve again. Sending it unchanged keeps v
          {current.package_version}.
        </p>
      )}
      {build.isError && (
        <p className="text-red-700" role="alert">
          Could not build: {build.error.message}
        </p>
      )}
      <button
        type="submit"
        className={primaryButton}
        disabled={narrative.trim().length < 50 || build.isPending}
      >
        {build.isPending ? 'Building…' : 'Build package and send to carrier'}
      </button>
    </form>
  )
}
