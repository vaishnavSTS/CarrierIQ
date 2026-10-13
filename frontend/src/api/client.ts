/** Shared HTTP client. Every resource file in src/api/ goes through apiGet/apiRequest. */

const API_BASE = '/api/v1'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string }
  /** FastAPI's request-validation answer (422) */
  detail?: { msg?: string }[]
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const { error, detail } = (body as ErrorBody | null) ?? {}
    const validation = Array.isArray(detail)
      ? detail[0]?.msg?.replace(/^Value error, /, '')
      : undefined
    throw new ApiError(
      response.status,
      error?.code ?? 'http_error',
      error?.message ?? validation ?? `Request failed with status ${response.status}`,
    )
  }

  return body as T
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path)
}
