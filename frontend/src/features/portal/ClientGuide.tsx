import {
  CalendarClock,
  FileWarning,
  Gauge,
  SearchCheck,
  Send,
  ShieldCheck,
  Wrench,
} from 'lucide-react'

import { PortalGuide, type GuideItem } from './PortalGuide'

/** What a carrier gets: know what brokers see, fix it, and prove it. */
const FEATURES: GuideItem[] = [
  {
    icon: ShieldCheck,
    title: 'Know before brokers do',
    text: 'The items broker vetting tools usually flag on your record, such as a shared phone or address, an old MCS-150 or a missing BOC-3, before a broker sees them.',
  },
  {
    icon: Wrench,
    title: 'Fix it the right way',
    text: 'Each flag comes with how it is usually resolved: an MCS-150 update, a BOC-3 filing or a current insurance certificate.',
  },
  {
    icon: Gauge,
    title: 'Lower your safety score',
    text: 'Which violations weigh most in your CSA measures and Estimated ISS, the 49 CFR rule behind each, and what usually helps.',
  },
  {
    icon: FileWarning,
    title: 'Challenge wrong records',
    text: 'When an inspection or violation on your record is wrong, how to ask FMCSA to correct it through DataQs.',
  },
  {
    icon: CalendarClock,
    title: 'Stay current',
    text: 'When your MCS-150 update is due and when your insurance usually renews, so nothing lapses without you noticing.',
  },
  {
    icon: Send,
    title: 'Win the load',
    text: 'A dated, sourced packet to send brokers and shippers, so they see your record and its sources before they ask.',
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
      featuresTitle="What CarrierIQ does for your company"
      featuresIntro="Built from the same public FMCSA and NHTSA records brokers check, with the source named on every value."
      features={FEATURES}
      steps={STEPS}
      note="CarrierIQ shows what FMCSA’s public records say. A fix you make with FMCSA shows here once FMCSA publishes it. Flags are what brokers’ checks commonly react to, not a finding about your company. The Estimated ISS is CarrierIQ’s estimate, not FMCSA’s official score. Questions? Contact your STS team."
    />
  )
}
