import {
  FileText,
  Gauge,
  Network,
  Search,
  SearchCheck,
  ShieldCheck,
  TriangleAlert,
  Truck,
} from 'lucide-react'

import { PortalGuide, type GuideItem } from './PortalGuide'

const FEATURES: GuideItem[] = [
  {
    icon: ShieldCheck,
    title: 'Authority and insurance',
    text: 'Is the MC active, is liability and cargo insurance on file, is there a BOC-3, any revocations.',
  },
  {
    icon: Gauge,
    title: 'Estimated ISS – Safety score',
    text: '1–100, by FMCSA’s published method: Satisfactory, At risk or High risk, and which safety category drives it.',
  },
  {
    icon: TriangleAlert,
    title: 'Inspections and crashes',
    text: 'Out-of-service rates against the national average, violations, and crashes over the last two years.',
  },
  {
    icon: Network,
    title: 'Fraud red flags',
    text: 'Phones, emails, addresses or officers shared with other carriers, and links to revoked USDOT numbers.',
  },
  {
    icon: Truck,
    title: 'Equipment',
    text: 'The trucks and trailers seen on inspections, decoded from their VINs, and VINs used by other carriers.',
  },
  {
    icon: FileText,
    title: 'Safety Score Report',
    text: 'A dated, sourced summary of the carrier you can print or save to your load file.',
  },
]

const STEPS: GuideItem[] = [
  {
    icon: Search,
    title: 'Search',
    text: 'USDOT, MC or name. A carrier not yet in CarrierSafetyScan is loaded from FMCSA in a few seconds.',
  },
  {
    icon: SearchCheck,
    title: 'Review',
    text: 'Start with the red flags and the safety score, then open any tab for the details.',
  },
  {
    icon: FileText,
    title: 'Keep a record',
    text: 'Save the Safety Score Report with the load, so you can show what you checked and when.',
  },
]

/** Broker home, below the search: what a carrier profile shows and how to use it. */
export function BrokerGuide() {
  return (
    <PortalGuide
      featuresTitle="What you see on every carrier"
      featuresIntro="Public FMCSA and NHTSA records, with the source named on every value."
      features={FEATURES}
      steps={STEPS}
      note="CarrierSafetyScan shows what FMCSA’s public records say and flags what usually needs a closer look. It does not approve or reject carriers: the booking decision stays with you. The Estimated ISS is CarrierSafetyScan’s estimate, not FMCSA’s official score."
    />
  )
}
