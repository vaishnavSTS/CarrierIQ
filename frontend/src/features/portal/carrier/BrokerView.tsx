import { Ban, ChevronRight, CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { useComparison } from '../../compare/useComparison'
import { VERDICT, vetCarrier, type Verdict } from '../../compare/vetting'
import { CARD, LABEL, LINK, useRise } from './ui'

const LADDER: Verdict[] = ['ready', 'review', 'high_risk', 'do_not_book']

const STEP: Record<Verdict, { on: string; dot: string }> = {
  ready: { on: 'bg-emerald-50 text-emerald-800 ring-emerald-600/30', dot: 'bg-emerald-500' },
  review: { on: 'bg-amber-50 text-amber-800 ring-amber-600/30', dot: 'bg-amber-500' },
  high_risk: { on: 'bg-orange-50 text-orange-800 ring-orange-600/30', dot: 'bg-orange-500' },
  do_not_book: { on: 'bg-red-50 text-red-800 ring-red-600/30', dot: 'bg-red-500' },
}

/**
 * "What a broker sees when they check you": the same booking check a broker gets at the top of
 * this carrier's page in the broker portal (features/compare/vetting.ts), shown on the four-step
 * ladder with this carrier's step marked, then what holds it back and what works for it.
 */
export function BrokerView({ usdotNumber, page }: { usdotNumber: number; page: string }) {
  const rise = useRise()
  const [facts] = useComparison([usdotNumber])
  const vetting = facts ? vetCarrier(facts) : null
  const loading = !facts?.profile || !facts.safety || !facts.authority || !facts.network

  const against = vetting
    ? [
        ...vetting.stops.map((i) => ({ ...i, icon: Ban, color: 'text-red-700' })),
        ...vetting.major.map((i) => ({ ...i, icon: CircleAlert, color: 'text-red-700' })),
        ...vetting.minor.map((i) => ({ ...i, icon: TriangleAlert, color: 'text-amber-700' })),
      ]
    : []

  return (
    <motion.section {...rise(1)} className={`${CARD} flex flex-col`} aria-labelledby="broker-view">
      <div className="flex items-center gap-3">
        <div>
          <div className={`${LABEL} text-slate-500`}>Booking check</div>
          <h2 id="broker-view" className="text-lg font-semibold leading-tight text-slate-950">
            What a broker sees when they check you
          </h2>
        </div>
      </div>

      {loading || !vetting ? (
        <p className="mt-4 text-sm text-slate-500">Reading your FMCSA records…</p>
      ) : (
        <>
          <ol
            className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
            aria-label="Booking check steps"
          >
            {LADDER.map((v) => {
              const here = v === vetting.verdict
              return (
                <li
                  key={v}
                  aria-current={here ? 'step' : undefined}
                  className={`relative rounded-xl px-3 py-3 text-sm ring-1 ring-inset transition-all ${
                    here
                      ? `${STEP[v].on} font-semibold shadow-sm`
                      : 'bg-slate-50 text-slate-500 ring-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${here ? STEP[v].dot : 'bg-slate-300'}`}
                      aria-hidden
                    />
                    {VERDICT[v].label}
                  </span>
                  {here && (
                    <span className="font-label mt-1 block text-[10px] uppercase tracking-[0.14em]">
                      You are here
                    </span>
                  )}
                </li>
              )
            })}
          </ol>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">What holds you back</h3>
              {against.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  Nothing in the check counts against you.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {against.map(({ key, text, icon: Icon, color }) => (
                    <li key={key} className={`flex items-start gap-2 ${color}`}>
                      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">What works for you</h3>
              {vetting.strengths.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No strengths to show yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {vetting.strengths.map(({ key, text }) => (
                    <li key={key} className="flex items-start gap-2 text-emerald-700">
                      <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-auto pt-5">
            <Link to={`${page}?tab=network`} className={`${LINK} inline-flex items-center gap-0.5`}>
              How brokers see you, item by item
              <ChevronRight className="size-4" aria-hidden />
            </Link>
            <p className="mt-2 text-xs text-slate-500">
              The booking check brokers get on Carrier Safety Scan: its reading of public FMCSA
              records. It isn’t a safety rating, and each broker makes their own decision.
            </p>
          </div>
        </>
      )}
    </motion.section>
  )
}
