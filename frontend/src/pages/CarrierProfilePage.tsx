import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthoritySection } from '../features/carrier-profile/AuthoritySection'
import { EquipmentSection } from '../features/carrier-profile/EquipmentSection'
import { IdentitySection } from '../features/carrier-profile/IdentitySection'
import { ProfileHeader } from '../features/carrier-profile/ProfileHeader'
import { SafetySection } from '../features/carrier-profile/SafetySection'
import { Empty, Section } from '../features/carrier-profile/Section'
import { TimelineSection } from '../features/carrier-profile/TimelineSection'
import { useCarrierProfile } from '../hooks/useCarrierProfile'

const SECTIONS = [
  ['identity', 'Identity'],
  ['authority', 'Authority & Insurance'],
  ['safety', 'Safety'],
  ['equipment', 'Equipment'],
  ['intelligence', 'Intelligence'],
  ['timeline', 'Timeline'],
] as const

export function CarrierProfilePage() {
  const { usdot = '' } = useParams()
  const usdotNumber = Number(usdot)
  const { data: profile, error, isPending } = useCarrierProfile(usdotNumber)
  const navigate = useNavigate()

  if (!Number.isInteger(usdotNumber) || usdotNumber <= 0) {
    return <Notice>“{usdot}” is not a USDOT number.</Notice>
  }
  if (error) {
    return (
      <Notice>
        {error instanceof ApiError && error.status === 404
          ? `No carrier with USDOT ${usdotNumber} was found in CarrierIQ or FMCSA data.`
          : `Could not load USDOT ${usdotNumber}: ${error.message}`}
      </Notice>
    )
  }
  if (isPending) {
    return (
      <p className="text-sm text-slate-600" role="status">
        Loading USDOT {usdotNumber}… the first time a carrier is opened its census record and
        inspections are fetched from FMCSA, which can take a few seconds.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back
      </button>
      <ProfileHeader profile={profile} />

      <nav aria-label="Profile sections" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-slate-500 hover:text-slate-900">
            {label}
          </a>
        ))}
      </nav>

      <IdentitySection profile={profile} />
      <AuthoritySection profile={profile} />
      <SafetySection safety={profile.safety} />
      <EquipmentSection equipment={profile.equipment} />
      <Section id="intelligence" title="Intelligence">
        <Empty>
          Review signals (authority and insurance changes, shared VINs, identity changes) arrive
          with the intelligence engine. Every signal will link to the records behind it.
        </Empty>
      </Section>
      <TimelineSection changes={profile.recent_changes} />
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div
        className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
        role="alert"
      >
        {children}
      </div>
      <Link to="/search" className="text-sm text-slate-500 hover:text-slate-900">
        ← Search for a carrier
      </Link>
    </div>
  )
}
