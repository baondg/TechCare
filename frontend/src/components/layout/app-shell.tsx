/**
 * AppShell — shared layout shell used by every role-specific layout.
 *
 * Responsive behavior:
 *   ≥1025px (desktop)  → full sidebar with text labels
 *   769–1024px (tablet) → full sidebar with text labels
 *   ≤768px (mobile)    → bottom navigation bar, no sidebar
 *
 * Click the sidebar (outside nav links) to expand/collapse. Nav links only navigate.
 * On mobile the sidebar is hidden entirely and replaced with a fixed bottom nav.
 */

import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Activity, LogOut, UserRound, Menu, Bell, KeyRound } from 'lucide-react'
import { CHANGE_PASSWORD_PATH } from '@/lib/auth-paths'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth, type User } from '@/contexts/auth-context'
import { NotificationBell } from '@/components/notification-bell'
import { LanguageToggle } from '@/components/language-toggle'
import { useTranslation } from 'react-i18next'

function sidebarUserLabel(portalLabel: string, user: User | null | undefined, guestLabel: string): string {
  if (portalLabel === 'Admin Portal') return portalLabel
  if (!user) return guestLabel
  const fromNames = [user.lastName, user.firstName].filter(Boolean).join(' ').trim()
  if (fromNames) return fromNames
  return (user.fullName || '').trim() || user.username || guestLabel
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
const MOBILE_BREAKPOINT = 768
const COMPACT_BREAKPOINT = 1024

function useBreakpoint() {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  )

  useEffect(() => {
    let raf: number
    const handleResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setWidth(window.innerWidth))
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(raf)
    }
  }, [])

  return {
    isMobile: width <= MOBILE_BREAKPOINT,
    isCompact: width > MOBILE_BREAKPOINT && width <= COMPACT_BREAKPOINT,
    isDesktop: width > COMPACT_BREAKPOINT,
    width,
  }
}

export function AppShell({ children, navItems, portalLabel, headerEnd }: AppShellProps) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { logout, user } = useAuth()
  const { isMobile, isCompact } = useBreakpoint()

  const [manualCollapsed, setManualCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  // On compact (≤1024px), default to collapsed. On desktop, use manual preference.
  const sidebarCollapsed = isMobile ? true : isCompact ? !manualCollapsed ? true : manualCollapsed : manualCollapsed

  const toggleSidebar = useCallback(() => {
    setManualCollapsed(c => {
      const next = !c
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch { /* ignore */ }
      return next
    })
  }, [])

  const onSidebarBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const t = e.target as HTMLElement
      if (t.closest('a[href]')) return
      toggleSidebar()
    },
    [toggleSidebar]
  )

  const userBadgeLabel = sidebarUserLabel(portalLabel, user, t("common.guest"))

  // ── Mobile bottom nav ──
  if (isMobile) {
    return (
      <div className="flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-background">
        {/* Header */}
        <header className="w-full shrink-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="w-full flex h-14 items-center justify-between px-4">
            <div className="group flex items-center gap-2">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-[#06b6d4] to-[#0891b2] p-0.5 shadow-lg">
                <div className="flex h-full w-full items-center justify-center rounded-lg">
                  <Activity className="h-5 w-5 text-white" />
                </div>
              </div>
              <span className="text-xl font-bold bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent">
                TechCare
              </span>
            </div>

            <div className="flex items-center gap-1">
              <LanguageToggle />
              {headerEnd ?? <NotificationBell />}
              <Button asChild variant="ghost" size="icon" className="h-9 w-9" title={t("auth.changePassword.title")}>
                <Link to={CHANGE_PASSWORD_PATH} aria-label={t("auth.changePassword.title")}>
                  <KeyRound className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={logout} className="h-9 w-9 text-destructive">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Main content — only this region scrolls so the scrollbar sits below the header */}
        <main className="relative z-10 min-h-0 flex-1 w-full overflow-y-auto overflow-x-hidden px-3 pt-5 pb-20 md:pt-6">
          <div className="w-full">{children}</div>
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
            {navItems.slice(0, 5).map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl min-w-0 flex-1 transition-all duration-200',
                    isActive
                      ? 'text-[#0891b2]'
                      : 'text-slate-400 hover:text-slate-600'
                  )}
                >
                  <div className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-300',
                    isActive && 'bg-gradient-to-br from-[#06b6d4] to-[#0891b2] shadow-md'
                  )}>
                    <item.icon className={cn('h-4 w-4 shrink-0', isActive && 'text-white')} />
                  </div>
                  <span className={cn(
                    'text-[10px] font-medium truncate max-w-[60px] leading-tight',
                    isActive && 'font-semibold text-[#0891b2]'
                  )}>
                    {item.name}
                  </span>
                </Link>
              )
            })}
            {navItems.length > 5 && (
              <Link
                to={navItems[5]?.href || '#'}
                className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl min-w-0 flex-1 text-slate-400"
              >
                <div className="flex items-center justify-center w-8 h-8">
                  <Menu className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-medium">{t("common.more")}</span>
              </Link>
            )}
          </div>
        </nav>
      </div>
    )
  }

  // ── Desktop / Tablet sidebar layout ──
  return (
    <div className="flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-background">

      {/* ── Header ── */}
      <header className="w-full shrink-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
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
          <div className="flex items-center gap-2 pr-1.5 md:pr-2">
            <LanguageToggle />

            {headerEnd ?? (
              <Button
                variant="ghost"
                size="icon"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                aria-label={t("common.notifications")}
              >
                <Bell className="h-5 w-5" />
              </Button>
            )}

            <Button asChild variant="ghost" size="icon" title={t("auth.changePassword.title")}>
              <Link to={CHANGE_PASSWORD_PATH} aria-label={t("auth.changePassword.title")}>
                <KeyRound className="h-5 w-5" />
              </Link>
            </Button>

            {/* Logout */}
            <Button
              variant="outline"
              size="lg"
              onClick={logout}
              className="text-destructive hover:bg-destructive hover:text-white"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t("common.logout")}
            </Button>

          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 w-full">

        {/* ── Sidebar (click background to expand/collapse; links only navigate) ── */}
        <div className="relative z-40 flex h-full min-h-0 shrink-0 flex-col">
          <aside
            onClick={onSidebarBackgroundClick}
            aria-label={
              sidebarCollapsed
                ? t("layout.sidebarCollapsed")
                : t("layout.sidebarExpanded")
            }
            className={cn(
              'flex max-h-full h-full flex-col border-r border-white/40 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] transition-[width] duration-200 ease-in-out overflow-hidden cursor-pointer',
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
        </div>

        {/* ── Main content ── */}
        <main className="relative z-10 min-h-0 flex-1 w-full overflow-y-auto overflow-x-hidden px-3 pt-5 pb-2 md:px-4 md:pt-6 md:pb-4 lg:px-6">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
