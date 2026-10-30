import { Clock, Globe, Mail, MapPin, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'

import { STS_CONTACT } from '../../features/carrier-profile/packet/contact'
import stsLogo from '../../features/carrier-profile/packet/sts-logo.png'
import { STS_ADDRESS, STS_HOURS } from '../../features/landing/stsInfo'
import { formatPhone } from '../../utils/format'

/** The bottom of the public pages and the client and broker portals: how to reach STS. */
export function SiteFooter() {
  const links = [
    { icon: Phone, label: formatPhone(STS_CONTACT.phone), href: `tel:+1${STS_CONTACT.phone}` },
    { icon: Mail, label: STS_CONTACT.email, href: `mailto:${STS_CONTACT.email}` },
    { icon: Globe, label: STS_CONTACT.websiteLabel, href: STS_CONTACT.website },
  ]
  return (
    <footer className="border-t border-slate-200 bg-surface/60 px-4 py-8">
      <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-[1.1fr_1fr_1fr] md:items-start">
        <div>
          <div className="flex items-center gap-3">
            <img src={stsLogo} alt="" className="size-11 shrink-0 object-contain" />
            <span className="font-semibold text-slate-900">{STS_CONTACT.company}</span>
          </div>
          <Link
            to="/contact"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
          >
            <Mail className="size-4" aria-hidden />
            Contact us
          </Link>
        </div>
        <ul className="space-y-2.5 text-sm">
          {links.map(({ icon: Icon, label, href }) => (
            <li key={label}>
              <a
                href={href}
                className="flex items-center gap-2.5 break-all font-medium text-accent-strong hover:underline"
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </a>
            </li>
          ))}
        </ul>
        <ul className="space-y-2.5 text-sm text-slate-700">
          <li className="flex gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
            {STS_ADDRESS}
          </li>
          <li className="flex gap-2.5">
            <Clock className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
            {STS_HOURS}
          </li>
        </ul>
      </div>
      <p className="mx-auto mt-6 max-w-7xl border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
        CarrierSafetyScan by STS · Built on public FMCSA and NHTSA data · Not affiliated with FMCSA
      </p>
    </footer>
  )
}
