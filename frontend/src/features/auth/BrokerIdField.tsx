import type { BrokerIdKind } from '../../types/auth'

const KINDS: { kind: BrokerIdKind; label: string }[] = [
  { kind: 'MC', label: 'MC number' },
  { kind: 'USDOT', label: 'USDOT number' },
]

/**
 * The brokerage's MC number (usual) or USDOT number. CarrierSafetyScan checks FMCSA for active broker
 * authority on submit.
 */
export function BrokerIdField({
  kind,
  value,
  onKindChange,
  onValueChange,
}: {
  kind: BrokerIdKind
  value: string
  onKindChange: (kind: BrokerIdKind) => void
  onValueChange: (value: string) => void
}) {
  return (
    <div>
      <span className="text-sm font-medium text-slate-700">Brokerage number</span>
      <div className="mt-1.5 flex gap-2">
        <div
          role="radiogroup"
          aria-label="Number type"
          className="flex shrink-0 rounded-xl border border-slate-300 bg-canvas/70 p-1"
        >
          {KINDS.map(({ kind: k, label }) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              aria-label={label}
              onClick={() => onKindChange(k)}
              className={`rounded-lg px-3 text-sm font-medium transition-colors ${
                kind === k
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <input
          inputMode="numeric"
          required
          aria-label={kind === 'MC' ? 'MC number' : 'USDOT number'}
          placeholder={kind === 'MC' ? '261603' : '512885'}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-canvas/70 px-3.5 py-2.5 text-sm text-slate-900 transition-shadow placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
        />
      </div>
      <span className="mt-1 block text-xs text-slate-500">
        We check FMCSA that it holds active broker authority.
      </span>
    </div>
  )
}
