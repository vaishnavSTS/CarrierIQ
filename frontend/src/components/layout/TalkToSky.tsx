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
      className="fixed bottom-4 right-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-full bg-cta px-4 py-2 text-sm font-semibold text-cta-ink shadow-lg print:hidden"
    >
      <MessageCircle className="size-4" aria-hidden />
      <span className="sm:hidden">Talk to Sky</span>
      <span className="hidden sm:inline">Talk to a Sky specialist</span>
    </Link>
  )
}
