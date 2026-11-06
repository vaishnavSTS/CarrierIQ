import { useSyncExternalStore } from 'react'

/** Tailwind's `sm` breakpoint and up: tablets, laptops and desktops (not phones). */
const QUERY = '(min-width: 640px)'

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/**
 * Whether the screen is wider than a phone. On the carrier map a carrier's full record then opens
 * in a new browser tab, so the map stays as it was in this one; phones open it in the same tab
 * (their Back returns to the map).
 */
export function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  )
}

/** Link props that open in a new tab on wide screens. */
export function newTabOnWide(wide: boolean) {
  return wide ? { target: '_blank', rel: 'noopener' } : {}
}
