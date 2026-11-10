import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { reportCarrierView } from '../api/accountLog'
import { ApiError } from '../api/client'
import { AuthoritySection, InsuranceSection } from '../features/carrier-profile/AuthoritySection'
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
import { BrokerVerdict } from '../features/compare/BrokerVerdict'
import { useClientSearchEnabled, useMe } from '../hooks/useAuth'
import { useCarrierProfile } from '../hooks/useCarrierProfile'
import { useIsOwnCarrier } from '../hooks/useIsOwnCarrier'
import { usePortalMode, useSearchPath } from '../hooks/usePortalMode'

const TABS = [
  ['identity', 'Overview'],
  ['authority', 'Authority'],
  ['insurance', 'Insurance'],
  ['safety', 'Inspections'],
  ['equipment', 'Equipment'],
  ['network', 'Linked carriers'],
  ['chameleon', 'Chameleon check'],
  ['safety-score-report', 'Safety Score Report'],
  ['compliance', 'Compliance'],
  ['invoices', 'Invoices'],
  ['intelligence', 'Intelligence'],
  ['timeline', 'History'],
] as const

type TabId = (typeof TABS)[number][0]

/** Tabs clients see for any carrier (docs/client-internal-portal-plan.md, 4a). */
const CLIENT_TABS: readonly TabId[] = [
  'identity',
  'authority',
  'insurance',
  'safety',
  'equipment',
  'network',
  'safety-score-report',
  'compliance',
  'invoices',
  'timeline',
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
  const { data: me } = useMe()
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
  // ?tab=packet: the tab's old name, from links shared before it was renamed.
  const asked = params.get('tab')
  const requested = asked === 'packet' ? 'safety-score-report' : asked
  // Compliance and Invoices: clients for their own carriers only. STS staff use the Service
  // requests and Invoices pages instead.
  const ownOnly = (id: TabId) => id !== 'compliance' && id !== 'invoices'
  const visible =
    allowed && portal === 'client' && !ownCarrier
      ? allowed.filter(ownOnly)
      : portal === 'broker'
        ? (allowed?.filter(ownOnly) ?? null)
        : (allowed ??
          TABS.map(([id]) => id).filter((id) => id !== 'invoices' && id !== 'compliance'))
  const tab: TabId = isTab(requested, visible) ? requested : DEFAULT_TAB
  const tabs = visible
    ? TABS.filter(([id]) => visible.includes(id)).map(
        ([id, label]) => [id, (ownCarrier && CLIENT_LABELS[id]) || label] as const,
      )
    : TABS

  // Each tab opened goes into the person's account history (STS admins' Account logs).
  const loaded = profile?.usdot_number
  useEffect(() => {
    if (loaded) reportCarrierView(loaded, tab)
  }, [loaded, tab])

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
            : `No carrier with USDOT ${usdotNumber} was found in Carrier Safety Scan or FMCSA data.`
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
      {portal === 'broker' && me?.role !== 'INSURANCE_AGENT' && (
        <BrokerVerdict usdotNumber={profile.usdot_number} />
      )}

      <div
        role="tablist"
        aria-label="Profile sections"
        className="sticky top-[calc(var(--sticky-top)+0.5rem)] z-20 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-surface/90 p-1.5 shadow-sm backdrop-blur [scrollbar-width:none] print:hidden"
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
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors ${
              tab === id
                ? 'bg-[#101853] font-semibold text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'safety-score-report' && <PacketSection profile={profile} />}
        {tab === 'compliance' && <ComplianceSection profile={profile} />}
        {tab === 'invoices' && <CarrierInvoicesSection usdotNumber={profile.usdot_number} />}
        {tab === 'identity' && <IdentitySection profile={profile} />}
        {tab === 'authority' && (
          <AuthoritySection
            usdotNumber={profile.usdot_number}
            classification={profile.operation_classification}
          />
        )}
        {tab === 'insurance' && (
          <InsuranceSection
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
