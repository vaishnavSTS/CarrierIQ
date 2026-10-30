import { Mail } from 'lucide-react'
import { Link } from 'react-router-dom'

/** The bottom of the public pages and the client and broker portals. */
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 px-4 py-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <p className="text-xs text-slate-500">
          CarrierSafetyScan by STS · Built on public FMCSA and NHTSA data
        </p>
        <Link
          to="/contact"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
        >
          <Mail className="size-4" aria-hidden />
          Contact us
        </Link>
      </div>
    </footer>
  )
}
