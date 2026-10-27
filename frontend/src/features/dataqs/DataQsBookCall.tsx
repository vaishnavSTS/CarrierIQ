import { CalendarPlus, ExternalLink } from 'lucide-react'

import { useDataQsCallLink } from '../../hooks/useDataQs'
import { usePortalMode } from '../../hooks/usePortalMode'
import type { DataQsCase } from '../../types/dataqs'
import { primaryButton } from './ui'

/**
 * A call with STS about the case, booked on STS's website: the button gets a signed booking link
 * and opens it in a new tab, where the client picks a date and a free time. The website sends the
 * confirmation email and text and the reminders, and its emails link to cancel or reschedule.
 */
export function DataQsBookCall({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const staff = usePortalMode() === 'internal'
  const link = useDataQsCallLink(c.id)

  const open = () => {
    // Open the tab now (a click), then point it at the link: browsers block tabs opened later.
    const tab = window.open('', '_blank')
    link.mutate(undefined, {
      onSuccess: ({ url }) => {
        if (tab) {
          tab.opener = null
          tab.location.href = url
        } else {
          window.location.href = url
        }
      },
      onError: () => tab?.close(),
    })
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-700">
        {staff
          ? 'Opens STS’s booking page for this carrier (a DataQs case call). The confirmation email and text go to the company email and phone on file.'
          : 'Questions about your request or the evidence? Pick a date and a free time on STS’s booking page. You’ll get a confirmation email and text, and reminders before the call. Your confirmation email has a link to cancel or reschedule.'}
      </p>
      <button
        type="button"
        onClick={open}
        disabled={link.isPending}
        className={`${primaryButton} inline-flex items-center gap-1.5`}
      >
        <CalendarPlus className="size-4" aria-hidden />
        {link.isPending ? 'Opening…' : 'Book a call'}
        <ExternalLink className="size-3.5" aria-hidden />
      </button>
      {link.isError && (
        <p className="text-red-700" role="alert">
          {link.error.message}
        </p>
      )}
    </div>
  )
}
