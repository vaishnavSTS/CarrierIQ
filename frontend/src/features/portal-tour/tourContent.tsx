import type { ReactNode } from 'react'

import type { Audience } from '../audience/audience'
import { Accent } from '../landing/landingParts'

/**
 * The portal pages (/for-carriers/portal …): every part of each portal, in the order a new
 * account meets it. Only what the app really shows that kind of account: brokers and agents have
 * no Compliance or Invoices tab on a carrier, agents have no Booking check, nobody gets alerts.
 * Keep in step with pages/CarrierProfilePage.tsx (tabs), the portal home pages and Compare.
 */

export type VisualKey =
  | 'home'
  | 'overview'
  | 'authority'
  | 'inspections'
  | 'equipment'
  | 'brokers'
  | 'linked'
  | 'chameleon'
  | 'report'
  | 'dataqs'
  | 'compliance'
  | 'history'
  | 'search'
  | 'booking'
  | 'compare'

export interface TourSection {
  id: string
  /** Short name in the section menu */
  nav: string
  title: ReactNode
  lead: string
  points: string[]
  /** Something to know, said plainly (estimates, who decides, what's not shown) */
  note?: string
  visual: VisualKey
}

export interface Tour {
  eyebrow: string
  title: ReactNode
  text: string
  signUp: { label: string; to: string }
  sections: TourSection[]
  faqs: { q: string; a: string }[]
}

const OVERVIEW = (who: 'your' | 'a'): TourSection => ({
  id: 'overview',
  nav: 'Overview',
  title: (
    <>
      The whole carrier <Accent>at a glance</Accent>
    </>
  ),
  lead:
    who === 'your'
      ? 'The top of your carrier’s page sums it up in four cards, with the company details underneath.'
      : 'The top of every carrier’s page sums it up in four cards, with the company details underneath.',
  points: [
    'Estimated ISS safety score, 1–100, with its band and what drives it',
    'Authority, registration and insurance status cards',
    'Entity type, operation and fleet size from the MCS-150',
    'When the MCS-150 was last updated, and whether it’s past the two-year update',
    'Phones, email, website, officers and addresses on file',
  ],
  note: 'The Estimated ISS is Carrier Safety Scan’s estimate, worked out FMCSA’s published way. It is not FMCSA’s official score or a safety rating.',
  visual: 'overview',
})

const AUTHORITY: TourSection = {
  id: 'authority',
  nav: 'Authority & insurance',
  title: (
    <>
      Authority and insurance, <Accent>line by line</Accent>
    </>
  ),
  lead: 'Every docket with its status and age, and the insurance on file against what’s required.',
  points: [
    'Operating authority status, type and how long it’s been held, with a “revocation pending” badge',
    'Liability (BI&PD) required against on file, flagged when it’s below the minimum',
    'Cargo and bond, and the process agent (BOC-3) filing',
    'Current policies: insurer, policy number, coverage, effective and cancellation dates',
    'An expected renewal month, plus the full insurance and authority history',
  ],
  note: 'The renewal month is an estimate from past filing dates; no official renewal date is published.',
  visual: 'authority',
}

const INSPECTIONS = (who: 'your' | 'a'): TourSection => ({
  id: 'inspections',
  nav: 'Inspections',
  title: (
    <>
      Every inspection, <Accent>explained</Accent>
    </>
  ),
  lead:
    who === 'your'
      ? 'Your roadside record in plain English: what was found, how it counts and what would lower the score.'
      : 'The carrier’s roadside record in plain English: what was found and how it counts.',
  points: [
    'Safety rating, inspections and crashes over the last 24 months',
    'Vehicle and driver out-of-service rates against the national average',
    'CSA safety categories (BASICs), what drives each one and how to improve it',
    'How violation points roll off over time, and violations by truck',
    'Trends by quarter, by inspection level and by state, and every inspection on record',
    ...(who === 'your'
      ? ['A button on each inspection to have Sky Transport Solutions challenge it']
      : []),
  ],
  visual: 'inspections',
})

