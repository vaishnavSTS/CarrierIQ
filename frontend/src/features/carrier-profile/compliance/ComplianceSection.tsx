import {
  BadgeCheck,
  Car,
  ClipboardCheck,
  ExternalLink,
  FileText,
  FlaskConical,
  FolderOpen,
  IdCard,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import {
  useCarrierRequests,
  useCreateComplianceRequest,
  useUcrStatus,
} from '../../../hooks/useCompliance'
import { usePortalMode } from '../../../hooks/usePortalMode'
import type { CarrierProfile } from '../../../types/carrierProfile'
import type { ComplianceRequest, ComplianceServiceId } from '../../../types/compliance'
import { formatLocalDate } from '../../../utils/format'
import type { Tone } from '../../../utils/status'
import { Section } from '../Section'
import { PAYMENT_LINKS } from './paymentLinks'
import { SERVICE_LINKS } from './serviceLinks'

/** Each row's button on the right: one width, so the buttons line up down the list. */
const mainButton =
  'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink sm:min-h-0 sm:w-60 sm:flex-none'
const active = 'hover:bg-cta-hover'

/** What the client is asking for, as the request dialog names it. */
const ASK_LABEL: Record<ComplianceServiceId, string> = {
  DOT_MC_AUTHORITY: 'Help with DOT / MC authority',
  UCR: 'UCR registration filing',
  CA_MCP: 'California Motor Carrier Permit (MCP)',
  DRUG_ALCOHOL: 'Drug & alcohol testing consortium enrollment',
  DRIVER_FILES: 'Driver qualification files',
  MVR: 'An MVR report',
  BACKGROUND_CHECK: 'A criminal background check',
  GOOD_STANDING: 'A certificate of good standing',
  CLEARINGHOUSE: 'Clearinghouse registration',
}

const MOTUS = 'https://motus.dot.gov/'
const UCR_GOV = 'https://www.ucr.gov/'
const CA_MCP =
  'https://www.dmv.ca.gov/portal/vehicle-industry-services/motor-carrier-services-mcs/motor-carrier-permits/active-motor-carriers/'

interface Row {
  service: ComplianceServiceId
  icon: LucideIcon
  title: string
  badge: { label: string; tone: Tone } | null
  description: ReactNode
  link?: { href: string; label: string }
  button: string
}

/**
 * Compliance: the carrier's DOT / MC authority and UCR registration (checked against FMCSA), the
 * California MCP for California-based carriers, and the other services STS offers. Clients ask
 * STS for help with one button (STS is emailed); staff see who asked.
 */
export function ComplianceSection({ profile }: { profile: CarrierProfile }) {
  const usdot = profile.usdot_number
  const staff = usePortalMode() === 'internal'
  const ucr = useUcrStatus(usdot)
  const requests = useCarrierRequests(usdot)
  const californian =
    profile.addresses.find((a) => a.address_type === 'PHYSICAL')?.state?.toUpperCase() === 'CA'

  const authority = profile.authority.status
  const registration = profile.registration_status
  const inactive = authority === 'INACTIVE' || registration === 'INACTIVE'
  const mc = profile.authority.dockets.map((d) => `${d.prefix}${d.number}`).join(', ')

  const rows: Row[] = [
    {
      service: 'DOT_MC_AUTHORITY',
      icon: inactive ? ShieldAlert : ShieldCheck,
      title: 'DOT / MC authority',
      badge: inactive
        ? { label: 'Inactive', tone: 'down' }
        : authority === 'ACTIVE' || registration === 'ACTIVE'
          ? { label: 'Active', tone: 'ok' }
          : authority
            ? { label: authority, tone: 'warn' }
            : null,
      description: inactive
        ? 'Your USDOT registration or MC operating authority is inactive. STS can help you reactivate it.'
        : `USDOT ${registration?.toLowerCase() ?? 'status unknown'}${
            mc
              ? ` · ${mc} authority ${authority?.toLowerCase() ?? 'status unknown'}`
              : ' · no MC operating authority on file'
          }.`,
      link: { href: MOTUS, label: 'FMCSA Motus' },
      button: inactive ? 'Get reactivation assistance' : 'Get authority assistance',
    },
    {
      service: 'UCR',
      icon: FileText,
      title: 'UCR registration',
      badge: ucrBadge(ucr.data, ucr.isPending),
      description: ucrText(ucr.data, ucr.isPending),
      link: { href: UCR_GOV, label: 'ucr.gov' },
      button: 'Get UCR filing assistance',
    },
    ...(californian
      ? [
          {
            service: 'CA_MCP' as const,
            icon: IdCard,
            title: 'California Motor Carrier Permit (MCP)',
            badge: null,
            description:
              'California-based carriers need an MCP from the CA DMV. Check yours on the DMV site, or let STS handle it.',
            link: { href: CA_MCP, label: 'CA DMV' },
            button: 'Get MCP assistance',
          },
        ]
      : []),
    {
      service: 'DRUG_ALCOHOL',
      icon: FlaskConical,
      title: 'Drug & alcohol testing',
      badge: null,
      description: 'Enroll in STS’s drug and alcohol testing consortium.',
      button: 'Enroll in our consortium',
    },
    {
      service: 'DRIVER_FILES',
      icon: FolderOpen,
      title: 'Driver Files',
      badge: null,
      description: 'STS keeps your drivers’ qualification files and paperwork in order.',
      button: 'Driver files',
    },
    {
      service: 'MVR',
      icon: Car,
      title: 'Need only an MVR report?',
      badge: null,
      description: 'Request a motor vehicle record (MVR) report for a driver.',
      button: 'Request an MVR',
    },
    {
      service: 'BACKGROUND_CHECK',
      icon: ClipboardCheck,
      title: 'Criminal background check?',
      badge: null,
      description: 'STS can run a criminal background check for you.',
      button: 'Background check',
    },
    {
      service: 'GOOD_STANDING',
      icon: BadgeCheck,
      title: 'Certificate of good standing',
      badge: null,
      description: 'Show that your corporation is in good standing with the state.',
      button: 'Certificate of good standing',
    },
  ]

  const open = (service: ComplianceServiceId) =>
    (requests.data?.requests ?? []).find((r) => r.service === service && r.status === 'OPEN')

  return (
    <Section
      id="compliance"
      title="Compliance"
      source="Authority: FMCSA · UCR: FMCSA SAFER UCR query"
    >
      <p className="mb-4 text-sm text-slate-600">
        {staff
          ? 'What the client sees, and any help they asked STS for. Requests are handled on the Service requests page.'
          : 'Need help with any of these? Choose a button and Sky Transport Solutions will contact you.'}
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <ComplianceRow
            key={row.service}
            row={row}
            usdotNumber={usdot}
            openRequest={open(row.service)}
            staff={staff}
          />
        ))}
      </ul>
    </Section>
  )
}

