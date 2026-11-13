import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import type { CarrierProfile } from '../../types/carrierProfile'
import { needsForHireAuthority } from '../../utils/classification'
import { censusLabel, formatDateTime, formatDocket, sourceLabel } from '../../utils/format'
import { hazmatLabel, operatingArea } from '../../utils/operation'
import { saferUrl, smsUrl } from '../../utils/sources'
import { useIsClientPortal } from '../../hooks/usePortalMode'
import { reviewLabel } from '../../utils/review'
import { HeaderCard } from './HeaderCard'
import { IssHeaderCard } from './IssHeaderCard'
import { LinkedHeadsUp } from './network/LinkedHeadsUp'
import { RefreshButton } from './RefreshButton'
import { CompareButton } from '../compare/CompareButton'
import { INSURANCE_LABEL, insuranceTone, severityTone, statusTone } from '../../utils/status'

export function ProfileHeader({ profile }: { profile: CarrierProfile }) {
  const dockets = profile.authority.dockets
  const area = operatingArea(profile.operation)
  const hazmat = hazmatLabel(profile.operation)
  const client = useIsClientPortal()
  return (
    <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm md:p-6">
      {/* A thin strip of the brand colours along the top. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-600 via-blue-600 to-amber-400"
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 md:text-3xl">
            {profile.legal_name}
          </h1>
          {profile.dba_name && <p className="text-sm text-slate-600">DBA {profile.dba_name}</p>}
          <p className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-700">
            <a
              href={saferUrl(profile.usdot_number)}
              target="_blank"
              rel="noreferrer"
              title="Open the FMCSA SAFER Company Snapshot"
              className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent-strong hover:underline"
            >
              USDOT {profile.usdot_number}
            </a>
            {dockets.map((d) => (
              <span
                key={`${d.prefix}${d.number}`}
                className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700"
              >
                {formatDocket(d.prefix, d.number)}
              </span>
            ))}
            {/* From the MCS-150 (census): where it operates, and hazmat in orange. */}
            {area && (
              <span
                title="Operating area on the carrier's MCS-150 (FMCSA Company Census)"
                className="rounded-full bg-sky-50 px-3 py-1 font-sans font-semibold text-sky-800 ring-1 ring-inset ring-sky-600/20"
              >
                {area}
              </span>
            )}
            {hazmat && (
              <span
                title="Hazardous materials on the carrier's MCS-150 (FMCSA Company Census)"
                className={`rounded-full px-3 py-1 font-sans font-semibold ring-1 ring-inset ${
                  profile.operation?.hazmat
                    ? 'bg-orange-50 text-orange-800 ring-orange-600/30'
                    : 'bg-slate-100 text-slate-600 ring-slate-500/20'
                }`}
              >
                {hazmat}
              </span>
            )}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Official records:{' '}
            <a
              href={saferUrl(profile.usdot_number)}
              target="_blank"
              rel="noreferrer"
              className="text-accent-strong hover:underline"
            >
              FMCSA SAFER snapshot
            </a>{' '}
            ·{' '}
            <a
              href={smsUrl(profile.usdot_number)}
              target="_blank"
              rel="noreferrer"
              className="text-accent-strong hover:underline"
            >
              FMCSA SMS (CSA)
            </a>
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div className="mb-2 flex justify-end empty:hidden">
            <CompareButton usdotNumber={profile.usdot_number} />
          </div>
          FMCSA data refreshed {formatDateTime(profile.last_refreshed_at)}
          {!client && <RefreshButton usdotNumber={profile.usdot_number} />}
          {profile.stale && (
            <div className="mt-1 text-amber-700">
              <StatusBadge label="stale" tone="warn" /> FMCSA could not be reached; showing stored
              data
            </div>
          )}
        </div>
      </div>

      {/* The status cards in one row on a wide screen (staff and brokers also get Review status). */}
      <div
        className={`mt-5 grid gap-3 sm:grid-cols-2 ${client ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}
      >
        <IssHeaderCard usdotNumber={profile.usdot_number} />
        <HeaderCard
          label="Authority"
          source={
            profile.authority.status
              ? sourceLabel(
                  profile.authority.source_system,
                  profile.authority.as_of,
                  profile.last_refreshed_at,
                )
              : undefined
          }
        >
          {profile.authority.status ? (
            <StatusBadge
              label={profile.authority.status}
              tone={statusTone(profile.authority.status)}
            />
          ) : (
            <span className="text-slate-500">No dockets</span>
          )}
        </HeaderCard>
        <HeaderCard label="Registration" source={censusLabel(profile.last_refreshed_at)}>
          {profile.registration_status ? (
            <StatusBadge
              label={profile.registration_status}
              tone={statusTone(profile.registration_status)}
            />
          ) : (
            <span className="text-slate-500">Unknown</span>
          )}
        </HeaderCard>
        <HeaderCard
          label="Insurance"
          source={
            profile.insurance.status
              ? sourceLabel(
                  profile.insurance.source_system,
                  profile.insurance.as_of,
                  profile.last_refreshed_at,
                )
              : undefined
          }
        >
          {profile.insurance.status ? (
            <StatusBadge
              label={INSURANCE_LABEL[profile.insurance.status] ?? profile.insurance.status}
              tone={insuranceTone(profile.insurance.status)}
            />
          ) : (
            <span className="text-slate-500">
              {needsForHireAuthority(profile.operation_classification) === false
                ? 'Not filed with FMCSA (not a for-hire carrier)'
                : 'No active operating authority'}
            </span>
          )}
        </HeaderCard>
        {!client && (
          <HeaderCard label="Review status" source="Carrier Safety Scan checks of FMCSA records">
            {profile.review_status === 'OPEN_SIGNALS' ? (
              <Link
                to="?tab=intelligence"
                replace
                className="flex flex-wrap items-center gap-x-2 gap-y-1 hover:underline"
              >
                <span className="whitespace-nowrap">
                  <StatusBadge
                    label={reviewLabel(profile.review_status, profile.open_signal_count) ?? ''}
                    tone={severityTone(profile.highest_open_severity ?? 'LOW')}
                  />
                </span>
                {profile.highest_open_severity && (
                  <span className="text-xs text-slate-500">
                    highest: {profile.highest_open_severity.toLowerCase()}
                  </span>
                )}
              </Link>
            ) : (
              <span className="text-slate-500">
                {reviewLabel(profile.review_status, profile.open_signal_count) ??
                  'Not reviewed yet'}
              </span>
            )}
          </HeaderCard>
        )}
        <LinkedHeadsUp usdotNumber={profile.usdot_number} />
      </div>
    </header>
  )
}
