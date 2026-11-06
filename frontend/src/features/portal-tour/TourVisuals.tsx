import {
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  CircleX,
  ClipboardList,
  Columns3,
  FileText,
  Gauge,
  History,
  Link2,
  ScanSearch,
  Search,
  ShieldCheck,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import reportPage from '../../assets/report-sample-1.webp'
import type { VisualKey } from './tourContent'

/**
 * The sample screens beside each part of a portal page. Every one is a made-up carrier, labelled
 * SAMPLE; national out-of-service averages are FMCSA's published figures (as on the landing page).
 */

const ease = [0.16, 1, 0.3, 1] as const
const appear = (i: number) => ({
  initial: { opacity: 0, x: 14 },
  whileInView: { opacity: 1, x: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, delay: 0.1 + i * 0.12, ease },
})

type Tone = 'ok' | 'warn' | 'bad' | 'info'
const TONE_ICON: Record<Tone, [LucideIcon, string]> = {
  ok: [CircleCheck, 'text-emerald-600'],
  warn: [AlertTriangle, 'text-amber-600'],
  bad: [CircleX, 'text-red-600'],
  info: [CircleCheck, 'text-slate-400'],
}
const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-slate-500',
  warn: 'text-amber-700',
  bad: 'text-red-700',
  info: 'text-slate-500',
}

function Card({
  icon: Icon,
  label,
  children,
  footer,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-violet-500/15 to-sky-500/10 blur-2xl"
      />
      <div className="relative rounded-2xl border border-slate-200 bg-surface p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">EXAMPLE FREIGHT LLC</div>
            <div className="font-mono text-xs text-slate-500">USDOT 0000000 · MC 000000</div>
          </div>
          <span className="rounded-md border border-slate-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Sample
          </span>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </div>
        <div className="mt-3">{children}</div>
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </div>
  )
}

function Rows({ rows }: { rows: [Tone, string, string][] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map(([tone, label, detail], i) => {
        const [Icon, color] = TONE_ICON[tone]
        return (
          <motion.li key={label} {...appear(i)} className="flex items-center gap-3 py-2.5">
            <Icon className={`size-4 shrink-0 ${color}`} aria-hidden />
            <span className="flex-1 text-sm text-slate-800">{label}</span>
            <span className={`text-right text-xs ${TONE_TEXT[tone]}`}>{detail}</span>
          </motion.li>
        )
      })}
    </ul>
  )
}

function Note({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: ReactNode }) {
  const styles = {
    ok: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    info: 'bg-sky-50 text-sky-700',
  }
  return <div className={`rounded-lg px-3 py-2 text-xs ${styles[tone]}`}>{children}</div>
}

function RateBar({ label, rate, national }: { label: string; rate: number; national: number }) {
  const scale = (v: number) => `${Math.min(v / 30, 1) * 100}%`
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-800">{label}</span>
        <span className="text-xs text-slate-500">
          <span className="font-semibold text-slate-900">{rate}%</span> · national {national}%
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-slate-100">
        <motion.div
          className="h-2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700"
          initial={{ width: 0 }}
          whileInView={{ width: scale(rate) }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2, ease }}
        />
        <div
          className="absolute -top-1 h-4 w-0.5 rounded bg-slate-500"
          style={{ left: scale(national) }}
        />
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  tone = 'ok',
}: {
  label: string
  value: string
  sub: string
  tone?: Tone
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-canvas p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
      <div className={`text-xs ${TONE_TEXT[tone]}`}>{sub}</div>
    </div>
  )
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-cta px-2 py-0.5 text-[11px] font-medium text-cta-ink">
      {children}
    </span>
  )
}

function HomeVisual() {
  return (
    <Card icon={Gauge} label="Your carrier right now">
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-canvas p-3">
        <div className="grid size-16 shrink-0 place-items-center rounded-full border-4 border-emerald-500 text-xl font-semibold text-slate-900">
          42
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Estimated ISS · Satisfactory</div>
          <div className="text-xs text-slate-500">Driven mostly by Vehicle Maintenance</div>
        </div>
      </div>
      <div className="mt-4 text-xs font-medium text-slate-500">
        What a broker’s check would flag
      </div>
      <ul className="mt-1 divide-y divide-slate-100">
        {['MCS-150 over 2 years old', 'Phone shared with 1 other carrier'].map((flag, i) => (
          <motion.li key={flag} {...appear(i)} className="flex items-center gap-3 py-2.5">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
            <span className="flex-1 text-sm text-slate-800">{flag}</span>
            <Pill>Fix with Sky</Pill>
          </motion.li>
        ))}
      </ul>
      <div className="mt-3 space-y-4">
        <RateBar label="Vehicle out-of-service" rate={14.8} national={22.3} />
        <RateBar label="Driver out-of-service" rate={3.2} national={6.7} />
      </div>
    </Card>
  )
}

