import { describe, expect, it } from 'vitest'
import { CHANGE_PASSWORD_PATH, passwordChangeRedirect } from './auth-paths'

describe('passwordChangeRedirect', () => {
  it('sends a user with an admin-issued password to the change-password page', () => {
    expect(passwordChangeRedirect(true, '/nurse/dashboard')).toBe(CHANGE_PASSWORD_PATH)
    expect(passwordChangeRedirect(true, '/')).toBe(CHANGE_PASSWORD_PATH)
  })

  it('leaves them on the change-password page', () => {
    expect(passwordChangeRedirect(true, CHANGE_PASSWORD_PATH)).toBeNull()
  })

  it('does nothing otherwise', () => {
    expect(passwordChangeRedirect(false, '/nurse/dashboard')).toBeNull()
    expect(passwordChangeRedirect(undefined, '/admin/users')).toBeNull()
  })
})
