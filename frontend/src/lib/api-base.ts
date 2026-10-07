/**
 * Backend origin for API calls and uploaded files, from `VITE_API_BASE_URL`:
 * - unset / empty → `http://localhost:3000` (local backend, no proxy)
 * - `/api` → `''`: same origin; the Vite dev proxy / nginx forward `/api` and `/uploads`
 *   (callers already prefix their paths with `/api`, so the origin must not repeat it)
 * - anything else → that origin without a trailing slash
 */
export function resolveApiBaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') return 'http://localhost:3000'
  const s = raw.trim()
  if (s === '/api' || s === '/api/') return ''
  return s.replace(/\/+$/, '')
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined)

/** URL of a backend file path (e.g. `/uploads/lab/x.pdf`); absolute URLs are returned as is. */
export function toBackendUrl(url: string, base: string = API_BASE_URL): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}
