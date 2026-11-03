import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * A table that becomes a list on phones: each row a small card, each value beside its column's
 * name (.stack-table in index.css). The names are copied from the header after every render, so
 * columns that come and go keep the right labels.
 */
export function StackTable({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLTableElement>(null)

  useLayoutEffect(() => {
    const table = ref.current
    if (!table) return
    const names = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '')
    for (const row of table.querySelectorAll('tbody tr')) {
      let column = 0
      for (const cell of row.children) {
        const span = Number(cell.getAttribute('colspan') ?? 1)
        cell.setAttribute('data-label', span > 1 ? '' : (names[column] ?? ''))
        column += span
      }
    }
  })

  return (
    <table ref={ref} className={`stack-table ${className}`}>
      {children}
    </table>
  )
}
