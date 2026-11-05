import { ExternalLink } from 'lucide-react'

/*
 * Every outside source Carrier Safety Scan reads, with links. Reached only from the small
 * "Sources" link on the last line of the footer, so it stays out of the way of the pages' own
 * wording. Keep it in step with the backend's sources (backend/app/core/config.py: the
 * data.transportation.gov dataset IDs and the FMCSA and NHTSA addresses).
 */

type Source = { name: string; href?: string; note?: string }

const dataset = (id: string) => `https://data.transportation.gov/d/${id}`

const GROUPS: { title: string; intro?: string; sources: Source[] }[] = [
  {
    title: 'FMCSA (Federal Motor Carrier Safety Administration)',
    sources: [
      {
        name: 'QCMobile API',
        href: 'https://mobile.fmcsa.dot.gov/qc/services',
        note: 'A carrier’s registration, authority, insurance and safety summary.',
      },
      {
        name: 'SAFER Company Snapshot',
        href: 'https://safer.fmcsa.dot.gov/',
        note: 'Registration and inspection summary, and the UCR registration check.',
      },
      {
        name: 'Safety Measurement System (SMS)',
        href: 'https://ai.fmcsa.dot.gov/SMS/',
        note: 'Safety categories (BASICs), inspections and violations.',
      },
      {
        name: 'DataQs',
        href: 'https://dataqs.fmcsa.dot.gov',
        note: 'Where wrong inspections and violations are challenged.',
      },
      { name: 'FMCSA Portal', href: 'https://portal.fmcsa.dot.gov/login' },
      { name: 'Motus (USDOT registration system)', href: 'https://motus.dot.gov/' },
    ],
  },
  {
    title: 'data.transportation.gov (U.S. Department of Transportation open data)',
    intro: 'FMCSA datasets, read through the site’s public API.',
    sources: [
      { name: 'Company Census File', href: dataset('az4n-8mr2') },
      { name: 'Vehicle Inspection File', href: dataset('fx4q-ay7w') },
      { name: 'Inspections Per Unit (VINs)', href: dataset('wt8s-2hbx') },
      { name: 'Vehicle Inspections and Violations', href: dataset('876r-jsdb') },
      { name: 'Crash File', href: dataset('aayw-vxb3') },
      { name: 'Out of Service Orders', href: dataset('p2mt-9ige') },
      { name: 'SMS AB PassProperty', href: dataset('4y6x-dmck') },
      { name: 'SMS C PassProperty', href: dataset('h9zy-gjn8') },
      { name: 'SMS AB Pass', href: dataset('m3ry-qcip') },
      { name: 'SMS C Pass', href: dataset('h3zn-uid9') },
      { name: 'SMS Input – Violation', href: dataset('8mt8-2mdr') },
      { name: 'SMS Input – Crash', href: dataset('4wxs-vbns') },
      { name: 'SMS Input – Motor Carrier Census', href: dataset('kjg3-diqy') },
      { name: 'Motus Carrier – All With History', href: dataset('inys-ebih') },
      { name: 'Motus AuthHist – All With History', href: dataset('yu5v-wbh6') },
      { name: 'Motus Insur – All With History', href: dataset('c5y8-a4uz') },
      { name: 'Motus InsHist – All With History', href: dataset('3uet-3z4i') },
      { name: 'Motus RevokeSuspend – All With History', href: dataset('wb4f-neki') },
      { name: 'Motus BOC3 – All With History', href: dataset('6snj-ed7q') },
      { name: 'Carrier – All With History (L&I)', href: dataset('6eyk-hxee') },
      { name: 'AuthHist – All With History (L&I)', href: dataset('9mw4-x3tu') },
      { name: 'Insur – All With History (L&I)', href: dataset('ypjt-5ydn') },
      { name: 'InsHist – All With History (L&I)', href: dataset('6sqe-dvqs') },
      { name: 'BOC3 – All With History (L&I)', href: dataset('2emp-mxtb') },
    ],
  },
  {
    title: 'Methods',
    intro: 'The published methods the Estimated ISS and safety percentiles follow.',
    sources: [
      {
        name: 'FMCSA, ISS-CSA Algorithm Description',
        href: 'https://ai.fmcsa.dot.gov/sms/helpfiles/iss_algorithm.pdf',
      },
      {
        name: 'FMCSA, SMS Methodology',
        href: 'https://csa.fmcsa.dot.gov/documents/smsmethodology.pdf',
      },
    ],
  },
  {
    title: 'Other sources',
    sources: [
      {
        name: 'NHTSA vPIC (Vehicle Product Information Catalog)',
        href: 'https://vpic.nhtsa.dot.gov/api/',
        note: 'Decodes the VINs of trucks and trailers seen on inspections.',
      },
      {
        name: 'PrePass weigh-station pull-in rates',
        note: 'Each state’s pull-in rate by ISS range, from the table Sky Transport Solutions shares with its customers.',
      },
      {
        name: 'US Census Bureau state and county boundaries (us-atlas)',
        href: 'https://github.com/topojson/us-atlas',
        note: 'The shapes on the carrier map.',
      },
    ],
  },
]

export function SourcesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Sources</h1>
      <p className="mt-2 text-sm text-slate-600">
        The public records and published methods Carrier Safety Scan reads. Carrier Safety Scan and
        Sky Transport Solutions aren’t part of FMCSA or the U.S. Department of Transportation.
      </p>

      <div className="mt-8 space-y-8">
        {GROUPS.map(({ title, intro, sources }) => (
          <section key={title}>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {intro && <p className="mt-1 text-xs text-slate-500">{intro}</p>}
            <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200 text-sm">
              {sources.map(({ name, href, note }) => (
                <li key={name} className="py-2">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-slate-900 hover:text-accent-strong hover:underline"
                    >
                      {name}
                      <ExternalLink className="size-3.5 text-slate-400" aria-hidden />
                    </a>
                  ) : (
                    <span className="font-medium text-slate-900">{name}</span>
                  )}
                  {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
