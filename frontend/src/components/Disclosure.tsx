import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * One line that opens to show more: the summary (badges, title, a short label) is always
 * visible, the details only after a click. Built on <details>, so it works with the keyboard
 * and screen readers without extra code.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className = '',
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  return (
    <details className={`group ${className}`} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{summary}</span>
      </summary>
      <div className="mt-2 pl-6">{children}</div>
    </details>
  )
}
