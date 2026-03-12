import type React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/AppShell'
import { Activity, Users, FileText } from 'lucide-react'

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/technician/dashboard', icon: Activity },
  { name: 'Patients',  href: '/technician/patients',  icon: Users },
  { name: 'Feedback',  href: '/technician/feedback',  icon: FileText },
]

export function TechnicianLayout({ children }: { children: React.ReactNode }) {
  return <AppShell navItems={navigation} portalLabel="Technician Portal">{children}</AppShell>
}