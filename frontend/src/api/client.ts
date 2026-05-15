/**
 * Central HTTP client for all API calls.
 *
 * - Automatically attaches the Bearer token from localStorage
 * - Redirects to /login on 401 and on 403 when the server signals a dead session (auth-lost codes)
 * - Throws a typed Error for non-OK responses — UI surfaces errors via page handlers (emitErrorToast is not automatic here, avoiding duplicate toasts with PauseableCornerToast).
 *
 * Usage:
 *   import { apiClient } from '@/api/client'
 *   const data = await apiClient.get<User[]>('/api/users')
 *   await apiClient.post('/api/auth/login', { username, password })
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
import i18n from '@/i18n'
import { emitErrorToast } from '@/lib/error-toast-bus'
import { emitSuccessToast } from '@/lib/success-toast-bus'

function getToken(): string | null {
  return localStorage.getItem('authToken')
}

function setToken(token: string): void {
  localStorage.setItem('authToken', token)
}

type ApiErrorPayload = { message?: string; error?: string; code?: string; success?: boolean; token?: string }

let refreshInFlight: Promise<string | null> | null = null
let refreshToastShown = false
let authLostRedirectTimer: ReturnType<typeof setTimeout> | null = null
const AUTH_LOST_REDIRECT_DELAY_MS = 10_000

/** Backend auth middleware returns these for a dead session / bad token (not RBAC). */
const AUTH_LOST_CODES = new Set([
  'INVALID_TOKEN',
  'INVALID_TOKEN_TYPE',
  'INVALID_SESSION',
  'ACCOUNT_INACTIVE',
])

function clearAuthStorage(): void {
  localStorage.removeItem('authToken')
  localStorage.removeItem('user')
  localStorage.removeItem('sessionExpiresAt')
}

/** Avoid full-page reload loop when already on target. */
function navigateIfDifferent(href: string): void {
  try {
    const url = new URL(href, window.location.origin)
    const current = `${window.location.pathname}${window.location.search}`
    const next = `${url.pathname}${url.search}`
    if (current === next) return
  } catch {
    // ignore URL parse errors
  }
  window.location.href = href
}

function scheduleRedirectToLogin(): void {
  if (authLostRedirectTimer) return
  clearAuthStorage()
  emitErrorToast(i18n.t('errors.sessionExpiredRedirecting'))
  authLostRedirectTimer = setTimeout(() => {
    authLostRedirectTimer = null
    navigateIfDifferent(`${window.location.origin}/login`)
  }, AUTH_LOST_REDIRECT_DELAY_MS)
}

/** Only call for 401 (always logout) or 403 with an auth-lost code (RBAC 403 must not use this). */
function handleUnauthorized(status: number, code?: string): void {
  if (status === 403) {
    if (code && AUTH_LOST_CODES.has(code)) scheduleRedirectToLogin()
    return
  }
  if (status === 401) scheduleRedirectToLogin()
}

async function refreshOnce(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    if (!refreshToastShown) {
      refreshToastShown = true
      emitSuccessToast('Phiên đăng nhập đã hết hạn, đang làm mới...')
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const text = await res.text()
      let payload: ApiErrorPayload = {}
      if (text) {
        try {
          payload = JSON.parse(text) as ApiErrorPayload
        } catch {
          payload = { error: text }
        }
      }
      if (!res.ok || !payload?.success || !payload?.token) return null
      setToken(String(payload.token))
      return String(payload.token)
    } catch {
      return null
    } finally {
      refreshToastShown = false
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

async function request<T>(path: string, options: RequestInit = {}, hasRetried = false): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> | undefined),
      },
    })
  } catch {
    const msg = i18n.t('errors.networkError')
    throw new Error(msg)
  }

  if (res.status === 401) {
    let payload: ApiErrorPayload = {}
    try {
      payload = (await res.clone().json()) as ApiErrorPayload
    } catch {
      // ignore parsing errors
    }
    if (payload?.code === 'TOKEN_EXPIRED' && !hasRetried && !path.startsWith('/api/auth/refresh')) {
      const refreshedToken = await refreshOnce()
      if (refreshedToken) {
        return request<T>(path, options, true)
      }
    }
    handleUnauthorized(res.status, payload?.code)
    throw new Error(i18n.t('errors.unauthorized'))
  }

  if (res.status === 403) {
    let payload: ApiErrorPayload = {}
    try {
      payload = (await res.clone().json()) as ApiErrorPayload
    } catch {
      // ignore parsing errors
    }
    const code = payload?.code
    if (code && AUTH_LOST_CODES.has(code)) {
      handleUnauthorized(403, code)
      throw new Error(i18n.t('errors.unauthorized'))
    }
    const msg =
      payload?.error ||
      payload?.message ||
      i18n.t('errors.httpError', { status: 403 })
    throw new Error(msg)
  }

  if (!res.ok) {
    const text = await res.text()
    let message = text || i18n.t('errors.httpError', { status: res.status })
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string }
        if (parsed?.message) message = parsed.message
        else if (parsed?.error) message = parsed.error
      } catch {
        // Keep original text if not JSON.
      }
    }
    throw new Error(message)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

export const apiClient = {
  get:    <T>(path: string)                    => request<T>(path),
  post:   <T>(path: string, body: unknown)     => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)     => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)     => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
}
