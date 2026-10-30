import type {
  AuthOptions,
  BrokerGoogleSignupInput,
  Brokerage,
  BrokerRegisterInput,
  GoogleSignupInput,
  GoogleSignupPending,
  PortalOverview,
  RegisterInput,
  User,
} from '../types/auth'
import { ApiError, apiGet, apiRequest } from './client'

function postJson<T>(path: string, body?: unknown, turnstileToken?: string | null): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(turnstileToken ? { 'X-Turnstile-Token': turnstileToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** The logged-in user, or null when nobody is logged in (the API answers 401). */
export async function fetchMe(): Promise<User | null> {
  try {
    return await apiGet<User>('/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

/** The session lives in an HttpOnly cookie set by the API; this page never sees the token. */
export function login(
  email: string,
  password: string,
  turnstileToken: string | null,
): Promise<User> {
  return postJson<User>('/auth/login', { email, password }, turnstileToken)
}

/** Emails a reset link if the account exists; the answer is the same either way. */
export function forgotPassword(email: string, turnstileToken: string | null): Promise<unknown> {
  return postJson('/auth/password/forgot', { email }, turnstileToken)
}

export function resetPassword(token: string, password: string): Promise<unknown> {
  return postJson('/auth/password/reset', { token, password })
}

export function logout(): Promise<void> {
  return postJson<void>('/auth/logout')
}

/** Creates the client account and logs it in (the API sets the session cookie). */
export function register(input: RegisterInput, turnstileToken: string | null): Promise<User> {
  return postJson<User>('/auth/register', input, turnstileToken)
}

/** Checks FMCSA for active broker authority, then creates the broker account and logs it in. */
export function registerBroker(
  input: BrokerRegisterInput,
  turnstileToken: string | null,
): Promise<User> {
  return postJson<User>('/auth/broker/register', input, turnstileToken)
}

export function fetchBrokerOverview(): Promise<Brokerage> {
  return apiGet<Brokerage>('/broker/overview')
}

export function completeBrokerGoogleSignup(input: BrokerGoogleSignupInput): Promise<User> {
  return postJson<User>('/auth/broker/google/signup', input)
}

export function fetchPortalOverview(): Promise<PortalOverview> {
  return apiGet<PortalOverview>('/portal/overview')
}

export function fetchAuthOptions(): Promise<AuthOptions> {
  return apiGet<AuthOptions>('/auth/options')
}

/** Who is finishing a Google sign-up, or null when the Google step expired or never happened. */
export async function fetchGoogleSignup(): Promise<GoogleSignupPending | null> {
  try {
    return await apiGet<GoogleSignupPending>('/auth/google/signup')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

/** Creates the client account for a new Google user and logs it in. */
export function completeGoogleSignup(input: GoogleSignupInput): Promise<User> {
  return postJson<User>('/auth/google/signup', input)
}

/** Full-page navigation (not fetch): the browser must go to Google and come back. A new Google
 * user then finishes signing up as a client or, from the broker pages, as a broker. */
export function googleStartUrl(portal: 'client' | 'broker' = 'client'): string {
  const start = '/api/v1/auth/google/start'
  return portal === 'broker' ? `${start}?portal=broker` : start
}
