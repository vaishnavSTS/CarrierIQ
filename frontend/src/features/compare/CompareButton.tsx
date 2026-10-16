import { Check, Plus } from 'lucide-react'

import { MAX_COMPARE, useCompareList } from './compareContext'

/** "Compare" toggle for one carrier; renders nothing in the client portal. */
export function CompareButton({
  usdotNumber,
  size = 'md',
}: {
  usdotNumber: number
  size?: 'sm' | 'md'
}) {
  const compare = useCompareList()
  if (!compare) return null
  const selected = compare.has(usdotNumber)
  const disabled = !selected && compare.full
  const Icon = selected ? Check : Plus
  return (
    <button
      type="button"
      onClick={(event) => {
        // Search rows open the profile on click; the button shouldn't.
        event.stopPropagation()
        compare.toggle(usdotNumber)
      }}
      disabled={disabled}
      aria-pressed={selected}
      title={disabled ? `You can compare up to ${MAX_COMPARE} carriers` : undefined}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      } ${
        selected
          ? 'border-accent bg-accent-soft text-slate-950'
          : 'border-slate-300 bg-surface text-slate-700 hover:border-slate-400 hover:text-slate-900'
      }`}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden />
      {selected ? 'Comparing' : 'Compare'}
    </button>
  )
}
