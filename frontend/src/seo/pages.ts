/*
 * What Google (and the browser tab) shows for each page: its title and the description under it in
 * search results. Public pages only: no data-source names or prices, as on the pages themselves.
 *
 * `index: true` pages are listed in sitemap.xml (built by vite.config.ts from this file). Portal
 * and account pages are kept out of search in robots.txt.
 */

export type PageMeta = {
  title: string
  description: string
  /** In sitemap.xml */
  index?: boolean
}

export const SITE_NAME = 'Carrier Safety Scan'

export const DEFAULT_DESCRIPTION =
  'See any trucking company’s authority, insurance, inspections and safety record in plain English. Built by Sky Transport Solutions for carriers, freight brokers and insurance agents.'

export const PAGES: Record<string, PageMeta> = {
  '/': {
    title: 'Carrier Safety Scan | Carrier safety checks for carriers, brokers and insurance agents',
    description: DEFAULT_DESCRIPTION,
    index: true,
  },
  '/for-carriers': {
    title: 'For carriers: see your record the way brokers do | Carrier Safety Scan',
    description:
      'Check your authority, insurance, inspections and estimated safety score, see what to fix first, and have Sky Transport Solutions challenge wrong violations through DataQs.',
    index: true,
  },
  '/for-brokers': {
    title: 'Carrier vetting for freight brokers | Carrier Safety Scan',
    description:
      'Vet any carrier before you book the load: authority, insurance, safety record, linked carriers and a chameleon check, with up to 3 carriers compared side by side.',
    index: true,
  },
  '/for-insurance-agents': {
    title: 'Trucking carrier checks for insurance agents | Carrier Safety Scan',
    description:
      'Review a trucking company’s filings, safety record, crashes and fleet by VIN before you quote, with a carrier map by state and county.',
    index: true,
  },
  '/for-carriers/portal': {
    title: 'The carrier portal, page by page | Carrier Safety Scan',
    description:
      'Everything a carrier gets with Carrier Safety Scan: your record the way a broker’s check sees it, what to fix, the Safety Score Report and DataQs challenges filed for you.',
    index: true,
  },
  '/for-brokers/portal': {
    title: 'The broker portal, page by page | Carrier Safety Scan',
    description:
      'Everything a freight broker gets with Carrier Safety Scan: a booking check on any carrier, linked carriers, the chameleon check, Compare and the carrier map.',
    index: true,
  },
  '/for-insurance-agents/portal': {
    title: 'The insurance agent portal, page by page | Carrier Safety Scan',
    description:
      'Everything an insurance agent gets with Carrier Safety Scan: any carrier’s filings, safety record, crashes and fleet, before you quote it.',
    index: true,
  },
  '/try': {
    title: 'Free carrier search by USDOT, MC number or name | Carrier Safety Scan',
    description:
      'Look up any trucking company by USDOT number, MC number or company name and see its safety snapshot in plain English. No account needed.',
    index: true,
  },
  '/contact': {
    title: 'Contact Sky Transport Solutions | Carrier Safety Scan',
    description:
      'Talk to a Sky Transport Solutions specialist about Carrier Safety Scan, DataQs challenges or trucking compliance. Offices in Tracy, California and Lewisville, Texas. Call (800) 498-9820.',
    index: true,
  },
  '/methodology': {
    title: 'How the Estimated ISS score works | Carrier Safety Scan',
    description:
      'How Carrier Safety Scan estimates a carrier’s Inspection Selection System (ISS) score, what moves it, and what it can and can’t tell you.',
    index: true,
  },
  '/sources': {
    title: 'Sources | Carrier Safety Scan',
    description: 'The public records Carrier Safety Scan reads, and where each one comes from.',
    index: true,
  },
  '/login': {
    title: 'Carrier log in | Carrier Safety Scan',
    description: 'Log in to your Carrier Safety Scan carrier portal.',
  },
  '/register': {
    title: 'Create a carrier account | Carrier Safety Scan',
    description: 'Sign up with your USDOT number to see your carrier the way brokers do.',
  },
  '/broker/login': {
    title: 'Broker log in | Carrier Safety Scan',
    description: 'Log in to your Carrier Safety Scan broker portal.',
  },
  '/broker/register': {
    title: 'Create a broker account | Carrier Safety Scan',
    description: 'Sign up with your MC number to vet any carrier before you book the load.',
  },
  '/insurance/login': {
    title: 'Insurance agent log in | Carrier Safety Scan',
    description: 'Log in to your Carrier Safety Scan insurance agent portal.',
  },
  '/insurance/register': {
    title: 'Create an insurance agent account | Carrier Safety Scan',
    description:
      'Sign up with your National Producer Number to check any carrier before you quote.',
  },
  '/team/login': {
    title: 'STS team log in | Carrier Safety Scan',
    description: 'Sky Transport Solutions staff log in.',
  },
  '/forgot-password': {
    title: 'Reset your password | Carrier Safety Scan',
    description: 'Get a link to set a new Carrier Safety Scan password.',
  },
  '/reset-password': {
    title: 'Set a new password | Carrier Safety Scan',
    description: 'Set a new Carrier Safety Scan password.',
  },
  '/verify-email': {
    title: 'Confirm your email | Carrier Safety Scan',
    description: 'Confirm your email address for Carrier Safety Scan.',
  },
}

/** Pages that aren't listed above, by the start of their address. */
const SECTIONS: [prefix: string, title: string][] = [
  ['/try/', 'Carrier snapshot'],
  ['/c/', 'Carrier'],
  ['/portal', 'Carrier portal'],
  ['/broker', 'Broker portal'],
  ['/dashboard', 'Dashboard'],
  ['/search', 'Search'],
  ['/compare', 'Compare'],
  ['/carriers/', 'Carrier'],
  ['/dataqs', 'DataQs'],
  ['/accounts', 'Accounts'],
  ['/service-requests', 'Service requests'],
  ['/invoices', 'Invoices'],
  ['/high-iss', 'High Safety Score'],
]

/** The title and description for an address; unknown public addresses are "Page not found". */
export function metaFor(pathname: string): PageMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (PAGES[path]) return PAGES[path]
  const section = SECTIONS.find(([prefix]) => path.startsWith(prefix))
  if (section) return { title: `${section[1]} | ${SITE_NAME}`, description: DEFAULT_DESCRIPTION }
  return { title: `Page not found | ${SITE_NAME}`, description: DEFAULT_DESCRIPTION }
}

/** Addresses in sitemap.xml. */
export const SITEMAP_PATHS = Object.entries(PAGES)
  .filter(([, meta]) => meta.index)
  .map(([path]) => path)

/** Kept out of search engines (robots.txt): portals, accounts, staff pages and the API. */
export const ROBOTS_DISALLOW = [
  '/api/',
  '/portal',
  '/broker',
  '/dashboard',
  '/search',
  '/compare',
  '/carriers/',
  '/dataqs',
  '/accounts',
  '/service-requests',
  '/invoices',
  '/high-iss',
  '/try/',
  '/c/',
  '/register/google',
  '/reset-password',
  '/verify-email',
]
