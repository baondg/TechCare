/**
 * Central HTTP client for all API calls.
 *
 * - Automatically attaches the Bearer token from localStorage
 * - Redirects to /login on 401/403
 * - Throws a typed Error for non-OK responses so callers only need try/catch
 *
 * Usage:
 *   import { apiClient } from '@/api/client'
 *   const data = await apiClient.get<User[]>('/api/users')
 *   await apiClient.post('/api/auth/login', { username, password })
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
import i18n from '@/i18n'
import { emitErrorToast } from '@/lib/error-toast-bus'

function getToken(): string | null {
  return localStorage.getItem('authToken')
}

function getSafeRouteByRole(role?: string): string {
  switch ((role || '').toLowerCase()) {
    case 'admin':
      return '/admin/dashboard'
    case 'doctor':
      return '/doctor/dashboard'
    case 'nurse':
      return '/nurse/dashboard'
    case 'technician':
      return '/technician/dashboard'
    case 'patient':
      return '/patient/dashboard'
    default:
      return '/'
  }
}

function handleUnauthorized(status: number): void {
  if (status === 403) {
    try {
      const stored = localStorage.getItem('user')
      const user = stored ? (JSON.parse(stored) as { role?: string }) : null
      window.location.href = getSafeRouteByRole(user?.role)
      return
    } catch {
      window.location.href = '/'
      return
    }
  }

  localStorage.removeItem('authToken')
  localStorage.removeItem('user')
  localStorage.removeItem('sessionExpiresAt')
  window.location.href = '/login'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> | undefined),
      },
    })
  } catch {
    const msg = i18n.t('errors.networkError')
    emitErrorToast(msg)
    throw new Error(msg)
  }

  if (res.status === 401 || res.status === 403) {
    handleUnauthorized(res.status)
    throw new Error(i18n.t('errors.unauthorized'))
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
    emitErrorToast(message)
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
