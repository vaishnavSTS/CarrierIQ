import {
  FileText,
  Fingerprint,
  Gauge,
  Network,
  ScrollText,
  Truck,
  type LucideIcon,
} from 'lucide-react'

/** A carrier profile tab an insurance agent checks before quoting, and what it answers. */
export interface ChecklistItem {
  /** The profile tab's id (?tab=…) */
  tab: string
  /** The tab's label on the carrier page */
  label: string
  icon: LucideIcon
  question: string
  /** What the tab shows */
  shows: string[]
  /** How to read it */
  howTo: string[]
}

/**
 * The carrier tabs insurance agents get (CarrierProfilePage BROKER_TABS), in the order an
 * underwriting review usually goes. Every line describes what the tab really shows.
 */
export const CHECKLIST: ChecklistItem[] = [
  {
    tab: 'authority',
    label: 'Authority & Insurance',
    icon: ScrollText,
    question: 'Is the authority active, and is the right coverage on file?',
    shows: [
      'Each MC, MX or FF docket: its status, any revocation pending, and when it was granted',
      'Liability insurance (BI&PD) required next to on file, flagged when it is below; cargo and bond',
      'Filings on file with insurer, policy, coverage and any cancellation date, plus past filings and how they ended',
      'Expected renewal: an estimate from past filing dates, since FMCSA publishes no renewal date',
    ],
    howTo: [
      'Compare the BI&PD on file with what FMCSA requires for the carrier’s authority.',
      'A cancellation date means the insurer has told FMCSA the policy ends on that date. FMCSA needs a replacement filing before then, or it revokes the authority.',
      'FMCSA does not record when the policy itself expires: that date is on the carrier’s certificate of insurance.',
    ],
  },
  {
    tab: 'safety',
    label: 'Inspections',
    icon: Gauge,
    question: 'How does the safety record look?',
    shows: [
      'Vehicle and driver out-of-service rates next to FMCSA’s national averages',
      'Crashes in the last 24 months from FMCSA’s Crash File',
      'CSA BASIC measures and violations from FMCSA SMS',
      'Estimated ISS: Carrier Safety Scan’s estimate by FMCSA’s published method, not FMCSA’s official score',
    ],
    howTo: [
      'Start with the out-of-service table: a rate above the national average is worth a question.',
      'The Crash File does not record fault, so crash involvement alone does not mean the carrier caused it.',
      'The Estimated ISS card shows its band, why, and each safety category (BASIC) against FMCSA’s threshold.',
    ],
  },
  {
    tab: 'equipment',
    label: 'Equipment',
    icon: Truck,
    question: 'Does the fleet match what you are scheduling?',
    shows: [
      'Power units registered on the MCS-150 next to the power units seen on inspections',
      'Every VIN seen on inspections, decoded by NHTSA into make, model and year',
      'VINs also seen under other USDOT numbers, and VINs that were probably mistyped',
    ],
    howTo: [
      'Check the trucks on the schedule against the VINs seen on inspections.',
      'Fewer trucks seen than registered is normal: not every truck gets inspected. More can mean the fleet grew since the last MCS-150, or trucks are leased or replaced.',
      'A VIN under another USDOT number is common when trucks change hands; it is worth knowing, not a problem by itself.',
    ],
  },
  {
    tab: 'network',
    label: 'Linked carriers',
    icon: Network,
    question: 'Who else is connected to this carrier?',
    shows: [
      'Other carriers sharing its phone, email, address or other details in FMCSA’s census',
      'Registration checks, and recent changes to its census details',
      'Authority transfers and renumbering',
    ],
    howTo: [
      'A shared detail is a relationship to review, not a finding: related companies and shared offices are common.',
      'Recent changes to name, address or contacts are worth asking about before you quote.',
    ],
  },
  {
    tab: 'chameleon',
    label: 'Chameleon check',
    icon: Fingerprint,
    question: 'Is this an operation that re-registered?',
    shows: [
      'Other USDOT numbers sharing this carrier’s identity details or trucks',
      'What happened to them: revocations and out-of-service orders',
      'How long after that this carrier was added, and FMCSA’s own prior-revocation link',
    ],
    howTo: [
      'A chameleon carrier re-registers under a new name and USDOT number to leave a revocation or out-of-service order behind.',
      'The check reports what FMCSA’s records show; it is never a verdict. Weigh it with the rest of the file.',
    ],
  },
  {
    tab: 'safety-score-report',
    label: 'Safety Score Report',
    icon: FileText,
    question: 'What goes in the underwriting file?',
    shows: [
      'A dated, sourced summary of the carrier’s FMCSA record',
      'Authority, liability insurance (BI&PD), safety scores, inspections and linked carriers in one document',
    ],
    howTo: [
      'Open the tab and choose Download / Save as PDF.',
      'Keep it with the submission, so you can show what the record said on the day you quoted.',
    ],
  },
]
