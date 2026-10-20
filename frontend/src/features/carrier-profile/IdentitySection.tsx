import { SOURCES } from '../../utils/sources'
import { StatusBadge } from '../../components/StatusBadge'
import type { CarrierProfile } from '../../types/carrierProfile'
import { classificationLabel, classifications } from '../../utils/classification'
import { formatDate, formatLocalDate, formatPhone } from '../../utils/format'
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

const PHONE_TYPES: Record<string, string> = { OFFICE: 'Office', CELL: 'Mobile', FAX: 'Fax' }
const ADDRESS_TYPES: Record<string, string> = {
  PHYSICAL: 'Physical address',
  MAILING: 'Mailing address',
}

/** FMCSA requires every carrier to update its MCS-150 at least every 24 months. */
const MCS150_MONTHS = 24

function entityTypes(codes: string | null): string {
  if (!codes) return '—'
  return codes
    .split(';')
    .map((code) => ENTITY_TYPES[code.trim()] ?? `Other (code ${code.trim()})`)
    .join(', ')
}

/** Whole months from an ISO date to today. */
function monthsSince(value: string): number {
  const then = new Date(`${value}T00:00:00Z`)
  const now = new Date()
  const months =
    (now.getUTCFullYear() - then.getUTCFullYear()) * 12 + now.getUTCMonth() - then.getUTCMonth()
  return now.getUTCDate() < then.getUTCDate() ? months - 1 : months
}

/** 57 -> "4 yr 9 mo ago"; 0 -> "less than a month ago" */
function ageText(months: number): string {
  if (months < 1) return 'less than a month ago'
  const years = Math.floor(months / 12)
  const rest = months % 12
  return `${[years && `${years} yr`, rest && `${rest} mo`].filter(Boolean).join(' ')} ago`
}

export function IdentitySection({ profile }: { profile: CarrierProfile }) {
  const mcs150Months = profile.last_mcs150_date ? monthsSince(profile.last_mcs150_date) : null
  const powerUnits = profile.equipment.power_units
  return (
    <Section
      id="identity"
      title="Identity"
      source={`${SOURCES.census} · as of ${formatLocalDate(profile.last_refreshed_at)}`}
    >
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Entity type">{entityTypes(profile.entity_type)}</Field>
        <Field label="Operation classification">
          {classifications(profile.operation_classification).map(classificationLabel).join(', ') ||
            '—'}
        </Field>
        <Field label="Fleet (as reported on MCS-150)">
          {powerUnits ?? '—'} power unit{powerUnits === 1 ? '' : 's'} ·{' '}
          {profile.driver_count ?? '—'} driver{profile.driver_count === 1 ? '' : 's'}
          {profile.last_mcs150_date && (
            <span className="block text-xs text-slate-500">
              MCS-150 of {formatDate(profile.last_mcs150_date)}
            </span>
          )}
        </Field>
        <Field label="USDOT number added">
          {formatDate(profile.first_registered_date)}
          {profile.first_registered_date && (
            <span className="block text-xs text-slate-500">
              {ageText(monthsSince(profile.first_registered_date))}
            </span>
          )}
        </Field>
        <Field label="Last MCS-150 update">
          {formatDate(profile.last_mcs150_date)}
          {mcs150Months !== null && (
            <span className="block text-xs text-slate-500">
              {ageText(mcs150Months)} ·{' '}
              {mcs150Months > MCS150_MONTHS
                ? `past FMCSA’s ${MCS150_MONTHS}-month update`
                : `within FMCSA’s ${MCS150_MONTHS}-month update`}
            </span>
          )}
        </Field>
        <Field label="Email">{profile.email ?? '—'}</Field>
        <Field label="Website">{profile.website ?? '—'}</Field>
        {profile.domains.length > 0 && (
          <Field label="Email and web domains">{profile.domains.join(', ')}</Field>
        )}
        <Field label="Officers">
          {profile.officers.length ? profile.officers.join(', ') : '—'}
        </Field>
        <Field label="Phones">
          {profile.phones.length
            ? profile.phones.map((p) => (
                <div
                  key={`${p.phone_type}${p.number}`}
                  title={`First seen by CarrierSafetyScan ${formatDate(p.first_seen)}`}
                >
                  <span className="font-mono">{formatPhone(p.number)}</span>{' '}
                  <span className="text-xs text-slate-500">
                    {PHONE_TYPES[p.phone_type] ?? p.phone_type.toLowerCase()}
                  </span>
                </div>
              ))
            : '—'}
        </Field>
      </dl>

      <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-slate-500">Addresses</h3>
      {profile.addresses.length === 0 ? (
        <Empty>No address on file with FMCSA.</Empty>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {profile.addresses.map((a) => (
            <div
              key={a.address_type}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase text-slate-500">
                  {ADDRESS_TYPES[a.address_type] ?? a.address_type.toLowerCase()}
                </span>
                {a.undeliverable && (
                  <StatusBadge label="marked undeliverable by FMCSA" tone="warn" />
                )}
              </div>
              <div className="mt-1">{a.street ?? '—'}</div>
              <div>
                {[a.city, a.state, a.zip].filter(Boolean).join(' ')}
                {a.country && !['US', 'USA'].includes(a.country.toUpperCase()) && `, ${a.country}`}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                First seen by CarrierSafetyScan {formatDate(a.first_seen)} · last seen{' '}
                {formatDate(a.last_seen)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
