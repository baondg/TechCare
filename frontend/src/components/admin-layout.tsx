import type React from 'react'
import { AppShell } from '@/components/layout/app-shell'
import type { NavItem } from '@/components/layout/app-shell'
import { LayoutDashboard, Users, Settings, MessageSquareText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigation: NavItem[] = [
    { href: '/admin/dashboard', name: t("nav.dashboard"), icon: LayoutDashboard },
    { href: '/admin/users', name: t("nav.accountManagement"), icon: Users },
    { href: '/admin/config', name: t("nav.systemConfiguration"), icon: Settings },
    { href: '/admin/feedback', name: t("nav.feedbackManagement"), icon: MessageSquareText },
  ]

  return <AppShell navItems={navigation} portalLabel={t("layout.adminPortal")}>{children}</AppShell>
}