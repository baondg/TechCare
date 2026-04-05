/**
 * AppShell — shared layout shell used by every role-specific layout.
 *
 * Replaces 5 nearly-identical layout files (patient, doctor, nurse,
 * technician, admin) with a single reusable component.
 *
 * Props:
 *   navItems    — sidebar navigation links for the current role
 *   portalLabel — badge text shown at the top of the sidebar ("Patient Portal", …)
 *   children    — page content
 */

import type React from 'react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Activity, Bell, ChevronLeft, ChevronRight, LogOut, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth, type User } from '@/contexts/AuthContext'

function sidebarUserLabel(portalLabel: string, user: User | null | undefined): string {
  if (portalLabel === 'Admin Portal') return portalLabel
  if (!user) return 'Guest'
  const fromNames = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  if (fromNames) return fromNames
  return (user.fullName || '').trim() || user.username || 'Guest'
}

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
}

interface AppShellProps {
  children: React.ReactNode
  navItems: NavItem[]
  portalLabel: string
  /** Replaces the default header bell when set (e.g. patient notifications). */
  headerEnd?: React.ReactNode
}

const SIDEBAR_COLLAPSED_KEY = 'techcare-sidebar-collapsed'

export function AppShell({ children, navItems, portalLabel, headerEnd }: AppShellProps) {
  const { pathname } = useLocation()
  const { logout, user } = useAuth()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed])

  const userBadgeLabel = sidebarUserLabel(portalLabel, user)

  return (
    <div className="min-h-screen w-screen bg-background">

      {/* ── Header ── */}
      <header className="w-screen sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="w-full flex h-16 items-center justify-between pl-4 pr-4">

          {/* Logo */}
          <div className="group flex items-center justify-center gap-2">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-[#06b6d4] to-[#0891b2] p-0.5 shadow-lg">
              <div className="flex h-full w-full items-center justify-center rounded-lg">
                <Activity className="h-6 w-6 text-[#FFFFFF]" />
              </div>
            </div>
            <span className="text-2xl font-bold bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent">
              TechCare
            </span>
          </div>

          {/* Logout */}
          <div className="flex items-center gap-2">

            {headerEnd ?? (
              <Button
                variant="ghost"
                size="icon"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </Button>
            )}

            {/* Logout */}
            <Button
              variant="outline"
              size="lg"
              onClick={logout}
              className="text-destructive hover:bg-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>

          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)] w-full">

        {/* ── Sidebar + edge toggle (toggle centered on the divider) ── */}
        <div className="relative shrink-0 sticky top-16 h-[calc(100vh-4rem)] self-start z-40">
          <aside
            className={cn(
              'flex max-h-full h-full flex-col border-r border-white/40 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] transition-[width] duration-200 ease-in-out overflow-hidden',
              sidebarCollapsed ? 'w-[4.25rem]' : 'w-64',
            )}
          >
            <nav className="flex-1 flex flex-col space-y-2 p-2 md:p-3 min-h-0 pt-4">
              {/* Portal badge */}
              <div
                className={cn('flex justify-center mb-6 w-full px-0.5', sidebarCollapsed && 'mb-4')}
                title={userBadgeLabel}
              >
                <div className="group relative w-full max-w-full flex justify-center">
                  <div
                    className={cn(
                      'absolute -inset-0.5 bg-linear-to-r from-[#06b6d4] to-[#22d3ee] blur-xs opacity-20 group-hover:opacity-40 transition duration-700',
                      sidebarCollapsed ? 'rounded-full' : 'rounded-2xl',
                    )}
                  />
                  <div
                    className={cn(
                      'relative flex w-full max-w-full bg-linear-to-r from-[#06b6d4] to-[#11adc9] dark:bg-gray-900 text-white',
                      sidebarCollapsed
                        ? 'items-center justify-center rounded-full p-2.5'
                        : 'flex-col items-center gap-2 rounded-2xl px-3 py-3 text-center',
                    )}
                  >
                    <UserRound className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                    {!sidebarCollapsed && (
                      <span className="w-full font-bold text-sm tracking-wide text-white dark:text-cyan-500 break-words whitespace-normal leading-snug">
                        {userBadgeLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Nav links */}
              <div className="space-y-1 flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                {navItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      title={item.name}
                      className={cn(
                        'flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
                        sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                        isActive ? 'sidebar' : 'nav text-[#0782a0]',
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!sidebarCollapsed && <span className="nav-text truncate">{item.name}</span>}
                    </Link>
                  )
                })}
              </div>
            </nav>
          </aside>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              'absolute top-1/2 left-full h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-md',
              'hover:bg-cyan-50 hover:text-cyan-800 hover:border-cyan-300 z-50',
            )}
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* ── Main content ── */}
        <main className="flex-1 w-full p-0 md:p-4 overflow-y-auto overflow-x-hidden relative z-10">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
