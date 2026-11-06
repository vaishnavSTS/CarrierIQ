import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Smartphone,
  Truck,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import { ApiError } from '../../api/client'
import { getCarrierContact, type PublicCarrier } from '../../api/directory'
import { formatDate, formatPhone } from '../../utils/format'
import { number } from './UsMap'
import { newTabOnWide, useWideScreen } from './useWideScreen'

/*
 * The pop-up for a carrier clicked in the broker portal's map (brokers and insurance agents): that
 * one carrier's contact card, asked for when it is clicked: phone, email, address, MC number.
 * The carrier portal and the public pages don't have it: there a clicked carrier just opens.
 */
export function CarrierCardDialog({
  carrier,
  openTo,
  onClose,
}: {
  carrier: PublicCarrier
  /** Where its full record opens in the portal, if anywhere */
  openTo: string | null
  onClose: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)
  // Laptops: the full record opens in a new tab, and the map stays here
  const wide = useWideScreen()
  const card = useQuery({
    queryKey: ['directory', 'carrier', carrier.usdot_number],
    queryFn: () => getCarrierContact(carrier.usdot_number),
    retry: false,
    staleTime: 10 * 60_000,
  })

  // The card is a step of its own in the browser's history: the phone's back gesture (or the
  // browser's Back) closes it and leaves the map and list just as they were.
  const marker = carrier.usdot_number
  const latestClose = useRef(onClose)
  useEffect(() => {
    latestClose.current = onClose
  })
  useEffect(() => {
    if (window.history.state?.carrierCard !== marker) {
      window.history.pushState({ ...window.history.state, carrierCard: marker }, '')
    }
    const onPop = () => latestClose.current()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [marker])
  // Closing by hand steps back too, so Back afterwards doesn't land on the card's history entry.
  const requestClose = useCallback(() => {
    if (window.history.state?.carrierCard === marker) window.history.back()
    else latestClose.current()
  }, [marker])

  useEffect(() => {
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  const c = card.data
  const limited = card.error instanceof ApiError && card.error.status === 429

  // On the page itself, not inside the sliding list (its transform would hold a fixed pop-up).
  // Phones: a full screen of its own. Wider screens: a pop-up over the map.
  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-surface sm:grid sm:place-items-center sm:bg-black/60 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="carrier-card-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div className="relative min-h-full w-full bg-surface sm:min-h-0 sm:max-w-md sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl sm:ring-1 sm:ring-black/5">
        <div className="bg-[#101853] px-6 pb-5 pt-4 text-white sm:pt-6">
          <button
            type="button"
            onClick={requestClose}
            className="-ml-2 mb-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white sm:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to the map
          </button>
          <button
            ref={close}
            type="button"
            aria-label="Close"
            onClick={requestClose}
            className="absolute right-3 top-3 hidden size-10 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white sm:grid"
          >
            <X className="size-5" aria-hidden />
          </button>
          <h2 id="carrier-card-title" className="pr-10 text-xl font-semibold leading-snug">
            {c?.legal_name || carrier.legal_name}
          </h2>
          {c?.dba_name && <p className="text-sm text-white/75">Doing business as {c.dba_name}</p>}
          <p className="mt-2 font-mono text-xs text-white/80">
            USDOT {carrier.usdot_number}
            {c?.mc_number && ` · ${c.mc_number}`}
            {c?.status && (
              <span
                className={`ml-2 rounded-full px-1.5 py-px font-sans text-[10.5px] font-semibold uppercase ${c.status === 'ACTIVE' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-red-400/20 text-red-200'}`}
              >
                {c.status === 'ACTIVE' ? 'Active' : 'Inactive'}
              </span>
            )}
          </p>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Truck className="size-4 text-slate-400" aria-hidden />
              {carrier.power_units != null
                ? `${number.format(carrier.power_units)} ${carrier.power_units === 1 ? 'truck' : 'trucks'}`
                : 'Fleet not reported'}
              {c?.drivers != null &&
                ` · ${number.format(c.drivers)} ${c.drivers === 1 ? 'driver' : 'drivers'}`}
            </span>
            {carrier.registered_on && <span>Since {formatDate(carrier.registered_on)}</span>}
          </div>

          {card.isPending ? (
            <div className="space-y-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : c ? (
            <ul className="space-y-2.5">
              <Row icon={Phone} label="Phone">
                {c.phone ? (
                  <a href={`tel:+1${c.phone}`} className="text-accent-strong hover:underline">
                    {formatPhone(c.phone)}
                  </a>
                ) : null}
              </Row>
              {c.cell_phone && c.cell_phone !== c.phone && (
                <Row icon={Smartphone} label="Cell">
                  <a href={`tel:+1${c.cell_phone}`} className="text-accent-strong hover:underline">
                    {formatPhone(c.cell_phone)}
                  </a>
                </Row>
              )}
              <Row icon={Mail} label="Email">
                {c.email ? (
                  <a
                    href={`mailto:${c.email}`}
                    className="break-all text-accent-strong hover:underline"
                  >
                    {c.email}
                  </a>
                ) : null}
              </Row>
              <Row icon={MapPin} label="Address">
                {c.address}
              </Row>
              {c.mailing_address && (
                <Row icon={MapPin} label="Mailing address">
                  {c.mailing_address}
                </Row>
              )}
            </ul>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              {limited
                ? 'You’ve opened a lot of carriers in the last hour. Try again a little later.'
                : 'The contact details couldn’t load just now. Try again in a moment.'}
            </p>
          )}

          {openTo && (
            <Link
              to={openTo}
              {...newTabOnWide(wide)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 font-medium text-slate-900 hover:bg-slate-50"
            >
              Open the full record
              {wide ? (
                <>
                  <ExternalLink className="size-4" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </>
              ) : (
                <ArrowRight className="size-4" aria-hidden />
              )}
            </Link>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone
  label: string
  children: ReactNode
}) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-slate-900">
          {children ?? <span className="text-slate-500">Not on file</span>}
        </div>
      </div>
    </li>
  )
}
