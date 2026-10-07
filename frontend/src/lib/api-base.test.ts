import { describe, expect, it } from 'vitest'
import { resolveApiBaseUrl, toBackendUrl } from './api-base'

describe('resolveApiBaseUrl', () => {
  it('defaults to the local backend', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('http://localhost:3000')
    expect(resolveApiBaseUrl('  ')).toBe('http://localhost:3000')
  })

  it('treats /api as same origin, so "/api/..." paths are not doubled', () => {
    expect(resolveApiBaseUrl('/api')).toBe('')
    expect(resolveApiBaseUrl('/api/')).toBe('')
    expect(`${resolveApiBaseUrl('/api')}/api/appointments`).toBe('/api/appointments')
  })

  it('keeps an absolute origin without trailing slashes', () => {
    expect(resolveApiBaseUrl('https://api.techcare.site/')).toBe('https://api.techcare.site')
    expect(resolveApiBaseUrl('http://localhost:5000')).toBe('http://localhost:5000')
  })
})

describe('toBackendUrl', () => {
  it('prefixes backend paths and leaves absolute URLs alone', () => {
    expect(toBackendUrl('/uploads/lab/a.pdf', 'https://api.x')).toBe('https://api.x/uploads/lab/a.pdf')
    expect(toBackendUrl('uploads/lab/a.pdf', '')).toBe('/uploads/lab/a.pdf')
    expect(toBackendUrl('https://cdn.x/a.pdf', 'https://api.x')).toBe('https://cdn.x/a.pdf')
    expect(toBackendUrl('', 'https://api.x')).toBe('')
  })
})
