import { useHealth } from '../../hooks/useHealth'
import type { ComponentStatus } from '../../types/health'

type Tone = 'ok' | 'warn' | 'down' | 'pending'

const TONE_STYLES: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warn: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  down: 'bg-red-50 text-red-700 ring-red-600/20',
  pending: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

function toneFor(status: ComponentStatus): Tone {
  if (status === 'ok') return 'ok'
  if (status === 'degraded') return 'warn'
  return 'down'
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd
        className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase ring-1 ring-inset ${TONE_STYLES[tone]}`}
      >
        {value}
      </dd>
    </div>
  )
}

export function SystemStatusCard() {
  const { data, isPending, isError } = useHealth()

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">System data status</h2>
      <dl className="mt-2 divide-y divide-slate-100">
        {isPending && <StatusRow label="API" value="checking" tone="pending" />}
        {isError && <StatusRow label="API" value="unreachable" tone="down" />}
        {data && (
          <>
            <StatusRow label="API" value="ok" tone="ok" />
            <StatusRow label="Database" value={data.database} tone={toneFor(data.database)} />
          </>
        )}
      </dl>
    </section>
  )
}
