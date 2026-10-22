import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'

/** A table row that opens `path` when clicked anywhere. Links and buttons inside keep their own
 * click, selecting text doesn't open it, and Ctrl/⌘-click opens it in a new tab. */
export function useRowLink() {
  const navigate = useNavigate()
  return (path: string) => ({
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if ((event.target as HTMLElement).closest('a, button, input, select, textarea')) return
      if (window.getSelection()?.toString()) return
      if (event.ctrlKey || event.metaKey) window.open(path, '_blank', 'noopener')
      else navigate(path)
    },
    className: 'cursor-pointer hover:bg-slate-50',
  })
}
