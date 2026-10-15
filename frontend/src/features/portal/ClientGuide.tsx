import {
  Gauge,
  IdCard,
  ScrollText,
  SearchCheck,
  Send,
  ShieldCheck,
  Truck,
  Wrench,
} from 'lucide-react'

import { PortalGuide, type GuideItem } from './PortalGuide'

/** One card per tab a client sees for their carrier. */
const FEATURES: GuideItem[] = [
  {
    icon: ShieldCheck,
    title: 'How brokers’ checks see you',
    text: 'What broker vetting usually flags, such as a shared phone or address, an old MCS-150 or a missing BOC-3, and how each is usually fixed.',
  },
  {
    icon: Gauge,
    title: 'Estimated ISS – Safety score',
    text: '1–100, by FMCSA’s published method: Satisfactory, At risk or High risk, and which safety category drives it.',
  },
  {
    icon: Wrench,
    title: 'What to improve',
    text: 'Which violations weigh most in your CSA measures, the rule behind them, and what usually helps.',
  },
  {
    icon: ScrollText,
    title: 'Authority and insurance',
    text: 'Your MC status, insurance and BOC-3 on file with FMCSA, and when your insurance usually renews.',
  },
  {
    icon: Truck,
    title: 'Equipment',
    text: 'The trucks and trailers inspectors recorded, decoded from their VINs, and VINs also seen under other carriers.',
  },
  {
    icon: IdCard,
    title: 'Identity and packet',
    text: 'Your FMCSA registration details, and a dated, sourced packet to send brokers and shippers.',
  },
]

const STEPS: GuideItem[] = [
  {
    icon: SearchCheck,
    title: 'Check',
    text: 'Open your carrier and start with “How brokers’ checks may see you” and the safety score.',
  },
  {
    icon: Wrench,
    title: 'Fix',
    text: 'Work through what is flagged: an MCS-150 update, a BOC-3 filing, or a DataQs challenge for a wrong violation.',
  },
  {
    icon: Send,
    title: 'Share',
    text: 'Send brokers the packet, so they see your record and its sources before they ask.',
  },
]

/** Client portal home, below "My carriers": what CarrierIQ shows about their company. */
export function ClientGuide() {
  return (
    <PortalGuide
      featuresTitle="What you see about your company"
      featuresIntro="The same public FMCSA and NHTSA records brokers check, with the source named on every value."
      features={FEATURES}
      steps={STEPS}
      note="CarrierIQ shows what FMCSA’s public records say. A fix you make with FMCSA shows here once FMCSA publishes it. Flags are what brokers’ checks commonly react to, not a finding about your company. The Estimated ISS is CarrierIQ’s estimate, not FMCSA’s official score. Questions? Contact your STS team."
    />
  )
}
