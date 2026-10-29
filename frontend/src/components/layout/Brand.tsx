import { Link } from 'react-router-dom'

import logo from '../../assets/carriersafetyscan-logo.png'

/**
 * The CarrierSafetyScan logo and name, with the "Powered by Sky Transport Solutions" line,
 * linking to `to` (the landing page or a portal's home).
 */
export function Brand({ to }: { to: string }) {
  return (
    <Link to={to} className="flex items-center gap-2">
      <img
        src={logo}
        alt=""
        className="size-8 shrink-0 rounded-lg shadow-md shadow-brand-glow/35"
      />
      <span className="flex flex-col leading-tight">
        <span className="text-base font-semibold tracking-tight text-slate-900">
          CarrierSafetyScan
        </span>
        <span className="text-xs font-medium text-slate-500 sm:whitespace-nowrap sm:text-[13px]">
          Powered by{' '}
          <span className="whitespace-nowrap bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text font-bold text-transparent">
            Sky Transport Solutions
          </span>
        </span>
      </span>
    </Link>
  )
}
