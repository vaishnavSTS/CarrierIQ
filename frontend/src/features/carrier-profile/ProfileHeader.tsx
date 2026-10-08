import type { ReactNode } from 'react'

import { StatusBadge } from '../../components/StatusBadge'
import type { CarrierProfile } from '../../types/carrierProfile'
import { formatDateTime } from '../../utils/format'
import { statusTone } from '../../utils/status'

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
          <span className="text-slate-500">Not available yet</span>
        </HeaderStatus>
        <HeaderStatus label="Review status">
          <span className="text-slate-500">{profile.review_status ?? 'Not reviewed yet'}</span>
        </HeaderStatus>
      </div>
    </header>
  )
}