const EQUIPMENT: TourSection = {
  id: 'equipment',
  nav: 'Equipment',
  title: (
    <>
      The trucks and trailers <Accent>behind the numbers</Accent>
    </>
  ),
  lead: 'Every VIN seen on an inspection, decoded into the actual vehicle.',
  points: [
    'Power units registered against power units and trailers actually seen in 24 months',
    'Each VIN decoded: year, make, model, type and weight class',
    'How often each one was inspected, and when it was first and last seen',
    'VINs also seen under other USDOT numbers, and VINs that look mistyped',
  ],
  visual: 'equipment',
}

const REPORT = (use: string): TourSection => ({
  id: 'report',
  nav: 'Safety Score Report',
  title: (
    <>
      The Safety Score Report, <Accent>ready to save</Accent>
    </>
  ),
  lead: `A dated report on the carrier you can print or save as a PDF, ${use}.`,
  points: [
    'Page one: the score, why it is what it is, and what’s hurting it most',
    'The red flags a broker’s check looks for, out-of-service rates and what’s in good standing',
    'How to improve: where the violations come from and what usually helps',
    'The carrier record, and every inspection listed at the end',
  ],
  visual: 'report',
})

const HISTORY: TourSection = {
  id: 'history',
  nav: 'History',
  title: (
    <>
      What changed, <Accent>and when</Accent>
    </>
  ),
  lead: 'One timeline of the carrier’s authority, insurance and company details.',
  points: [
    'Authority granted, revoked or reinstated, and insurance filed or cancelled',
    'Changes to the name, address, phone, email and officers',
    'Filters for authority, insurance and company changes, or only the important events',
  ],
  note: 'Changes to company details are shown from when Carrier Safety Scan started following them; older ones aren’t known.',
  visual: 'history',
}

const SEARCH = (who: 'broker' | 'agent'): TourSection => ({
  id: 'search',
  nav: 'Search',
  title: (
    <>
      Look up <Accent>any carrier</Accent>
    </>
  ),
  lead:
    who === 'broker'
      ? 'Search by USDOT number, MC number or company name, right from your portal’s home page.'
      : 'Search by USDOT number, MC number or company name: the carrier you’re about to quote.',
  points: [
    'USDOT, MC or name, in one search box',
    'A carrier you haven’t looked up before loads in a few seconds',
    'Every result opens the carrier’s full page, tab by tab',
  ],
  visual: 'search',
})

const LINKED = (who: 'broker' | 'agent'): TourSection => ({
  id: 'linked',
  nav: 'Linked carriers',
  title: (
    <>
      Who it’s <Accent>connected to</Accent>
    </>
  ),
  lead:
    who === 'broker'
      ? 'The checks a fraud screen runs, on one tab, each with how it’s usually resolved.'
      : 'Other carriers sharing its contact details, and the registration gaps that point to risk.',
  points: [
    'What a broker’s check may flag, each with how it’s usually resolved',
    'Registration health: stale MCS-150, missing BOC-3 and similar gaps',
    'Other carriers sharing its phone, email or address',
    'Its identity and ownership history',
  ],
  note: 'A shared detail is a reason to ask, not a finding: fleets under one owner and shared offices are common.',
  visual: 'linked',
})

const CHAMELEON: TourSection = {
  id: 'chameleon',
  nav: 'Chameleon check',
  title: (
    <>
      Spot a carrier that <Accent>re-registered</Accent>
    </>
  ),
  lead: 'Signs that a carrier came back under a new name and USDOT number to leave a revocation or out-of-service order behind.',
  points: [
    'A link to a prior revocation on record',
    'Fleet overlap with other carriers, against the level some vetting tools flag',
    'USDOT numbers linked by shared DUNS, phones, email, addresses or VINs',
    'Each linked carrier’s revocations and out-of-service orders',
    'Tax ID (EIN) compared behind the scenes and never shown',
  ],
  note: 'It shows links, not a verdict, and lists the innocent explanations next to them.',
  visual: 'chameleon',
}

