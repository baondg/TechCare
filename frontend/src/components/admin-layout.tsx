"use client"

import type React from "react"
import { useState } from "react"
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom"
import { LayoutDashboard, Users, Settings,  LogOut, MessageSquareText , Activity, Shield, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { logout, user } = useAuth()

  const navigation = [
    { href: "/admin/dashboard", name: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/users", name: "Account Management", icon: Users },
    { href: "/admin/system-config", name: "System Config", icon: Settings },
    { href: "/admin/rate-limit", name: "Rate Limit", icon: Shield },
    { href: "/admin/backup", name: "Backup", icon: Database },
    { href: "/admin/feedback", name: "Feedback", icon: MessageSquareText },
  ]

  return (
    <div className="n w-screen bg-background">
          {/* Header */}
          <header className="w-full sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
            <div className="w-full flex h-16 items-center justify-between pl-4 pr-4">
              <div className="group flex items-center justify-center gap-2">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-[#06b6d4] to-[#0891b2] p-0.5 shadow-lg">
                  <div className="flex h-full w-full items-center justify-center rounded-lg">
                    <Activity className="h-6 w-6 text-[#FFFFFF]" />
                  </div>
                </div>
                <span className="text-2xl font-bold bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent">
                  TechCare
                </span>
              </div>
    
              <div className="flex items-center gap-4">
                {user && (
                  <span className="text-sm text-muted-foreground">
                    Admin: {user.firstName || user.username}
                  </span>
                )}
                <Button variant="outline" size="lg" onClick={logout} className="text-destructive hover:bg-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </header>          <div className="flex min-h-[calc(100vh-4rem)] w-full">
            {/* Sidebar - Desktop */}
            <aside className="md:flex w-64 flex-col border-r bg-muted/30 h-[calc(100vh-4rem)] sticky top-16">
              <nav className="flex-1 space-y-1 p-4">
                <span className="w-full block py-2 mb-2 bg-primary/10 text-primary rounded-lg font-bold text-center border-b border-primary/20">Admin Portal</span>
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
