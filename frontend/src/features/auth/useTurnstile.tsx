import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { useAuthOptions } from '../../hooks/useAuth'

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      size: 'flexible' | 'compact'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const FULL_WIDTH_MIN = 300

let script: Promise<TurnstileApi> | null = null

/** Cloudflare's script, loaded once and only on pages that show the check. */
function loadTurnstile(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = SCRIPT_URL
    tag.async = true
    tag.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('no API')))
    tag.onerror = () => {
      script = null // the next page can try again
      reject(new Error('not loaded'))
    }
    document.head.appendChild(tag)
  })
  return script
}

export interface Turnstile {
  /** Goes in the form, above the submit button; nothing while Turnstile is off */
  widget: ReactNode
  /** The one-time token to send with the form; null until the check has passed */
  token: string | null
  /** The check is on and hasn't passed yet: the form can't be sent */
  pending: boolean
  /** Why the check can't be finished, for the form's error line */
  problem: string | null
  /** A token works once: get a new one after every attempt that didn't log in */
  reset: () => void
}

/**
 * Cloudflare Turnstile for a form. It is on when the API gives a site key (/auth/options); most
 * people just see it tick itself, without a puzzle.
 */
export function useTurnstile(): Turnstile {
  const siteKey = useAuthOptions().data?.turnstile_site_key ?? null
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!siteKey) return
    let gone = false
    loadTurnstile()
      .then((api) => {
        if (gone || !box.current) return
        widgetId.current = api.render(box.current, {
          sitekey: siteKey,
          // The full-width check needs 300px; on the smallest phones it would push the form wider.
          size: box.current.offsetWidth >= FULL_WIDTH_MIN ? 'flexible' : 'compact',
          callback: (value) => {
            setFailed(false)
            setToken(value)
          },
          'expired-callback': () => setToken(null),
          'error-callback': () => {
            setToken(null)
            setFailed(true)
          },
        })
      })
      .catch(() => {
        if (!gone) setFailed(true)
      })
    return () => {
      gone = true
      if (widgetId.current) window.turnstile?.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey])

  const reset = useCallback(() => {
    setToken(null)
    if (widgetId.current) window.turnstile?.reset(widgetId.current)
  }, [])

  return {
    widget: siteKey ? <div ref={box} className="min-h-[65px]" /> : null,
    token,
    pending: Boolean(siteKey) && !token,
    problem: failed
      ? 'The security check couldn’t load. Check your connection, then refresh this page.'
      : null,
    reset,
  }
}
