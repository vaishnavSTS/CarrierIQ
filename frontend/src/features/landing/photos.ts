/**
 * Real photos on the public pages. All from Pexels (pexels.com/photo/<id>, Pexels License: free
 * to use, no credit required) except the carrier and broker heroes, from Unsplash (Unsplash
 * License; the carrier one is credited in AudienceHero). None
 * shows a readable company name; none is of a carrier, broker or agency using Carrier Safety Scan.
 */
import agentFilings from '../../assets/photos/agent-filings.jpg' // 7734574
import agentFleet from '../../assets/photos/agent-fleet.jpg' // 6720542
import agentReport from '../../assets/photos/agent-report.jpg' // 9870223
import agentSafety from '../../assets/photos/agent-safety.jpg' // 34902065
import brokerAuthority from '../../assets/photos/broker-authority.jpg' // 40292013
import brokerFlags from '../../assets/photos/broker-flags.jpg' // 27099094
import brokerLinked from '../../assets/photos/broker-linked.jpg' // 2348359
import brokerReport from '../../assets/photos/broker-report.jpg' // 7821541
import carrierCheck from '../../assets/photos/carrier-check.jpg' // 6720527
import carrierFix from '../../assets/photos/carrier-fix.jpg' // 6720539
import carrierRegistration from '../../assets/photos/carrier-registration.jpg' // 6720541
import carrierReport from '../../assets/photos/carrier-report.jpg' // 6720550
import chooseAgent from '../../assets/photos/choose-agent.jpg' // 7821707
import chooseBroker from '../../assets/photos/choose-broker.jpg' // 3992926
import chooseCarrier from '../../assets/photos/choose-carrier.jpg' // 17377416
import heroAgent from '../../assets/photos/hero-agent.jpg' // 11053641
import heroBroker from '../../assets/photos/hero-broker.jpg' // Unsplash tv53M6u2bAQ, by LEDC
import heroCarrier from '../../assets/hero-trucks.webp'
import type { Audience } from '../audience/audience'

export type Photo = { src: string; alt: string }

/** Faint behind each audience's hero. */
export const HERO_PHOTO: Record<Audience, string> = {
  carrier: heroCarrier,
  broker: heroBroker,
  agent: heroAgent,
}

/** The front door's three cards. */
export const CHOOSER_PHOTO: Record<Audience, Photo> = {
  carrier: { src: chooseCarrier, alt: 'A truck driver smiling and waving from his cab' },
  broker: { src: chooseBroker, alt: 'A dispatcher at a desk with several screens' },
  agent: { src: chooseAgent, alt: 'An agent going over a document with a client' },
}

/** One per feature card, in the order of each audience's features on LandingPage. */
export const FEATURE_PHOTOS: Record<Audience, Photo[]> = {
  carrier: [
    { src: carrierCheck, alt: 'A driver reading paperwork in the cab of his truck' },
    { src: carrierFix, alt: 'A mechanic checking the wheel of a truck' },
    { src: carrierRegistration, alt: 'Two men going over a document in front of a truck' },
    { src: carrierReport, alt: 'A driver and a mechanic shaking hands by a truck' },
  ],
  broker: [
    { src: brokerAuthority, alt: 'A white semi truck on a sunny road' },
    { src: brokerFlags, alt: 'Refrigerated trailers parked in a lot' },
    { src: brokerLinked, alt: 'A row of parked semi trucks' },
    { src: brokerReport, alt: 'A person signing a document at a desk' },
  ],
  agent: [
    { src: agentFilings, alt: 'Hands signing a policy on a clipboard' },
    { src: agentSafety, alt: 'A semi truck on a highway between mountains' },
    { src: agentFleet, alt: 'A mechanic working on a truck engine' },
    { src: agentReport, alt: 'A handshake over documents on a desk' },
  ],
}
