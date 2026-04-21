import type React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/AppShell'
import { PatientNotificationBell } from '@/components/patient-notification-bell'
import { Activity, Users, Calendar, CalendarClock, FileText, UserPlus } from 'lucide-react'

const navigation: NavItem[] = [
  { name: 'Dashboard',             href: '/nurse/dashboard',             icon: Activity },
  { name: 'Patient Registration', href: '/nurse/patient-registration', icon: UserPlus },
  { name: 'Patient Check-in',      href: '/nurse/patients',              icon: Users },
  { name: 'Appointments', href: '/nurse/appointments', icon: Calendar },
  { name: 'Work shifts',  href: '/nurse/work-shifts',  icon: CalendarClock },
  { name: 'Feedback',     href: '/nurse/feedback',     icon: FileText },
]

export function NurseLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell navItems={navigation} portalLabel="Nurse Portal" headerEnd={<PatientNotificationBell />}>
      {children}
    </AppShell>
  )
}