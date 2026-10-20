import { Radar } from 'lucide-react'
import { Link } from 'react-router-dom'

/** The CarrierSafetyScan logo and name, linking to `to` (the landing page or a portal's home). */
export function Brand({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900"
    >
      <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-brand-glow/35">
        <Radar className="size-4" aria-hidden />
      </span>
      CarrierSafetyScan
    </Link>
  )
}
