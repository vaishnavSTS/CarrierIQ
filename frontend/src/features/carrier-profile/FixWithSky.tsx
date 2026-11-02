import { Wrench } from 'lucide-react'
import { useContext } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useIsOwnCarrier } from '../../hooks/useIsOwnCarrier'
import { PrintCopy } from './packet/printFit'

/**
 * Under a problem on a carrier's own record: ask Sky Transport Solutions to fix it, with the
 * Contact form filled in. Brokers and staff don't see it, since they can't fix another company's
 * record, and neither does the printed report, which has the contact strip instead.
 */
export function FixWithSky({ topic, usdotNumber }: { topic: string; usdotNumber?: number }) {
  const { usdot } = useParams()
  const number = usdotNumber ?? Number(usdot)
  const own = useIsOwnCarrier(number)
  const printed = useContext(PrintCopy)
  if (!own || printed) return null
  const params = new URLSearchParams({ usdot: String(number), topic })
  return (
    <Link
      to={`/contact?${params}`}
      className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-surface px-2.5 py-1 text-xs font-medium text-accent-strong hover:bg-slate-50 print:hidden"
    >
      <Wrench className="size-3.5 shrink-0" aria-hidden />
      Fix it with Sky Transport Solutions
    </Link>
  )
}
