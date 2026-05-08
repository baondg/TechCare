import type React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/AppShell'
import { PatientNotificationBell } from '@/components/patient-notification-bell'
import { Airplay, Calendar, ScanHeart, Heart, FileText, BotMessageSquare, User, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function PatientLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigation: NavItem[] = [
    { name: t("nav.dashboard"), href: '/patient/dashboard', icon: Airplay },
    { name: t("nav.appointments"), href: '/patient/appointments', icon: Calendar },
    { name: t("nav.symptomChecker"), href: '/patient/symptom-checker', icon: ScanHeart },
    { name: t("nav.healthInfo"), href: '/patient/health-info', icon: Heart },
    { name: t("nav.history"), href: '/patient/history', icon: FileText },
    { name: t("nav.aiChatbot"), href: '/patient/chatbot', icon: BotMessageSquare },
    { name: t("nav.profile"), href: '/patient/profile', icon: User },
    { name: t("nav.feedback"), href: '/patient/feedback', icon: MessageSquare },
  ]

  return (
    <AppShell
      navItems={navigation}
      portalLabel={t("layout.patientPortal")}
      headerEnd={<PatientNotificationBell />}
    >
      {children}
    </AppShell>
  )
}