const COMPARE = (who: 'broker' | 'agent'): TourSection => ({
  id: 'compare',
  nav: 'Compare',
  title: (
    <>
      Up to three, <Accent>side by side</Accent>
    </>
  ),
  lead:
    who === 'broker'
      ? 'Line up the carriers bidding on a load and see the best value on each line.'
      : 'Line up carriers on one screen and see the best value on each line.',
  points: [
    'Operating authority and its age, liability insurance and the next expected renewal',
    'Estimated ISS and safety categories over threshold',
    'Vehicle and driver out-of-service rates, crashes and roadside inspections',
    'Safety rating, fleet, where it’s based and what a broker’s check would flag',
  ],
  visual: 'compare',
})

const PLAN_FAQ = [
  {
    q: 'What does it cost?',
    a: 'Every new account is free for 30 days from sign-up. After that it’s $49 a month.',
  },
  {
    q: 'Can I cancel?',
    a: 'Any time, from your portal. You keep access until the end of the month you’ve paid for.',
  },
  {
    q: 'Is the Estimated ISS FMCSA’s official score?',
    a: 'No. It’s Carrier Safety Scan’s estimate, worked out FMCSA’s published way. It isn’t FMCSA’s official score or a safety rating.',
  },
  {
    q: 'Does it work on a phone?',
    a: 'Yes. Every page of the portal works on a phone as well as on a computer.',
  },
]

