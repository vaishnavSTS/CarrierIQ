import type { ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthoritySection } from '../features/carrier-profile/AuthoritySection'
import { ChameleonSection } from '../features/carrier-profile/chameleon/ChameleonSection'
import { EquipmentSection } from '../features/carrier-profile/EquipmentSection'
import { IdentitySection } from '../features/carrier-profile/IdentitySection'
import { IntelligenceSection } from '../features/carrier-profile/intelligence/IntelligenceSection'
import { NetworkSection } from '../features/carrier-profile/network/NetworkSection'
import { ComplianceSection } from '../features/carrier-profile/compliance/ComplianceSection'
import { PacketSection } from '../features/carrier-profile/packet/PacketSection'
import { ProfileHeader } from '../features/carrier-profile/ProfileHeader'
import { SafetySection } from '../features/carrier-profile/SafetySection'
import { TimelineSection } from '../features/carrier-profile/TimelineSection'
import { CarrierInvoicesSection } from '../features/invoices/CarrierInvoicesSection'
import { useClientSearchEnabled } from '../hooks/useAuth'
import { useCarrierProfile } from '../hooks/useCarrierProfile'
import { useIsOwnCarrier } from '../hooks/useIsOwnCarrier'
import { usePortalMode, useSearchPath } from '../hooks/usePortalMode'

const TABS = [
  ['identity', 'Identity'],
  ['authority', 'Authority & Insurance'],
  ['safety', 'Safety'],
  ['equipment', 'Equipment'],
  ['network', 'Network'],
  ['chameleon', 'Chameleon check'],
  ['packet', 'Packet'],
  ['compliance', 'Compliance'],
  ['invoices', 'Invoices'],
  ['intelligence', 'Intelligence'],
  ['timeline', 'Timeline'],
] as const

type TabId = (typeof TABS)[number][0]

/** Tabs clients see for any carrier (docs/client-internal-portal-plan.md, 4a). */
const CLIENT_TABS: readonly TabId[] = [
  'identity',
  'authority',
  'safety',
  'equipment',
  'network',
  'packet',
  'compliance',
  'invoices',
]
/** Brokers also get the Chameleon check (they vet carriers before giving them loads). */
const BROKER_TABS: readonly TabId[] = [...CLIENT_TABS, 'chameleon']
const CLIENT_LABELS: Partial<Record<TabId, string>> = {
  network: 'How brokers see you',
}

const DEFAULT_TAB: TabId = 'identity'

function isTab(value: string | null, allowed: readonly TabId[] | null): value is TabId {
  return TABS.some(([id]) => id === value && (!allowed || allowed.includes(id)))
}

export function CarrierProfilePage() {
  const { usdot = '' } = useParams()
  const usdotNumber = Number(usdot)
  const portal = usePortalMode()
  // null: every tab (STS staff)
  const allowed = portal === 'broker' ? BROKER_TABS : portal === 'client' ? CLIENT_TABS : null
  const ownCarrier = useIsOwnCarrier(usdotNumber)
  // Clients see only their own carriers unless client search is on (team testing).
  const clientSearch = useClientSearchEnabled()
  const ownCarriersOnly = portal === 'client' && !clientSearch
  const { data: profile, error, isPending } = useCarrierProfile(usdotNumber)
  const navigate = useNavigate()
  // The open tab lives in the URL (?tab=safety) so a refresh or shared link keeps it.
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  // Compliance: STS staff for any carrier; clients for their own carriers only. Invoices: clients
  // for their own carriers (STS staff use the Invoices page instead).
  const ownOnly = (id: TabId) => id !== 'compliance' && id !== 'invoices'
  const visible =
    allowed && portal === 'client' && !ownCarrier
      ? allowed.filter(ownOnly)
      : portal === 'broker'
        ? (allowed?.filter(ownOnly) ?? null)
        : (allowed ?? TABS.map(([id]) => id).filter((id) => id !== 'invoices'))
  const tab: TabId = isTab(requested, visible) ? requested : DEFAULT_TAB
  const tabs = visible
    ? TABS.filter(([id]) => visible.includes(id)).map(
        ([id, label]) => [id, (ownCarrier && CLIENT_LABELS[id]) || label] as const,
      )
    : TABS

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
          ? ownCarriersOnly
            ? `USDOT ${usdotNumber} isn’t one of your carriers. Contact STS if it should be.`
            : `No carrier with USDOT ${usdotNumber} was found in CarrierSafetyScan or FMCSA data.`
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
        {tabs.map(([id, label]) => (
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
        {tab === 'compliance' && <ComplianceSection profile={profile} />}
        {tab === 'invoices' && <CarrierInvoicesSection usdotNumber={profile.usdot_number} />}
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
        {tab === 'intelligence' && <IntelligenceSection usdotNumber={profile.usdot_number} />}
        {tab === 'timeline' && (
          <TimelineSection events={profile.timeline} changes={profile.recent_changes} />
        )}
      </div>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  const client = usePortalMode() === 'client'
  const searchPath = useSearchPath()
  return (
    <div className="space-y-3">
      <div
        className="rounded-md border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-700"
        role="alert"
      >
        {children}
      </div>
      <Link
        to={client ? '/portal' : searchPath}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        {client ? '← My carriers' : '← Search for a carrier'}
      </Link>
    </div>
  )
}
