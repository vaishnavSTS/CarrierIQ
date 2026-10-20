/**
 * Light / dark theme. The choice is saved in the browser; "system" follows the OS setting.
 * Dark mode is the `:root[data-theme='dark']` token set in index.css. index.html runs the same
 * logic before the page draws, so a saved dark theme never flashes light on load.
 */
import { useEffect, useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme' // must match the script in index.html
const DARK_QUERY = '(prefers-color-scheme: dark)'
const listeners = new Set<() => void>()

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    // storage blocked (private window, strict settings): fall back to the default
  }
  return 'light'
}

let preference: ThemePreference = readPreference()

function applyTheme(pref: ThemePreference): void {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia(DARK_QUERY).matches)
  if (dark) document.documentElement.dataset.theme = 'dark'
  else delete document.documentElement.dataset.theme
}

export function setThemePreference(pref: ThemePreference): void {
  preference = pref
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // not saved, but still applied for this visit
  }
  applyTheme(pref)
  listeners.forEach((notify) => notify())
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

/** The saved preference, and a setter that applies and saves it. */
export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, () => preference)

  // While on "system", follow the OS when it switches (e.g. automatic dark mode at sunset).
  useEffect(() => {
    if (pref !== 'system') return
    const media = window.matchMedia(DARK_QUERY)
    const follow = () => applyTheme('system')
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [pref])

  return [pref, setThemePreference]
}
