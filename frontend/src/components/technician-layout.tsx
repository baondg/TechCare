import type React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/AppShell'
import { PatientNotificationBell } from '@/components/patient-notification-bell'
import { Activity, Users, CalendarClock, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function TechnicianLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigation: NavItem[] = [
    { name: t("nav.dashboard"), href: '/technician/dashboard', icon: Activity },
    { name: t("nav.patients"), href: '/technician/patients', icon: Users },
    { name: t("nav.workShifts"), href: '/technician/work-shifts', icon: CalendarClock },
    { name: t("nav.feedback"), href: '/technician/feedback', icon: FileText },
  ]

  return (
    <AppShell
      navItems={navigation}
      portalLabel={t("layout.technicianPortal")}
      headerEnd={<PatientNotificationBell />}
    >
      {children}
    </AppShell>
  )
}