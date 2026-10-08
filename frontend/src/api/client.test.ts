import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'

// Node ≥ 25 ships its own (disabled) global localStorage, which hides jsdom's: use an in-memory one.
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
afterEach(() => vi.unstubAllGlobals())

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  )
}

describe('apiClient on 403', () => {
  beforeEach(() => {
    localStorage.setItem('authToken', 'token')
    localStorage.setItem('user', JSON.stringify({ id: 7, username: 'nurse1', role: 'nurse' }))
  })

  it('PASSWORD_CHANGE_REQUIRED: keeps the session, marks the stored user, throws the server message', async () => {
    vi.stubGlobal(
      'fetch',
      respond(403, { success: false, error: 'You must change your password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' })
    )
    await expect(apiClient.get('/api/notifications')).rejects.toThrow('You must change your password before continuing.')
    expect(localStorage.getItem('authToken')).toBe('token')
    expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toMatchObject({ id: 7, mustChangePassword: true })
  })

  it('RBAC 403: leaves the stored user alone', async () => {
    vi.stubGlobal('fetch', respond(403, { success: false, error: 'Forbidden' }))
    await expect(apiClient.get('/api/admin/accounts')).rejects.toThrow('Forbidden')
    expect(JSON.parse(localStorage.getItem('user') ?? '{}').mustChangePassword).toBeUndefined()
  })
})

describe('apiClient on 400', () => {
  it('surfaces the change-password error text (wrong current password is not a logout)', async () => {
    localStorage.setItem('authToken', 'token')
    vi.stubGlobal('fetch', respond(400, { success: false, error: 'Current password is incorrect', code: 'WRONG_PASSWORD' }))
    await expect(apiClient.post('/api/auth/change-password', {})).rejects.toThrow('Current password is incorrect')
    expect(localStorage.getItem('authToken')).toBe('token')
  })
})
