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

function getToken(): string | null {
  return localStorage.getItem('authToken')
}

function handleUnauthorized(): void {
  localStorage.removeItem('authToken')
  localStorage.removeItem('user')
  localStorage.removeItem('sessionExpiresAt')
  window.location.href = '/login'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  })

  if (res.status === 401 || res.status === 403) {
    handleUnauthorized()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP error ${res.status}`)
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
