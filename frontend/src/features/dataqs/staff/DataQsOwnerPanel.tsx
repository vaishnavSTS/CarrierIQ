import { useAssignDataQsOwner, useDataQsStaff } from '../../../hooks/useDataQs'
import type { DataQsCase } from '../../../types/dataqs'
import { inputClass, labelClass } from '../intake/intakeState'

/** STS: who owns the case (the case specialist). Changes save at once. */
export function DataQsOwnerPanel({ dataqsCase }: { dataqsCase: DataQsCase }) {
  const staff = useDataQsStaff()
  const assign = useAssignDataQsOwner(dataqsCase.id)
  return (
    <div className="max-w-sm text-sm">
      <label htmlFor="case-owner" className={labelClass}>
        Case specialist
      </label>
      <select
        id="case-owner"
        value={dataqsCase.owner_id ?? ''}
        disabled={assign.isPending || !staff.data}
        onChange={(e) =>
          assign.mutate({
            version: dataqsCase.row_version,
            ownerId: e.target.value ? Number(e.target.value) : null,
          })
        }
        className={inputClass}
      >
        <option value="">Unassigned</option>
        {staff.data?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </select>
      {assign.isError && (
        <p className="mt-1 text-red-700" role="alert">
          Could not assign: {assign.error.message}
        </p>
      )}
    </div>
  )
}
