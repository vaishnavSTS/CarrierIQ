import { MessageCircle } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { useCompareList } from '../../features/compare/compareContext'

/** Pages with their own form, where a floating button would only sit on top of it. */
const HIDDEN_ON =
  /^\/(contact|login|register|forgot-password|reset-password|verify-email|team\/login|(broker|insurance)\/(login|register))(\/|$)/

/** Bottom corner of the public pages and the client and broker portals: reach Sky Transport Solutions. */
export function TalkToSky() {
  const { pathname } = useLocation()
  const compare = useCompareList()
  // The compare tray uses the same strip of the screen.
  const trayOpen = compare !== null && compare.usdots.length > 0 && pathname !== compare.page
  if (trayOpen || HIDDEN_ON.test(pathname)) return null
  return (
    <Link
      to="/contact"
      aria-label="Talk to a Sky specialist"
      title="Talk to a Sky specialist"
      // On phones, a round icon button that covers as little of the page as possible
      className="fixed bottom-3 right-3 z-20 inline-flex size-11 items-center justify-center gap-2 rounded-full bg-cta text-sm font-semibold text-cta-ink shadow-lg sm:bottom-4 sm:right-4 sm:size-auto sm:min-h-11 sm:px-4 sm:py-2 print:hidden"
    >
      <MessageCircle className="size-5 sm:size-4" aria-hidden />
      <span className="hidden sm:inline">Talk to a Sky specialist</span>
    </Link>
  )
}