function ucrBadge(ucr: ReturnType<typeof useUcrStatus>['data'], pending: boolean): Row['badge'] {
  if (pending) return { label: 'Checking…', tone: 'pending' }
  if (!ucr || ucr.registered_current === null) return { label: 'Couldn’t check', tone: 'neutral' }
  if (!ucr.registered_current) return { label: 'Filing required', tone: 'down' }
  if (ucr.next_year && !ucr.registered_next) {
    return { label: `${ucr.next_year} due`, tone: 'warn' }
  }
  return { label: `Registered ${ucr.next_year ?? ucr.current_year}`, tone: 'ok' }
}

function ucrText(ucr: ReturnType<typeof useUcrStatus>['data'], pending: boolean): ReactNode {
  if (pending) return 'Checking FMCSA’s UCR records…'
  if (!ucr || ucr.registered_current === null) {
    return (
      <>
        FMCSA’s UCR records couldn’t be checked just now.{' '}
        {ucr && (
          <a href={ucr.source_url} target="_blank" rel="noreferrer" className="underline">
            Check on SAFER
          </a>
        )}
      </>
    )
  }
  const source = (
    <a href={ucr.source_url} target="_blank" rel="noreferrer" className="underline">
      FMCSA record
    </a>
  )
  if (!ucr.registered_current) {
    return (
      <>
        No paid UCR registration for {ucr.current_year} ({source}). Your UCR needs to be filed.
      </>
    )
  }
  if (ucr.next_year && !ucr.registered_next) {
    return (
      <>
        Registered for {ucr.current_year} ({source}). {ucr.next_year} registration is open; file
        before January 1.
      </>
    )
  }
  return (
    <>
      Registered and paid for {ucr.next_year ?? ucr.current_year} ({source}).
    </>
  )
}

