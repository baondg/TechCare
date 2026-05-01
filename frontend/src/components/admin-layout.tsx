import type React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/AppShell'
import { LayoutDashboard, Users, Settings, MessageSquareText, Shield } from 'lucide-react'

const navigation: NavItem[] = [
  { href: '/admin/dashboard', name: 'Dashboard',            icon: LayoutDashboard },
  { href: '/admin/users',     name: 'Account Management',   icon: Users },
  { href: '/admin/config',    name: 'System Configuration', icon: Settings },
  { href: '/admin/ratelimit', name: 'Rate Limits',          icon: Shield },
  { href: '/admin/feedback',  name: 'Feedback Management',  icon: MessageSquareText },
]

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell navItems={navigation} portalLabel="Admin Portal">{children}</AppShell>
}