/**
 * Real React Context for authentication.
 *
 * - Reads initial user from localStorage so page refreshes keep the session.
 * - `AuthProvider` must wrap the app in main.tsx.
 * - `useAuth()` throws if used outside the provider.
 */

import { createContext, useContext, useState } from 'react'
import type React from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

// ── Types ──────────────────────────────────────────────────────

export interface User {
  id: number
  username: string
  email: string
  firstName?: string
  lastName?: string
  role?: string
}

interface RegisterData {
  username: string
  email: string
  password: string
  firstName: string
  lastName: string
  age?: number
  role?: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  register: (userData: RegisterData) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

// ── Context ────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null)

// ── Provider ───────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('user')
      return stored ? (JSON.parse(stored) as User) : null
    } catch {
      return null
    }
  })
  const [isLoading, setIsLoading] = useState(false)

  const isAuthenticated = user !== null

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json() as { success?: boolean; token?: string; user?: User; expiresAt?: string; error?: string }

      if (res.ok && data.success && data.token && data.user) {
        localStorage.setItem('authToken', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        if (data.expiresAt) localStorage.setItem('sessionExpiresAt', data.expiresAt)
        setUser(data.user)
        return { success: true }
      }
      return { success: false, error: data.error ?? 'Login failed' }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (userData: RegisterData): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
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
      return { success: false, error: data.error ?? 'Registration failed' }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    localStorage.removeItem('sessionExpiresAt')
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
