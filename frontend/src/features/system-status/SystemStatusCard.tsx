import { StatusBadge } from '../../components/StatusBadge'
import { useHealth } from '../../hooks/useHealth'
import type { ComponentStatus } from '../../types/health'
import type { Tone } from '../../utils/status'

function toneFor(status: ComponentStatus): Tone {
  if (status === 'ok') return 'ok'
  if (status === 'degraded') return 'warn'
  return 'down'
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd>
        <StatusBadge label={value} tone={tone} />
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
