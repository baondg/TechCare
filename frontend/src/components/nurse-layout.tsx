import type React from 'react'
import { AppShell } from '@/components/layout/app-shell'
import type { NavItem } from '@/components/layout/app-shell'
import { PatientNotificationBell } from '@/components/patient-notification-bell'
import { Activity, Users, Calendar, CalendarClock, FileText, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function NurseLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigation: NavItem[] = [
    { name: t("nav.dashboard"), href: '/nurse/dashboard', icon: Activity },
    { name: t("nav.patientRegistration"), href: '/nurse/patient-registration', icon: UserPlus },
    { name: t("nav.patientCheckIn"), href: '/nurse/patients', icon: Users },
    { name: t("nav.appointments"), href: '/nurse/appointments', icon: Calendar },
    { name: t("nav.workShifts"), href: '/nurse/work-shifts', icon: CalendarClock },
    { name: t("nav.feedback"), href: '/nurse/feedback', icon: FileText },
  ]

  return (
    <AppShell navItems={navigation} portalLabel={t("layout.nursePortal")} headerEnd={<PatientNotificationBell />}>
      {children}
    </AppShell>
  )
}