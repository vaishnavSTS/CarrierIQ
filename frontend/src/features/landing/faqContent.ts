import type { Audience } from '../audience/audience'
import type { FaqItem } from './Faq'

/*
 * The public pages' questions. Rules for these answers (as for the rest of the public pages): no
 * price, no wording about where the data comes from, only what the app does today, and the
 * Estimated ISS always described as an estimate, not FMCSA's official score.
 */

const OFFICIAL_SCORE: FaqItem = {
  q: 'Is the Estimated ISS FMCSA’s official score?',
  a: 'No. It’s Carrier Safety Scan’s estimate, worked out FMCSA’s published way. It isn’t FMCSA’s official score or a safety rating, and Carrier Safety Scan and Sky Transport Solutions aren’t part of FMCSA. The “How the Estimated ISS works” page explains how it’s calculated.',
}

const TRIAL: FaqItem = {
  q: 'Is there a free trial?',
  a: 'Yes. Every new account is free for 30 days from sign-up, no card is needed to start, and you can cancel any time from your portal.',
}

const PHONE: FaqItem = {
  q: 'Does it work on a phone?',
  a: 'Yes. Every page works on a phone as well as on a computer.',
}

/** The front door (/). */
export const CHOOSER_FAQ: FaqItem[] = [
  {
    q: 'What is Carrier Safety Scan?',
    a: 'A web app from Sky Transport Solutions that shows a trucking company’s authority, insurance, safety record and red flags on one page, the way a broker’s check reads them. It’s built for carriers, freight brokers and insurance agents.',
  },
  {
    q: 'Which option should I choose?',
    a: 'Choose carrier if you run a trucking company with its own USDOT number, freight broker if you book loads with carriers, and insurance agent if you quote trucking insurance. Each opens a page about what Carrier Safety Scan does for you.',
  },
  {
    q: 'Can I try it before signing up?',
    a: 'Yes. One free search, with no account needed, opens a carrier’s full page. After that, a new account is free for 30 days.',
  },
  TRIAL,
  OFFICIAL_SCORE,
  {
    q: 'Who is behind Carrier Safety Scan?',
    a: 'Sky Transport Solutions, a trucking compliance company founded in 2013 and based in Tracy, California. You can reach a specialist at (800) 498-9820, Monday to Friday, 9:00 AM to 5:30 PM Pacific.',
  },
]

