/**
 * Who a visitor said they are (carrier, freight broker or insurance agent), so the site opens on
 * their page. Kept for this browser tab (sessionStorage) as soon as they choose; with their consent
 * (the cookie bar) it is kept in a cookie for a year instead, so the next visit opens on it too.
 * Their answer to the cookie bar is itself kept, so they aren't asked on every visit.
 */

export type Audience = 'carrier' | 'broker' | 'agent'

export const AUDIENCES: readonly Audience[] = ['carrier', 'broker', 'agent']

/** Each audience's own page. */
export const AUDIENCE_PATH: Record<Audience, string> = {
  carrier: '/for-carriers',
  broker: '/for-brokers',
  agent: '/for-insurance-agents',
}

/** "carrier", "freight broker", "insurance agent": how the site names each. */
export const AUDIENCE_NAME: Record<Audience, string> = {
  carrier: 'carrier',
  broker: 'freight broker',
  agent: 'insurance agent',
}

const AUDIENCE_COOKIE = 'css_audience'
const CONSENT_COOKIE = 'css_consent'
const YEAR = 365 * 24 * 3600

export type Consent = 'accepted' | 'declined'

function readCookie(name: string): string | null {
  const found = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null
}

function writeCookie(name: string, value: string | null) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    value === null
      ? `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`
      : `${name}=${encodeURIComponent(value)}; Max-Age=${YEAR}; Path=/; SameSite=Lax${secure}`
}

function isAudience(value: string | null): value is Audience {
  return value !== null && (AUDIENCES as readonly string[]).includes(value)
}

/** The visitor's answer to the cookie bar; null: not asked yet. */
export function consent(): Consent | null {
  const value = readCookie(CONSENT_COOKIE)
  return value === 'accepted' || value === 'declined' ? value : null
}

/** Who the visitor said they are: the cookie (kept with consent), else this tab's choice. */
export function savedAudience(): Audience | null {
  const fromCookie = readCookie(AUDIENCE_COOKIE)
  if (isAudience(fromCookie)) return fromCookie
  try {
    const fromTab = sessionStorage.getItem(AUDIENCE_COOKIE)
    return isAudience(fromTab) ? fromTab : null
  } catch {
    return null // storage blocked: they choose again
  }
}

/** Remember a choice: for this tab always, and in the cookie when the visitor accepted. */
export function rememberAudience(audience: Audience) {
  try {
    sessionStorage.setItem(AUDIENCE_COOKIE, audience)
  } catch {
    // storage blocked: the page still opens, it just isn't remembered
  }
  if (consent() === 'accepted') writeCookie(AUDIENCE_COOKIE, audience)
}

/** The visitor's answer to the cookie bar. Declining removes the audience cookie. */
export function setConsent(answer: Consent, audience: Audience | null) {
  writeCookie(CONSENT_COOKIE, answer)
  writeCookie(AUDIENCE_COOKIE, answer === 'accepted' && audience ? audience : null)
}
