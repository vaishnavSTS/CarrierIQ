import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { CompareContext, MAX_COMPARE, parseUsdots, type CompareList } from './compareContext'

const STORAGE_KEY = 'carrieriq.compare'

function load(): number[] {
  try {
    return parseUsdots(window.sessionStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

/** Holds the broker's compare selection for the session (kept across page reloads). */
export function CompareProvider({ children }: { children: ReactNode }) {
  const [usdots, setUsdots] = useState<number[]>(load)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, usdots.join(','))
    } catch {
      // Storage blocked (private window): the selection just isn't kept across reloads.
    }
  }, [usdots])

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
      usdots,
      has: (usdot) => usdots.includes(usdot),
      full: usdots.length >= MAX_COMPARE,
      toggle,
      remove,
      replace,
      clear,
    }),
    [usdots, toggle, remove, replace, clear],
  )
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
}
