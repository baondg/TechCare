import type React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/AppShell'
import { PatientNotificationBell } from '@/components/patient-notification-bell'
import { Activity, Users, Calendar, CalendarClock, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigation: NavItem[] = [
    { name: t("nav.dashboard"), href: '/doctor/dashboard', icon: Activity },
    { name: t("nav.patients"), href: '/doctor/patients', icon: Users },
    { name: t("nav.appointments"), href: '/doctor/appointments', icon: Calendar },
    { name: t("nav.workShifts"), href: '/doctor/work-shifts', icon: CalendarClock },
    { name: t("nav.feedback"), href: '/doctor/feedback', icon: FileText },
  ]

  return (
    <AppShell navItems={navigation} portalLabel={t("layout.doctorPortal")} headerEnd={<PatientNotificationBell />}>
      {children}
    </AppShell>
  )
}