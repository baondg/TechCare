import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { doctorService } from './doctor-service'
import { healthInfoService } from './health-info-service'

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
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  localStorage.setItem('authToken', 'old')
  localStorage.setItem('user', JSON.stringify({ id: 7, role: 'patient' }))
})
afterEach(() => vi.unstubAllGlobals())

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('services on apiClient', () => {
  it('doctorService: an expired token is refreshed and the request retried with the new one', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { success: false, code: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(json(200, { success: true, token: 'new' }))
      .mockResolvedValueOnce(json(200, { success: true, patient: { id: 3 } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(doctorService.getPatient(3)).resolves.toMatchObject({ patient: { id: 3 } })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/doctor\/patients\/3$/)
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new')
  })

  it('healthInfoService: a server error comes back as { success: false, error: <server message> }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(403, { success: false, error: 'Forbidden' })))
    await expect(healthInfoService.getHealthInfo()).resolves.toEqual({ success: false, error: 'Forbidden' })
  })
})
