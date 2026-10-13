import type {
  AuthOptions,
  GoogleSignupInput,
  GoogleSignupPending,
  PortalOverview,
  RegisterInput,
  RegisterResult,
  User,
} from '../types/auth'
import { ApiError, apiGet, apiRequest } from './client'

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
export function login(email: string, password: string): Promise<User> {
  return postJson<User>('/auth/login', { email, password })
}

export function logout(): Promise<void> {
  return postJson<void>('/auth/logout')
}

export function register(input: RegisterInput): Promise<RegisterResult> {
  return postJson<RegisterResult>('/auth/register', input)
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

export function completeGoogleSignup(input: GoogleSignupInput): Promise<RegisterResult> {
  return postJson<RegisterResult>('/auth/google/signup', input)
}

/** Full-page navigation (not fetch): the browser must go to Google and come back. */
export const GOOGLE_START_URL = '/api/v1/auth/google/start'
