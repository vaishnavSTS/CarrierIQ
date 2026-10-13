import { Radar } from 'lucide-react'
import { Link } from 'react-router-dom'

/** The CarrierIQ logo and name, linking to `to` (the landing page or a portal's home). */
export function Brand({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 text-base font-semibold tracking-tight text-gray-900"
    >
      <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.35)]">
        <Radar className="size-4" aria-hidden />
      </span>
      CarrierIQ
    </Link>
  )
}
