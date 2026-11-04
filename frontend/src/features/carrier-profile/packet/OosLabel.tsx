import type { ReactNode } from 'react'

/** "Out of service" as a small red label, so it stands out in the inspection lists and in print. */
export function OosLabel({ children = 'Out of service' }: { children?: ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded border border-red-600 bg-red-50 px-1.5 py-px align-baseline text-[11px] font-semibold uppercase leading-tight tracking-wide text-red-700">
      {children}
    </span>
  )
}
