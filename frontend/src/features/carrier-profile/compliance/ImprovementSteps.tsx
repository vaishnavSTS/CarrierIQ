import { useCarrierEquipment } from '../../../hooks/useCarrierEquipment'
import { useCarrierSafety } from '../../../hooks/useCarrierSafety'
import type { CarrierProfile } from '../../../types/carrierProfile'
import { heaviestTruck } from '../packet/recordDetail'
import { solutions } from '../packet/solutions'
import { SolutionsBox } from '../packet/SolutionsBox'

const STEPS = 6

/** The top of "What to fix": the same steps as page 2 of the Safety Score Report. */
export function ImprovementSteps({ profile }: { profile: CarrierProfile }) {
  const safety = useCarrierSafety(profile.usdot_number)
  const equipment = useCarrierEquipment(profile.usdot_number)

  if (safety.isPending || equipment.isPending) {
    return <p className="text-sm text-slate-500">Working out the steps from FMCSA’s records…</p>
  }
  const data = safety.data ?? null
  const steps = solutions({
    iss: data?.estimated_iss ?? null,
    sms: data?.sms ?? null,
    drivers: data?.drivers ?? null,
    recent: profile.safety.recent,
    inspections: data?.sms_inspections ?? null,
    truck: heaviestTruck(data?.sms_inspections ?? []),
    fleet: equipment.data?.fleet ?? null,
    client: true,
    max: STEPS,
  })
  if (steps.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No steps to show from FMCSA’s records yet.
      </p>
    )
  }
  return <SolutionsBox steps={steps} aside="Suggestions from your FMCSA records" />
}
