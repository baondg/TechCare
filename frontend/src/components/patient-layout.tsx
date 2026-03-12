import type React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/AppShell'
import { Airplay, Calendar, ScanHeart, Heart, FileText, BotMessageSquare, User, MessageSquare } from 'lucide-react'

const navigation: NavItem[] = [
  { name: 'Dashboard',       href: '/patient/dashboard',      icon: Airplay },
  { name: 'Appointments',    href: '/patient/appointments',   icon: Calendar },
  { name: 'Symptom Checker', href: '/patient/symptom-checker',icon: ScanHeart },
  { name: 'Health Info',     href: '/patient/health-info',    icon: Heart },
  { name: 'History',         href: '/patient/records',        icon: FileText },
  { name: 'AI Chatbot',      href: '/patient/chatbot',        icon: BotMessageSquare },
  { name: 'Profile',         href: '/patient/profile',        icon: User },
  { name: 'Feedback',        href: '/patient/feedback',       icon: MessageSquare },
]

export function PatientLayout({ children }: { children: React.ReactNode }) {
  return <AppShell navItems={navigation} portalLabel="Patient Portal">{children}</AppShell>
}