/** Each audience page (/for-carriers, /for-brokers, /for-insurance-agents). */
export const AUDIENCE_FAQ: Record<Audience, FaqItem[]> = {
  carrier: [
    {
      q: 'What will I see about my company?',
      a: 'Your authority, insurance and BOC-3, your inspections and violations, your CSA safety categories and Estimated ISS, registration checks such as a late MCS-150 update, and any other carriers sharing your phone, email or address: what a broker’s check would see.',
    },
    {
      q: 'How do I sign up?',
      a: 'With your company name, mobile number and USDOT number, or continue with Google. Your portal opens right away.',
    },
    {
      q: 'Can you remove a violation from my record?',
      a: 'Only when it was cited by mistake. Sky Transport Solutions prepares and files a DataQs challenge with you, and the agency that reviews the record decides. If the challenge is accepted, the violation is removed and stops counting.',
    },
    {
      q: 'What does a DataQs challenge cost?',
      a: '$50 per inspection you challenge. You approve the package before it’s filed, and you follow the case in your portal.',
    },
    {
      q: 'Will my score get better on its own?',
      a: 'Violations count for less as they get older and stop counting after 24 months. Your carrier page shows which ones weigh most and when they drop off.',
    },
    {
      q: 'Can I send my report to brokers?',
      a: 'Yes. Download your dated Safety Score Report as a PDF and send it to brokers and shippers.',
    },
    OFFICIAL_SCORE,
    TRIAL,
  ],
  broker: [
    {
      q: 'What does the booking check look at?',
      a: 'Operating authority, insurance on file, out-of-service orders, the safety record and registration problems, plus fraud red flags such as a phone or address shared with other carriers. Each carrier gets one of four grades: Ready to book, Book with review, High risk or Do not book, with the reasons.',
    },
    {
      q: 'Does the booking check replace my own vetting?',
      a: 'No. It reads the record the same way every time and shows its reasons, but it isn’t a safety rating or a guarantee, and the booking decision is yours.',
    },
    {
      q: 'What is the Chameleon check?',
      a: 'It looks for signs that a carrier was re-registered under a new USDOT number to leave its old record behind: other USDOT numbers sharing its details or trucks, and what happened to them.',
    },
    {
      q: 'Do I need broker authority to sign up?',
      a: 'Yes. You sign up with your MC (or USDOT) number, and your broker authority is confirmed before your portal opens.',
    },
    {
      q: 'Can I compare carriers?',
      a: 'Yes. Put up to 3 carriers side by side to weigh them for a load.',
    },
    {
      q: 'Can I keep a record of what I checked?',
      a: 'Yes. Save a dated Safety Score Report on the carrier you booked, so your file shows what the record said and when.',
    },
    OFFICIAL_SCORE,
    TRIAL,
  ],
  agent: [
    {
      q: 'Do I need an MC number to sign up?',
      a: 'No. Insurance agents sign up with their agency and National Producer Number (NPN).',
    },
    {
      q: 'What insurance details can I see?',
      a: 'The liability (BI&PD), cargo and bond filings on file against what FMCSA requires, each current policy’s insurer and dates, the filing history, and an expected renewal month. The renewal month is an estimate from past filing dates, since no official renewal date is published.',
    },
    {
      q: 'Can I see the crash and inspection record?',
      a: 'Yes. Crashes and inspections over the last 24 months, out-of-service rates against the national average, the CSA safety categories and the Estimated ISS.',
    },
    {
      q: 'Can I check the trucks in a fleet?',
      a: 'Yes. You see the trucks and trailers found on its inspections, with each VIN decoded into make, model and year, and any VIN also seen under another USDOT number.',
    },
    {
      q: 'Does it tell me whether to write the policy?',
      a: 'No. It shows what the record says and flags what usually needs a closer look. The underwriting decision stays with you.',
    },
    {
      q: 'Can I keep the record with my quote?',
      a: 'Yes. Download a dated Safety Score Report to keep in the file, so it shows what you checked and when.',
    },
    OFFICIAL_SCORE,
    TRIAL,
  ],
}

/** The free search (/try). */
export const TRY_FAQ: FaqItem[] = [
  {
    q: 'What does the free search show?',
    a: 'One carrier’s full page, every tab: authority and insurance, inspections, equipment, linked carriers and its Safety Score Report.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. The free search needs no account and no card.',
  },
  {
    q: 'How many free searches do I get?',
    a: 'One, one time only. A search that finds nothing, or a list of matches you haven’t opened yet, doesn’t use it; opening a carrier does.',
  },
  {
    q: 'Can I search by MC number or company name?',
    a: 'Yes. A USDOT number opens the carrier straight away. An MC number or a company name lists up to 10 matches first, so you can pick the right one.',
  },
  {
    q: 'What happens after my free search?',
    a: 'Create an account to keep going. Every new account is free for 30 days, with no card needed to start.',
  },
  PHONE,
]

/** How the Estimated ISS works (/methodology). */
export const METHODOLOGY_FAQ: FaqItem[] = [
  {
    q: 'Is a higher number better or worse?',
    a: 'Worse. The Estimated ISS runs from 1 to 100 and lower is better. A carrier under an active out-of-service order is at 100.',
  },
  {
    q: 'Why could my estimate differ from FMCSA’s value?',
    a: 'FMCSA doesn’t publish the value, its current method may differ from the published one we follow, investigation results and FMCSA’s random selections aren’t public, and a fleet that changed recently may be ranked against different carriers.',
  },
  {
    q: 'How can I lower my Estimated ISS?',
    a: 'Fewer violations over time: older violations count for less and stop counting after 24 months. A violation cited by mistake can be challenged through DataQs, and if the challenge is accepted it stops counting.',
  },
  {
    q: 'Is it a safety rating?',
    a: 'No. FMCSA’s safety ratings (Satisfactory, Conditional, Unsatisfactory) come from its own reviews. The Estimated ISS is an estimate of the value FMCSA uses to pick carriers for roadside inspection.',
  },
]