function ComplianceRow({
  row,
  usdotNumber,
  openRequest,
  staff,
}: {
  row: Row
  usdotNumber: number
  openRequest: ComplianceRequest | undefined
  staff: boolean
}) {
  const [asking, setAsking] = useState(false)
  const Icon = row.icon
  const payment = PAYMENT_LINKS[row.service]
  const link = SERVICE_LINKS[row.service]
  const tone = row.badge?.tone ?? 'neutral'
  const ring =
    tone === 'down'
      ? 'border-red-200 bg-red-50/40'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50/40'
        : 'border-slate-200'
  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3 ${ring}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
              {row.title}
            </h3>
            {row.badge && <StatusBadge label={row.badge.label} tone={row.badge.tone} />}
          </div>
          <p className="text-sm text-slate-600">
            {row.description}
            {row.link && (
              <>
                {' '}
                <a
                  href={row.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong hover:underline"
                >
                  {row.link.label}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </>
            )}
          </p>
          {openRequest && (
            <p className="text-xs font-medium text-emerald-700">
              {staff ? (
                <>
                  {openRequest.requested_by_name ?? 'The client'} asked for help on{' '}
                  {formatLocalDate(openRequest.created_at)} ·{' '}
                  <Link to="/service-requests" className="underline">
                    Service requests
                  </Link>
                </>
              ) : (
                `Requested ${formatLocalDate(openRequest.created_at)}. STS will contact you.`
              )}
            </p>
          )}
        </div>
      </div>
      {/* Right side: the row's button (its link once STS adds it), then "Pay online" if set */}
      <div className="flex flex-wrap gap-2 sm:shrink-0 sm:flex-nowrap">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className={`${mainButton} ${active}`}>
            {row.button}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : staff ? (
          <span
            aria-disabled="true"
            title="No link added for this button yet"
            className={`${mainButton} cursor-not-allowed opacity-50`}
          >
            {row.button}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className={`${mainButton} ${active}`}
          >
            {openRequest ? 'Ask again' : row.button}
          </button>
        )}
        {payment && (
          <a
            href={payment}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:min-h-0 sm:flex-none"
          >
            Pay online
          </a>
        )}
      </div>
      {asking && (
        <AskDialog
          usdotNumber={usdotNumber}
          service={row.service}
          title={ASK_LABEL[row.service]}
          onClose={() => setAsking(false)}
        />
      )}
    </li>
  )
}

function AskDialog({
  usdotNumber,
  service,
  title,
  onClose,
}: {
  usdotNumber: number
  service: ComplianceServiceId
  title: string
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  const create = useCreateComplianceRequest(usdotNumber)
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <form
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(
            { service, note: note.trim() || null },
            { onSuccess: () => setTimeout(onClose, 1200) },
          )
        }}
      >
        <h2 id="ask-title" className="text-lg font-semibold text-slate-950">
          Ask STS for help
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          <span className="font-medium">{title}</span> for USDOT {usdotNumber}. Sky Transport
          Solutions will contact you about it.
        </p>
        <label htmlFor="ask-note" className="mt-4 block text-xs font-medium text-slate-600">
          Anything we should know? (optional)
        </label>
        <textarea
          id="ask-note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm"
        />
        {create.isError && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            Could not send: {create.error.message}
          </p>
        )}
        {create.isSuccess && (
          <p className="mt-2 text-sm text-emerald-700" role="status">
            Sent. STS will contact you.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || create.isSuccess}
            className="rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
          >
            {create.isPending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>
  )
}
