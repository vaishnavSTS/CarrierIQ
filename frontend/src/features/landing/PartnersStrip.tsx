import aperio from '../../assets/partners/aperio.webp'
import californiaTruckGroup from '../../assets/partners/california-truck-group.webp'
import heartland from '../../assets/partners/heartland.webp'
import horizon from '../../assets/partners/horizon.webp'
import ironHighway from '../../assets/partners/iron-highway.webp'
import reliance from '../../assets/partners/reliance.webp'
import sierraCdl from '../../assets/partners/sierra-cdl.webp'
import sierraInsurance from '../../assets/partners/sierra-insurance.webp'
import summit from '../../assets/partners/summit.webp'

/*
 * The companies that partner with Sky Transport Solutions, as its Partner Program page lists them
 * (skytransportsolutions.com/partnership-program.html, read Nov 5, 2026), with their logos from
 * there. They are STS's partners, not reviews of Carrier Safety Scan. The user (STS) confirmed
 * them on Nov 5, 2026; add or remove only on STS's word.
 */
const PARTNERS = [
  { name: 'Aperio Logistics Group', logo: aperio },
  { name: 'California Truck Group', logo: californiaTruckGroup },
  { name: 'Heartland Trucking School', logo: heartland },
  { name: 'Horizon Forwarding', logo: horizon },
  { name: 'Iron Highway Logistics & CDL Certifications', logo: ironHighway },
  { name: 'Reliance Truckers Insurance Agency', logo: reliance },
  { name: 'Sierra CDL Training', logo: sierraCdl },
  { name: 'Sierra Carrier Insurance Company', logo: sierraInsurance },
  { name: 'Summit Truck Center', logo: summit },
]

/** A strip of partner logos, moving sideways without stopping (still with reduced motion). */
export function PartnersStrip() {
  const row = (hidden: boolean) => (
    <ul
      className="marquee-row flex shrink-0 items-center gap-12 pr-12"
      aria-hidden={hidden || undefined}
    >
      {PARTNERS.map((p) => (
        <li key={`${hidden}-${p.name}`} className="shrink-0">
          <img
            src={p.logo}
            alt={hidden ? '' : p.name}
            title={p.name}
            loading="lazy"
            className="h-14 w-auto object-contain opacity-80 transition-opacity hover:opacity-100 md:h-16"
          />
        </li>
      ))}
    </ul>
  )
  return (
    <div className="mt-8">
      <div className="font-label mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Companies that partner with Sky Transport Solutions
      </div>
      <section
        aria-label="Sky Transport Solutions partners"
        className="partner-strip marquee relative overflow-hidden rounded-2xl border border-slate-200 bg-surface py-4"
      >
        {/* Faster than the page's other strips (60 s a loop). */}
        <div className="marquee-track flex w-max" style={{ animationDuration: '20s' }}>
          {row(false)}
          {row(true)}
        </div>
      </section>
    </div>
  )
}
