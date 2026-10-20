import { Radar } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * The CarrierSafetyScan logo and name, with the "Powered by Sky Transport Solutions" line,
 * linking to `to` (the landing page or a portal's home).
 */
export function Brand({ to }: { to: string }) {
  return (
    <Link to={to} className="flex items-center gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-brand-glow/35">
        <Radar className="size-4" aria-hidden />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-semibold tracking-tight text-slate-900">
          CarrierSafetyScan
        </span>
        <span className="text-[10px] font-medium tracking-wide text-slate-500">
          Powered by Sky Transport Solutions
        </span>
      </span>
    </Link>
  )
}
