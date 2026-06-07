/**
 * Real React Context for authentication.
 *
 * - Reads initial user from localStorage so page refreshes keep the session.
 * - `AuthProvider` must wrap the app in main.tsx.
 * - `useAuth()` throws if used outside the provider.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import type React from 'react'
import i18n from '@/i18n'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

// ── Types ──────────────────────────────────────────────────────

export interface User {
  id: number
  username: string
  email?: string
  firstName?: string
  lastName?: string
  fullName?: string
  role?: string
  type?: string
}

export interface RegisterData {
  username: string
  /** Optional; USER.email is nullable in DB */
  email?: string
  password: string
  firstName: string
  lastName: string
  age?: number
  role?: string
  // Core profile fields required by backend
  sex?: string
  dob?: string
  tel?: string
  idcard?: string
  // Relative information
  relativeName?: string
  relativeRelationship?: string
  relativeDateOfBirth?: string
  relativeSex?: string
  relativePhone?: string
  relativeEmail?: string
  relativeNationalId?: string
  // Insurance information
  insuranceId?: string
  insuranceProvider?: string
  insuranceExpiry?: string
}
// Simplified auth hook - no AuthProvider needed
// Returns mock user data for development


interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (
    username: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string; code?: string }>
  register: (userData: RegisterData) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

// ── Context ────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null)

// ── Provider ───────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const clearAuthStorage = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    localStorage.removeItem('sessionExpiresAt')
  }

  const [user, setUser] = useState<User | null>(() => {
    try {
      const token = localStorage.getItem('authToken')
      const stored = localStorage.getItem('user')
      const expiresAt = localStorage.getItem('sessionExpiresAt')

      // If token is missing or expired, treat session as logged out.
      if (!token) {
        clearAuthStorage()
        return null
      }

      if (expiresAt && new Date(expiresAt) <= new Date()) {
        clearAuthStorage()
        return null
      }

      return stored ? (JSON.parse(stored) as User) : null
    } catch {
      clearAuthStorage()
      return null
    }
  })
  const [isLoading, setIsLoading] = useState(false)

  const isAuthenticated = user !== null && !!localStorage.getItem('authToken')

  /** Merge first/last name from profile API so sidebar shows real names (e.g. doctors) even with older login payloads. */
  useEffect(() => {
    if (!user?.id) return
    const token = localStorage.getItem('authToken')
    if (!token) return

    const uid = user.id
    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/profile/${uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          profile?: { firstName?: string; lastName?: string; fullName?: string; email?: string }
        }
        const p = data.profile
        if (!p || cancelled) return

        const firstName = (p.firstName || '').trim()
        const lastName = (p.lastName || '').trim()
        const fullName = (p.fullName || '').trim()

        setUser((prev) => {
          if (!prev || prev.id !== uid) return prev
          const next: User = {
            ...prev,
            firstName: firstName || prev.firstName,
            lastName: lastName || prev.lastName,
            fullName: fullName || prev.fullName,
            email: p.email ?? prev.email,
          }
          const unchanged =
            next.firstName === prev.firstName &&
            next.lastName === prev.lastName &&
            next.fullName === prev.fullName &&
            next.email === prev.email
          if (unchanged) return prev
          localStorage.setItem('user', JSON.stringify(next))
          return next
        })
      } catch {
        /* ignore — sidebar still uses login payload */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  const login = async (
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string; code?: string }> => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      let data: {
        success?: boolean
        token?: string
        user?: User
        expiresAt?: string
        error?: string
        code?: string
      } = {}
      const text = await res.text()
      const trimmed = text?.trim() ?? ''
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          data = JSON.parse(trimmed) as typeof data
        } catch {
          data = { success: false, error: trimmed || `Unexpected server response (${res.status})` }
        }
      } else if (trimmed) {
        data = { success: false, error: trimmed }
      } else {
        data = { success: false, error: `Unexpected server response (${res.status})` }
      }

      if (res.ok && data.success && data.token && data.user) {
        localStorage.setItem('authToken', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        if (data.expiresAt) localStorage.setItem('sessionExpiresAt', data.expiresAt)
        setUser(data.user)
        return { success: true }
      }
      const fallbackErrorByStatus: Record<number, string> = {
        400: i18n.t('auth.loginFailed'),
        401: i18n.t('auth.loginFailed'),
        423: i18n.t('auth.loginFailed'),
        429: i18n.t('auth.loginFailed'),
      }
      return {
        success: false,
        error: data.error ?? fallbackErrorByStatus[res.status] ?? i18n.t('auth.loginFailed'),
        code: data.code,
      }
    } catch (err) {
      return { success: false, error: i18n.t('auth.unexpectedError') }
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (userData: RegisterData): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      })
      const data = await res.json() as { success?: boolean; token?: string; user?: User; error?: string }

      if (res.ok && data.success && data.token && data.user) {
        localStorage.setItem('authToken', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        setUser(data.user)
        return { success: true }
      }
      return { success: false, error: data.error ?? i18n.t('auth.registrationFailed') }
    } catch {
      return { success: false, error: i18n.t('auth.unexpectedError') }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    clearAuthStorage()
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
