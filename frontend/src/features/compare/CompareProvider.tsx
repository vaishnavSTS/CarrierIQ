import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { CompareContext, MAX_COMPARE, parseUsdots, type CompareList } from './compareContext'

// One list per portal, so a staff member who also tests the broker portal keeps them apart.
const storageKey = (page: string) => `carriersafetyscan.compare:${page}`

function load(page: string): number[] {
  try {
    return parseUsdots(window.sessionStorage.getItem(storageKey(page)))
  } catch {
    return []
  }
}

/**
 * Holds the compare selection for the session (kept across page reloads). `page` is where the
 * Compare page lives in this portal.
 */
export function CompareProvider({ page, children }: { page: string; children: ReactNode }) {
  const [usdots, setUsdots] = useState<number[]>(() => load(page))

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey(page), usdots.join(','))
    } catch {
      // Storage blocked (private window): the selection just isn't kept across reloads.
    }
  }, [page, usdots])

  const toggle = useCallback(
    (usdot: number) =>
      setUsdots((list) =>
        list.includes(usdot)
          ? list.filter((u) => u !== usdot)
          : list.length < MAX_COMPARE
            ? [...list, usdot]
            : list,
      ),
    [],
  )
  const remove = useCallback(
    (usdot: number) => setUsdots((list) => list.filter((u) => u !== usdot)),
    [],
  )
  const replace = useCallback((next: number[]) => setUsdots(parseUsdots(next.join(','))), [])
  const clear = useCallback(() => setUsdots([]), [])

  const value = useMemo<CompareList>(
    () => ({
      page,
      usdots,
      has: (usdot) => usdots.includes(usdot),
      full: usdots.length >= MAX_COMPARE,
      toggle,
      remove,
      replace,
      clear,
    }),
    [page, usdots, toggle, remove, replace, clear],
  )
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
}
