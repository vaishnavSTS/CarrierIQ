import { StatusBadge } from '../../components/StatusBadge'
import type { CarrierProfile } from '../../types/carrierProfile'
import { formatDate, formatPhone, humanize } from '../../utils/format'
import { Empty, Field, Section } from './Section'

// CARSHIP codes from the MCMIS Company Census data dictionary.
const ENTITY_TYPES: Record<string, string> = {
  C: 'Carrier',
  S: 'Shipper',
  B: 'Broker',
  R: 'Registrant',
  F: 'Freight forwarder',
  I: 'Intermodal equipment provider',
  T: 'Cargo tank',
}

function entityTypes(codes: string | null): string {
  if (!codes) return '—'
  return codes
    .split(';')
    .map((code) => ENTITY_TYPES[code.trim()] ?? code)
    .join(', ')
}

export function IdentitySection({ profile }: { profile: CarrierProfile }) {
  return (
    <Section id="identity" title="Identity">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Entity type">{entityTypes(profile.entity_type)}</Field>
        <Field label="Drivers">{profile.driver_count ?? '—'}</Field>
        <Field label="Registered (census add date)">
          {formatDate(profile.first_registered_date)}
        </Field>
        <Field label="Last MCS-150 update">{formatDate(profile.last_mcs150_date)}</Field>
        <Field label="Email">{profile.email ?? '—'}</Field>
        <Field label="Website">{profile.website ?? '—'}</Field>
        <Field label="Officers">
          {profile.officers.length ? profile.officers.join(', ') : '—'}
        </Field>
        <Field label="Phones">
          {profile.phones.length
            ? profile.phones.map((p) => (
                <div key={`${p.phone_type}${p.number}`}>
                  <span className="font-mono">{formatPhone(p.number)}</span>{' '}
                  <span className="text-xs text-slate-500">
                    {humanize(p.phone_type.toLowerCase())}
                  </span>
                </div>
              ))
            : '—'}
        </Field>
      </dl>

      <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-slate-500">Addresses</h3>
      {profile.addresses.length === 0 ? (
        <Empty>No address on file.</Empty>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {profile.addresses.map((a) => (
            <div
              key={a.address_type}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase text-slate-500">
                  {humanize(a.address_type.toLowerCase())}
                </span>
                {a.undeliverable && <StatusBadge label="undeliverable" tone="warn" />}
              </div>
              <div className="mt-1">{a.street ?? '—'}</div>
              <div>{[a.city, a.state, a.zip].filter(Boolean).join(' ')}</div>
              <div className="mt-1 text-xs text-slate-500">
                First seen {formatDate(a.first_seen)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
