import { Lock } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthoritySection } from '../features/carrier-profile/AuthoritySection'
import { IdentitySection } from '../features/carrier-profile/IdentitySection'
import { ProfileHeader } from '../features/carrier-profile/ProfileHeader'
import { SignUpDialog } from '../features/try-now/SignUpDialog'
import { useCarrierProfile } from '../hooks/useCarrierProfile'
import { PortalModeContext, TryModeContext } from '../hooks/usePortalMode'

const FREE_TABS = [
  ['identity', 'Identity'],
  ['authority', 'Authority & Insurance'],
] as const
type FreeTab = (typeof FREE_TABS)[number][0]

const LOCKED_TABS = ['Safety', 'Equipment', 'Network', 'Chameleon check', 'Safety Score Report']

/** The carrier a Try Now visitor chose: two tabs to read, the rest ask them to sign up. */
export function TryCarrierPage() {
  return (
    <TryModeContext.Provider value={true}>
      {/* The client view: no staff controls. */}
      <PortalModeContext.Provider value="client">
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
  const [tab, setTab] = useState<FreeTab>('identity')
  const [locked, setLocked] = useState<string | null>(null)
  const closeDialog = useCallback(() => setLocked(null), [])

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

  const tabClass = (active: boolean) =>
    `-mb-px border-b-2 px-3 py-2 text-sm ${
      active
        ? 'border-accent-strong font-medium text-slate-900'
        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
    }`

  return (
    <div className="space-y-4">
      <ProfileHeader profile={profile} />

      <div
        role="tablist"
        aria-label="Profile sections"
        className="flex flex-wrap gap-1 border-b border-slate-200"
      >
        {FREE_TABS.map(([id, label]) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={tabClass(tab === id)}
          >
            {label}
          </button>
        ))}
        {LOCKED_TABS.map((label) => (
          <button
            key={label}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setLocked(label)}
            className={`${tabClass(false)} inline-flex items-center gap-1.5`}
          >
            <Lock className="size-3.5" aria-hidden />
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
      </div>

      {locked && (
        <SignUpDialog
          title="Sign up for a 30-day free trial"
          message={`${locked} is part of a full account. Your free search includes Identity and Authority & Insurance.`}
          onClose={closeDialog}
        />
      )}
    </div>
  )
}
