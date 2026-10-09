import type { ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthoritySection } from '../features/carrier-profile/AuthoritySection'
import { EquipmentSection } from '../features/carrier-profile/EquipmentSection'
import { IdentitySection } from '../features/carrier-profile/IdentitySection'
import { IntelligenceSection } from '../features/carrier-profile/intelligence/IntelligenceSection'
import { NetworkSection } from '../features/carrier-profile/network/NetworkSection'
import { PacketSection } from '../features/carrier-profile/packet/PacketSection'
import { ProfileHeader } from '../features/carrier-profile/ProfileHeader'
import { SafetySection } from '../features/carrier-profile/SafetySection'
import { TimelineSection } from '../features/carrier-profile/TimelineSection'
import { useCarrierProfile } from '../hooks/useCarrierProfile'

const TABS = [
  ['identity', 'Identity'],
  ['authority', 'Authority & Insurance'],
  ['safety', 'Safety'],
  ['equipment', 'Equipment'],
  ['network', 'Network & Identity'],
  ['packet', 'Packet'],
  ['intelligence', 'Intelligence'],
  ['timeline', 'Timeline'],
] as const

type TabId = (typeof TABS)[number][0]

const DEFAULT_TAB: TabId = 'identity'

function isTab(value: string | null): value is TabId {
  return TABS.some(([id]) => id === value)
}

export function CarrierProfilePage() {
  const { usdot = '' } = useParams()
  const usdotNumber = Number(usdot)
  const { data: profile, error, isPending } = useCarrierProfile(usdotNumber)
  const navigate = useNavigate()
  // The open tab lives in the URL (?tab=safety) so a refresh or shared link keeps it.
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: TabId = isTab(requested) ? requested : DEFAULT_TAB

  function openTab(id: TabId) {
    // replace: switching tabs shouldn't fill the history, so Back still returns to the search.
    setParams(id === DEFAULT_TAB ? {} : { tab: id }, { replace: true })
  }

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

      <div
        role="tablist"
        aria-label="Profile sections"
        className="flex flex-wrap gap-1 border-b border-slate-200"
      >
        {TABS.map(([id, label]) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => openTab(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === id
                ? 'border-accent-strong font-medium text-slate-900'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'packet' && <PacketSection profile={profile} />}
        {tab === 'identity' && <IdentitySection profile={profile} />}
        {tab === 'authority' && (
          <AuthoritySection
            usdotNumber={profile.usdot_number}
            classification={profile.operation_classification}
          />
        )}
        {tab === 'safety' && (
          <SafetySection usdotNumber={profile.usdot_number} safety={profile.safety} />
        )}
        {tab === 'equipment' && <EquipmentSection usdotNumber={profile.usdot_number} />}
        {tab === 'network' && <NetworkSection profile={profile} />}
        {tab === 'intelligence' && <IntelligenceSection usdotNumber={profile.usdot_number} />}
        {tab === 'timeline' && (
          <TimelineSection events={profile.timeline} changes={profile.recent_changes} />
        )}
      </div>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div
        className="rounded-md border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-700"
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
