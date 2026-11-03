import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthoritySection } from '../features/carrier-profile/AuthoritySection'
import { ChameleonSection } from '../features/carrier-profile/chameleon/ChameleonSection'
import { EquipmentSection } from '../features/carrier-profile/EquipmentSection'
import { IdentitySection } from '../features/carrier-profile/IdentitySection'
import { NetworkSection } from '../features/carrier-profile/network/NetworkSection'
import { PacketSection } from '../features/carrier-profile/packet/PacketSection'
import { ProfileHeader } from '../features/carrier-profile/ProfileHeader'
import { SafetySection } from '../features/carrier-profile/SafetySection'
import { TimelineSection } from '../features/carrier-profile/TimelineSection'
import { useCarrierProfile } from '../hooks/useCarrierProfile'
import { PortalModeContext, TryModeContext } from '../hooks/usePortalMode'

const TABS = [
  ['identity', 'Overview'],
  ['authority', 'Authority & Insurance'],
  ['safety', 'Inspections'],
  ['equipment', 'Equipment'],
  ['network', 'Linked carriers'],
  ['chameleon', 'Chameleon check'],
  ['safety-score-report', 'Safety Score Report'],
  ['timeline', 'History'],
] as const
type Tab = (typeof TABS)[number][0]

/** The carrier a Try Now visitor chose: every tab, for this one carrier. */
export function TryCarrierPage() {
  return (
    <TryModeContext.Provider value={true}>
      {/* What a broker sees about any carrier: no staff controls, and "this carrier" wording. */}
      <PortalModeContext.Provider value="broker">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <TryCarrier />
        </div>
      </PortalModeContext.Provider>
    </TryModeContext.Provider>
  )
}

function TryCarrier() {
  const { usdot = '' } = useParams()
  const usdotNumber = Number(usdot)
  const { data: profile, error, isPending } = useCarrierProfile(usdotNumber)
  const [tab, setTab] = useState<Tab>('identity')

  if (error || !Number.isInteger(usdotNumber) || usdotNumber <= 0) {
    return (
      <div className="space-y-3">
        <p
          role="alert"
          className="rounded-md border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-700"
        >
          {error instanceof ApiError && error.status !== 403
            ? `Could not load USDOT ${usdot}: ${error.message}`
            : 'Your free search has been used. Sign up for a 30-day free trial to see more.'}
        </p>
        <Link to="/register" className="text-sm font-medium text-accent-strong hover:underline">
          Sign up for a 30-day free trial →
        </Link>
      </div>
    )
  }
  if (isPending) {
    return (
      <p className="text-sm text-slate-600" role="status">
        Loading USDOT {usdotNumber}…
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-700">
        This is your one free search: every tab of this carrier, for the next 30 minutes.{' '}
        <Link to="/register" className="font-medium text-accent-strong hover:underline">
          Sign up for a 30-day free trial
        </Link>{' '}
        to look up any carrier.
      </p>
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
            onClick={() => setTab(id)}
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
        {tab === 'identity' && <IdentitySection profile={profile} />}
        {tab === 'authority' && (
          <AuthoritySection
            usdotNumber={profile.usdot_number}
            classification={profile.operation_classification}
          />
        )}
        {tab === 'safety' && (
          <SafetySection
            usdotNumber={profile.usdot_number}
            safety={profile.safety}
            homeState={profile.addresses.find((a) => a.address_type === 'PHYSICAL')?.state ?? null}
          />
        )}
        {tab === 'equipment' && <EquipmentSection usdotNumber={profile.usdot_number} />}
        {tab === 'network' && <NetworkSection profile={profile} />}
        {tab === 'chameleon' && <ChameleonSection usdotNumber={profile.usdot_number} />}
        {tab === 'safety-score-report' && <PacketSection profile={profile} />}
        {tab === 'timeline' && (
          <TimelineSection events={profile.timeline} changes={profile.recent_changes} />
        )}
      </div>
    </div>
  )
}
