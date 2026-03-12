import type React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/AppShell'
import { Activity, Users, Calendar, FileText } from 'lucide-react'

const navigation: NavItem[] = [
  { name: 'Dashboard',    href: '/doctor/dashboard',    icon: Activity },
  { name: 'Patients',     href: '/doctor/patients',     icon: Users },
  { name: 'Appointments', href: '/doctor/appointments', icon: Calendar },
  { name: 'Feedback',     href: '/doctor/feedback',     icon: FileText },
]

export function DoctorLayout({ children }: { children: React.ReactNode }) {
  return <AppShell navItems={navigation} portalLabel="Doctor Portal">{children}</AppShell>
}