export const TOURS: Record<Audience, Tour> = {
  carrier: {
    eyebrow: 'The carrier portal',
    title: (
      <>
        Your carrier portal, <Accent>page by page</Accent>
      </>
    ),
    text: 'Everything you get when you sign up with your USDOT number: your carrier the way a broker’s check sees it, what to fix, and the team that can fix it with you.',
    signUp: { label: 'Create a carrier account', to: '/register' },
    sections: [
      {
        id: 'home',
        nav: 'Home',
        title: (
          <>
            Your carrier <Accent>right now</Accent>
          </>
        ),
        lead: 'The first thing you see when you log in: where your carrier stands and what needs attention.',
        points: [
          'Your Estimated ISS safety score and the reason behind it',
          'The top things a broker’s check would flag, each with “Fix with Sky”',
          'Vehicle and driver out-of-service rates against the national average',
          'Registration checks at a glance, and all your carriers in one list',
        ],
        visual: 'home',
      },
      OVERVIEW('your'),
      AUTHORITY,
      INSPECTIONS('your'),
      EQUIPMENT,
      {
        id: 'brokers',
        nav: 'How brokers see you',
        title: (
          <>
            How brokers <Accent>see you</Accent>
          </>
        ),
        lead: 'The items broker vetting tools usually flag, before a broker sees them, each with how it’s usually resolved.',
        points: [
          'What a broker’s check may flag, with the usual fix for each',
          'Registration health: MCS-150 update, BOC-3 and similar filings',
          'Other carriers sharing your phone, email or address',
          'Your identity and ownership history',
          '“Fix it with Sky Transport Solutions” on each item, with the details filled in for you',
        ],
        visual: 'brokers',
      },
      REPORT('to send brokers and shippers before they ask'),
      {
        id: 'dataqs',
        nav: 'DataQs',
        title: (
          <>
            Challenge a <Accent>wrong record</Accent>
          </>
        ),
        lead: 'When an inspection or violation on your record is wrong, Sky Transport Solutions files the DataQs challenge for you.',
        points: [
          'Pick the inspection, then the whole inspection or the violations that are wrong',
          'Say what’s wrong: wrong carrier, wrong driver, a duplicate, a dismissed citation and more',
          'Add your evidence, approve the package, and follow the case to the decision',
          'Messages from STS, deadlines and every status in one place',
          '$50 per inspection challenged, paid online',
        ],
        note: 'The agency that reviews the record makes the final decision.',
        visual: 'dataqs',
      },
      {
        id: 'compliance',
        nav: 'Compliance',
        title: (
          <>
            Compliance services, <Accent>one click away</Accent>
          </>
        ),
        lead: 'Your authority and registrations checked, and the services you need ordered from the same page.',
        points: [
          'DOT/MC authority and UCR registration status, plus California MCP for California carriers',
          'Drug & alcohol consortium, driver qualification files, MVRs and background checks',
          'Certificate of good standing',
          'Pay online by card where the service has a set price; otherwise STS contacts you',
        ],
        visual: 'compliance',
      },
      HISTORY,
    ],
    faqs: [
      ...PLAN_FAQ,
      {
        q: 'Who files my DataQs challenge?',
        a: 'Sky Transport Solutions prepares and files it with you, for $50 per inspection. You approve the package first, and the agency reviewing the record decides.',
      },
      {
        q: 'Can I pay Sky Transport Solutions invoices in the portal?',
        a: 'Yes. Your invoices are in the portal, with a PDF to download and a button to pay online.',
      },
    ],
  },

  broker: {
    eyebrow: 'The broker portal',
    title: (
      <>
        Your broker portal, <Accent>page by page</Accent>
      </>
    ),
    text: 'Everything you get when you sign up with your MC number: any carrier, vetted on one page before you give it a load.',
    signUp: { label: 'Create a broker account', to: '/broker/register' },
    sections: [
      SEARCH('broker'),
      {
        id: 'booking',
        nav: 'Booking check',
        title: (
          <>
            A booking check on <Accent>every carrier</Accent>
          </>
        ),
        lead: 'At the top of each carrier’s page: Ready to book, Book with review, High risk or Do not book, with the reasons.',
        points: [
          'Stops: authority not active, a revocation pending, an out-of-service order, an Unsatisfactory rating or too little liability',
          'Major items, such as a Conditional rating or out-of-service rates twice the national average',
          'Minor items, such as authority under six months or a renewal due within 30 days',
          'Strengths: authority held 3+ years, a Satisfactory rating, $1M+ liability',
        ],
        note: 'The booking check helps you decide; it isn’t a safety rating or a guarantee.',
        visual: 'booking',
      },
      OVERVIEW('a'),
      AUTHORITY,
      INSPECTIONS('a'),
      EQUIPMENT,
      LINKED('broker'),
      CHAMELEON,
      COMPARE('broker'),
      REPORT('to keep with the load and show what you checked and when'),
      HISTORY,
    ],
    faqs: [
      ...PLAN_FAQ,
      {
        q: 'Do I need broker authority to sign up?',
        a: 'Yes. You sign up with your MC (or USDOT) number, and your broker authority is confirmed before the portal opens.',
      },
      {
        q: 'Does the booking check replace my own vetting?',
        a: 'No. It reads the record the same way every time and shows its reasons, but it isn’t a safety rating or a guarantee.',
      },
    ],
  },

  agent: {
    eyebrow: 'The insurance agent portal',
    title: (
      <>
        Your agent portal, <Accent>page by page</Accent>
      </>
    ),
    text: 'Everything you get when you sign up with your National Producer Number: any carrier’s filings, safety record and fleet, before you quote it.',
    signUp: { label: 'Create an agent account', to: '/insurance/register' },
    sections: [
      SEARCH('agent'),
      AUTHORITY,
      INSPECTIONS('a'),
      OVERVIEW('a'),
      EQUIPMENT,
      LINKED('agent'),
      CHAMELEON,
      COMPARE('agent'),
      REPORT('to keep in the quote file'),
      HISTORY,
    ],
    faqs: [
      ...PLAN_FAQ,
      {
        q: 'Do I need an MC number to sign up?',
        a: 'No. Insurance agents sign up with their National Producer Number (NPN).',
      },
    ],
  },
}
