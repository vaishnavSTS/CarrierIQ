import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import type { CarrierProfile } from '../../types/carrierProfile'
import { needsForHireAuthority } from '../../utils/classification'
import { formatDateTime, sourceLabel } from '../../utils/format'
import { reviewLabel } from '../../utils/review'
import { INSURANCE_LABEL, insuranceTone, severityTone, statusTone } from '../../utils/status'

function HeaderStatus({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">{label}:</span>
      {children}
    </div>
  )
}

export function ProfileHeader({ profile }: { profile: CarrierProfile }) {
  const dockets = profile.authority.dockets
  return (
    <header className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{profile.legal_name}</h1>
          {profile.dba_name && <p className="text-sm text-slate-600">DBA {profile.dba_name}</p>}
          <p className="mt-1 font-mono text-sm text-slate-700">
            USDOT {profile.usdot_number}
            {dockets.map((d) => (
              <span key={`${d.prefix}${d.number}`} className="ml-3">
                {d.prefix} {d.number}
              </span>
            ))}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          Data refreshed {formatDateTime(profile.last_refreshed_at)}
          {profile.stale && (
            <div className="mt-1 text-amber-700">
              <StatusBadge label="stale" tone="warn" /> FMCSA could not be reached; showing stored
              data
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <HeaderStatus label="Authority">
          {profile.authority.status ? (
            <StatusBadge
              label={profile.authority.status}
              tone={statusTone(profile.authority.status)}
            />
          ) : (
            <span className="text-slate-500">No dockets</span>
          )}
        </HeaderStatus>
        <HeaderStatus label="Registration">
          {profile.registration_status ? (
            <StatusBadge
              label={profile.registration_status}
              tone={statusTone(profile.registration_status)}
            />
          ) : (
            <span className="text-slate-500">Unknown</span>
          )}
        </HeaderStatus>
        <HeaderStatus label="Insurance">
          {profile.insurance.status ? (
            <>
              <StatusBadge
                label={INSURANCE_LABEL[profile.insurance.status] ?? profile.insurance.status}
                tone={insuranceTone(profile.insurance.status)}
              />
              <span className="text-xs text-slate-500">
                {sourceLabel(profile.insurance.source_system, profile.insurance.as_of)}
              </span>
            </>
          ) : (
            <span className="text-slate-500">
              {needsForHireAuthority(profile.operation_classification) === false
                ? 'Not filed with FMCSA (not a for-hire carrier)'
                : 'No active operating authority'}
            </span>
          )}
        </HeaderStatus>
        <HeaderStatus label="Review status">
          {profile.review_status === 'OPEN_SIGNALS' ? (
            <Link
              to="?tab=intelligence"
              replace
              className="flex items-center gap-2 hover:underline"
            >
              <StatusBadge
                label={reviewLabel(profile.review_status, profile.open_signal_count) ?? ''}
                tone={severityTone(profile.highest_open_severity ?? 'LOW')}
              />
              {profile.highest_open_severity && (
                <span className="text-xs text-slate-500">
                  highest: {profile.highest_open_severity.toLowerCase()}
                </span>
              )}
            </Link>
          ) : (
            <span className="text-slate-500">
              {reviewLabel(profile.review_status, profile.open_signal_count) ?? 'Not reviewed yet'}
            </span>
          )}
        </HeaderStatus>
      </div>
    </header>
  )
}
