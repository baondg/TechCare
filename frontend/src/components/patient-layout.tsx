"use client"

import type React from "react"
import { useState } from "react"
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Activity, Calendar, FileText, MessageSquare, User, LogOut, Heart, BotMessageSquare, ScanHeart } from "lucide-react"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "Dashboard", href: "/patient/dashboard", icon: Activity },
  { name: "Appointments", href: "/patient/appointments", icon: Calendar },
  { name: "Symptom Checker", href: "/patient/symptom-checker", icon: ScanHeart },
  { name: "Health Info", href: "/patient/health-info", icon: Heart },
  { name: "Medical Records", href: "/patient/records", icon: FileText },
  { name: "AI Chatbot", href: "/patient/chatbot", icon: BotMessageSquare },
  { name: "Profile", href: "/patient/profile", icon: User },
  { name: "Feedback", href: "/patient/feedback", icon: MessageSquare },
]

export function PatientLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="min-h-scree w-screen bg-background">
      {/* Header */}
      <header className="w-full sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="w-full flex h-16 items-center justify-between pl-4 pr-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">TechCare</span>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" size="lg" asChild className="text-destructive hover:bg-destructive">
              <Link to="/">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)] w-full">
        {/* Sidebar - Desktop */}
        <aside className="md:flex w-64 flex-col border-r bg-muted/30 h-[calc(100vh-4rem)] sticky top-16">
          <nav className="flex-1 space-y-1 p-4">
            <span className="w-full block py-2 mb-2 bg-primary/10 text-primary rounded-lg font-bold text-center border-b border-primary/20">Patient Portal</span>
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 w-full p-0 md:p-4 overflow-x-hidden">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
