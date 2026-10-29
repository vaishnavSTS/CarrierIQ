import { Globe, Mail, Phone } from 'lucide-react'
import { useContext } from 'react'

import { formatPhone } from '../../../utils/format'
import { STS_CONTACT } from './contact'
import { PrintCopy } from './printFit'
import stsLogo from './sts-logo.png'
import qrCode from './sts-website-qr.svg'

/** Sky Transport Solutions' phone, email and website, each a link (they stay clickable in the PDF). */
export function ContactLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 font-semibold ${className}`}>
      <a
        href={`tel:+1${STS_CONTACT.phone}`}
        className="inline-flex items-center gap-1.5 text-accent-strong hover:underline"
      >
        <Phone className="size-3.5" aria-hidden />
        {formatPhone(STS_CONTACT.phone)}
      </a>
      <a
        href={`mailto:${STS_CONTACT.email}`}
        className="inline-flex items-center gap-1.5 text-accent-strong hover:underline"
      >
        <Mail className="size-3.5" aria-hidden />
        {STS_CONTACT.email}
      </a>
      <a
        href={STS_CONTACT.website}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-accent-strong hover:underline"
      >
        <Globe className="size-3.5" aria-hidden />
        {STS_CONTACT.websiteLabel}
      </a>
    </div>
  )
}

/** Sky Transport Solutions' globe logo. */
export function StsLogo({ className = 'size-14' }: { className?: string }) {
  return (
    <img
      src={stsLogo}
      alt={STS_CONTACT.company}
      className={`${className} shrink-0 object-contain`}
    />
  )
}

/**
 * The QR code for Sky Transport Solutions' website (sts-website-qr.svg: the website address only,
 * no carrier data; made once with reportlab's QR encoder). At least 1.5 cm when printed so phones
 * scan it reliably.
 */
export function WebsiteQr({ size = 'small' }: { size?: 'small' | 'large' }) {
  return (
    <img
      src={qrCode}
      alt={`QR code: ${STS_CONTACT.website}`}
      className={`${size === 'large' ? 'size-24' : 'size-[4.6rem]'} shrink-0 rounded-sm bg-white`}
    />
  )
}

/**
 * The bottom of every report page: Sky Transport Solutions' logo, a message for that page, its
 * phone, email and website, and the QR code to its website.
 */
export function ContactStrip({ message }: { message: string }) {
  // On a phone screen there is no room beside the text for the logo and the QR code (and the
  // phone is the device the QR would open the website on), so they show from small tablets up.
  // The printed copy always has them: it is laid out at the A4 width whatever the screen.
  const printed = useContext(PrintCopy)
  const roomy = printed ? 'flex' : 'hidden sm:flex'
  return (
    <div className="contact-strip flex break-inside-avoid items-center gap-4 rounded-xl border border-accent/30 bg-accent-soft px-4 py-2.5">
      <StsLogo className={`size-14 ${printed ? '' : 'hidden sm:block'}`} />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="font-semibold text-slate-900">{message}</p>
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-violet-700">{STS_CONTACT.company}</span> · DOT
          compliance, DataQs and safety-score help
        </p>
        <ContactLinks className="text-xs" />
      </div>
      <div className={`${roomy} shrink-0 flex-col items-center gap-0.5`}>
        <WebsiteQr />
        <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">
          Scan to visit
        </span>
      </div>
    </div>
  )
}