function OverviewVisual() {
  return (
    <Card icon={Gauge} label="Overview">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Estimated ISS" value="42" sub="Satisfactory" />
        <Tile label="Authority" value="Active" sub="Common · 6 years" />
        <Tile label="Registration" value="Updated" sub="MCS-150 within 2 years" />
        <Tile label="Insurance" value="On file" sub="Liability and cargo" />
      </div>
      <div className="mt-3">
        <Rows
          rows={[
            ['info', 'Operation', 'Interstate · for hire'],
            ['info', 'Fleet on the MCS-150', '12 trucks · 14 drivers'],
          ]}
        />
      </div>
    </Card>
  )
}

const VISUALS: Record<VisualKey, () => ReactNode> = {
  home: HomeVisual,
  overview: OverviewVisual,
  authority: () => (
    <Card
      icon={ShieldCheck}
      label="Authority & insurance"
      footer={<Note tone="info">The renewal month is an estimate from past filings.</Note>}
    >
      <Rows
        rows={[
          ['ok', 'MC 000000 · common', 'Active · 6 years'],
          ['ok', 'Liability (BI&PD)', '$1,000,000 · $750,000 required'],
          ['ok', 'Cargo', '$100,000 on file'],
          ['ok', 'Process agent (BOC-3)', 'On file'],
          ['info', 'Expected renewal', 'Around March'],
        ]}
      />
    </Card>
  ),
  inspections: () => (
    <Card
      icon={ClipboardList}
      label="Inspections · last 24 months"
      footer={<Note tone="ok">Below the national average on both, counted FMCSA’s way.</Note>}
    >
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Inspections" value="31" sub="27 vehicle" />
        <Tile label="Crashes" value="1" sub="No fatalities" />
        <Tile label="Rating" value="None" sub="Not rated" tone="info" />
      </div>
      <div className="mt-4 space-y-4">
        <RateBar label="Vehicle out-of-service" rate={14.8} national={22.3} />
        <RateBar label="Driver out-of-service" rate={3.2} national={6.7} />
      </div>
    </Card>
  ),
  equipment: () => (
    <Card icon={Truck} label="Equipment · 24 months">
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">VIN</th>
              <th className="px-3 py-2 font-medium">Vehicle</th>
              <th className="px-3 py-2 text-right font-medium">Inspections</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {[
              ['•••••••4521', '2019 Truck · Class 8', '6'],
              ['•••••••0388', '2021 Truck · Class 8', '4'],
              ['•••••••7710', '2017 Van trailer', '5'],
            ].map(([vin, vehicle, n], i) => (
              <motion.tr key={vin} {...appear(i)}>
                <td className="px-3 py-2 font-mono">{vin}</td>
                <td className="px-3 py-2">{vehicle}</td>
                <td className="px-3 py-2 text-right">{n}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Rows rows={[['ok', 'VINs under other USDOT numbers', 'None found']]} />
      </div>
    </Card>
  ),
  brokers: () => (
    <Card
      icon={Link2}
      label="How brokers see you"
      footer={<Note tone="warn">2 items to look at, each with what usually resolves it.</Note>}
    >
      <Rows
        rows={[
          ['warn', 'MCS-150 update', 'Over 2 years old'],
          ['warn', 'Shared phone number', '1 other carrier'],
          ['ok', 'Process agent (BOC-3)', 'On file'],
          ['ok', 'Same email or address', 'None found'],
        ]}
      />
      <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-canvas px-3 py-2 text-xs text-slate-700">
        Usually resolved by a company update (MCS-150)
        <Pill>
          Fix with Sky <ArrowRight className="size-3" aria-hidden />
        </Pill>
      </div>
    </Card>
  ),
  linked: () => (
    <Card
      icon={Link2}
      label="Linked carriers"
      footer={<Note tone="info">A link has to be explained, not assumed.</Note>}
    >
      <Rows
        rows={[
          ['warn', 'Same phone number', '1 other carrier'],
          ['ok', 'Same email', 'None found'],
          ['ok', 'Same address', 'None found'],
          ['warn', 'MCS-150 update', 'Over 2 years old'],
          ['ok', 'Process agent (BOC-3)', 'On file'],
        ]}
      />
    </Card>
  ),
  chameleon: () => (
    <Card
      icon={ScanSearch}
      label="Chameleon check"
      footer={<Note tone="ok">No sign it re-registered to leave a revocation behind.</Note>}
    >
      <Rows
        rows={[
          ['ok', 'Link to a prior revocation', 'None found'],
          ['ok', 'Fleet overlap with other carriers', '0%'],
          ['ok', 'Shared DUNS or tax ID', 'None found'],
          ['warn', 'Shared phone', '1 USDOT · no revocations'],
        ]}
      />
    </Card>
  ),
  report: () => (
    <div className="relative mx-auto max-w-md">
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-violet-500/20 to-sky-500/10 blur-2xl"
      />
      <motion.div
        initial={{ opacity: 0, rotate: 0, y: 20 }}
        whileInView={{ opacity: 1, rotate: -2, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease }}
        className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <img
          src={reportPage}
          alt="Page one of a sample Safety Score Report for a made-up carrier"
          loading="lazy"
          className="w-full"
        />
      </motion.div>
      <div className="relative -mt-6 flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-cta px-4 py-2 text-sm font-medium text-cta-ink shadow-lg">
          <FileText className="size-4" aria-hidden />
          Save as PDF
        </span>
      </div>
    </div>
  ),
  dataqs: () => (
    <Card icon={Wrench} label="DataQs challenge">
      <ol className="space-y-2">
        {[
          ['The record', 'Inspection on 09/12 · Waco, TX'],
          ['What’s wrong', '1 violation: wrong unit'],
          ['Explain', 'Violation incorrect'],
          ['Review', 'You approve the package'],
        ].map(([step, detail], i) => (
          <motion.li
            key={step}
            {...appear(i)}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-canvas px-3 py-2"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-surface">
              {i + 1}
            </span>
            <span className="text-sm font-medium text-slate-900">{step}</span>
            <span className="ml-auto text-xs text-slate-500">{detail}</span>
          </motion.li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
        {['STS review', 'Awaiting approval', 'With the agency', 'Closed'].map((s, i) => (
          <span
            key={s}
            className={`rounded-full px-2 py-0.5 ${i === 2 ? 'bg-sky-600 font-medium text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            {s}
          </span>
        ))}
      </div>
    </Card>
  ),
  compliance: () => (
    <Card icon={ShieldCheck} label="Compliance">
      <Rows
        rows={[
          ['ok', 'DOT / MC authority', 'Active'],
          ['ok', 'UCR registration', 'Current'],
        ]}
      />
      <ul className="mt-2 space-y-2">
        {['Drug & alcohol consortium', 'Driver qualification files', 'MVR report'].map((s, i) => (
          <motion.li
            key={s}
            {...appear(i + 2)}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-canvas px-3 py-2 text-sm text-slate-800"
          >
            {s}
            <Pill>Order</Pill>
          </motion.li>
        ))}
      </ul>
    </Card>
  ),
  history: () => (
    <Card icon={History} label="History">
      <ol className="relative space-y-3 border-l border-slate-200 pl-5">
        {[
          ['Mar 2026', 'Liability insurance filed', 'ok'],
          ['Jan 2026', 'Phone number changed', 'info'],
          ['Aug 2025', 'Cargo insurance cancelled', 'warn'],
          ['2020', 'Common authority granted', 'ok'],
        ].map(([when, what, tone], i) => (
          <motion.li key={what} {...appear(i)} className="relative">
            <span
              className={`absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full ${tone === 'warn' ? 'bg-amber-500' : tone === 'ok' ? 'bg-emerald-500' : 'bg-slate-400'}`}
            />
            <div className="text-xs text-slate-500">{when}</div>
            <div className="text-sm text-slate-800">{what}</div>
          </motion.li>
        ))}
      </ol>
    </Card>
  ),
  search: () => (
    <Card icon={Search} label="Search">
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-canvas px-3 py-2.5 text-sm text-slate-900">
        <Search className="size-4 text-slate-400" aria-hidden />
        MC 000000
        <span className="ml-auto h-4 w-px animate-pulse bg-slate-400" />
      </div>
      <div className="mt-3">
        <Rows
          rows={[
            ['ok', 'Example Freight LLC', 'USDOT 0000000 · Active'],
            ['ok', 'Example Freight Lines', 'USDOT 0000001 · Active'],
            ['bad', 'Example Freight Inc', 'USDOT 0000002 · Revoked'],
          ]}
        />
      </div>
    </Card>
  ),
  booking: () => (
    <Card icon={ShieldCheck} label="Booking check">
      <div className="mb-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
        Book with review
      </div>
      <Rows
        rows={[
          ['ok', 'Authority held 6 years', 'Strength'],
          ['ok', '$1,000,000 liability on file', 'Strength'],
          ['warn', 'Insurance renewal due in 3 weeks', 'Minor'],
          ['warn', 'Shared phone number', 'Minor'],
        ]}
      />
    </Card>
  ),
  compare: () => (
    <Card icon={Columns3} label="Compare carriers">
      <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
        <div className="grid grid-cols-4 bg-slate-50 font-medium text-slate-500">
          <div className="px-2 py-2" />
          {['Example', 'Sample', 'Demo'].map((n) => (
            <div key={n} className="px-2 py-2 text-slate-900">
              {n}
            </div>
          ))}
        </div>
        {[
          ['Authority', ['6 yrs', '2 yrs', '4 mo'], 0],
          ['Liability', ['$1M', '$750K', '$750K'], 0],
          ['Est. ISS', ['24', '58', '91'], 0],
          ['Vehicle OOS', ['12%', '21%', '34%'], 0],
        ].map(([row, values, best], i) => (
          <motion.div
            key={row as string}
            {...appear(i)}
            className="grid grid-cols-4 border-t border-slate-100 text-slate-800"
          >
            <div className="px-2 py-2 text-slate-500">{row as string}</div>
            {(values as string[]).map((v, j) => (
              <div
                key={j}
                className={`px-2 py-2 ${j === best ? 'bg-emerald-50 font-semibold text-emerald-700' : ''}`}
              >
                {v}
              </div>
            ))}
          </motion.div>
        ))}
      </div>
    </Card>
  ),
}

export function TourVisual({ visual }: { visual: VisualKey }) {
  const Visual = VISUALS[visual]
  return <Visual />
}
