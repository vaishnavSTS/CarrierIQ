/**
 * The three audiences the site speaks to: carriers, freight brokers and insurance agents. The
 * visitor picks one on the front door every time; nothing about the choice is stored.
 */

export type Audience = 'carrier' | 'broker' | 'agent'

export const AUDIENCES: readonly Audience[] = ['carrier', 'broker', 'agent']

/** Each audience's own page. */
export const AUDIENCE_PATH: Record<Audience, string> = {
  carrier: '/for-carriers',
  broker: '/for-brokers',
  agent: '/for-insurance-agents',
}

/** Which audience a public page belongs to, from its address (carriers when it's no one's). */
export function audienceOfPath(pathname: string): Audience {
  if (pathname.startsWith('/for-brokers') || pathname.startsWith('/broker/')) return 'broker'
  if (pathname.startsWith('/for-insurance-agents') || pathname.startsWith('/insurance/')) {
    return 'agent'
  }
  return 'carrier'
}

/**
 * Removes what an earlier version kept (a cookie and this tab's copy of the choice), so nothing
 * of it stays in visitors' browsers.
 */
export function forgetStoredAudience() {
  for (const name of ['css_audience', 'css_consent']) {
    if (document.cookie.split('; ').some((c) => c.startsWith(`${name}=`))) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
    }
  }
  try {
    sessionStorage.removeItem('css_audience')
  } catch {
    // storage blocked: nothing was kept there
  }
}
