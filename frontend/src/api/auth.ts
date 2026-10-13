import type { PortalOverview, RegisterInput, RegisterResult, User } from '../types/auth'
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
