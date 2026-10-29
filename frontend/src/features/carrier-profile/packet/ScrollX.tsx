import { useContext, type ReactNode } from 'react'

import { PrintCopy } from './printFit'

/**
 * On screen, a table that is wider than a phone scrolls sideways inside this box instead of
 * widening the page. The printed copy is laid out at the A4 width, so it uses the table as is.
 */
export function ScrollX({ children }: { children: ReactNode }) {
  const printed = useContext(PrintCopy)
  return printed ? children : <div className="relative overflow-x-auto">{children}</div>
}
