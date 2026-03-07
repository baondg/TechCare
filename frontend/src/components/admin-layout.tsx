"use client"

import type React from "react"
import { useState } from "react"
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom"
import { LayoutDashboard, Users, Settings,  LogOut, MessageSquareText , Activity, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { logout, user } = useAuth()

  const navigation = [
    { href: "/admin/dashboard", name: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/users", name: "Account Management", icon: Users },
    { href: "/admin/config", name: "System Configuration", icon: Settings },
    { href: "/admin/feedback", name: "Feedback", icon: MessageSquareText },
  ]
  return (
    <div className="min-h-screen w-screen bg-background">
      
      {/* Header */}
      <header className="w-screen sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
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
            {/* {user && (
              <span className="text-sm text-muted-foreground">
                {user.firstName || user.username}
              </span>
            )} */}
            <Button variant="outline" size="lg" onClick={logout} className="text-destructive hover:bg-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)] w-full">
        {/* Sidebar - Desktop */}
        <aside className="md:flex max-h-full w-64 flex-col border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl h-[calc(100vh-4rem)] shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
          <nav className="flex-1 space-y-2 p-4">
            <div className="flex justify-center mb-8 mt-2">
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-linear-to-r from-[#06b6d4] to-[#22d3ee] rounded-full blur-xs opacity-20 group-hover:opacity-40 transition duration-700"></div>

                {/* Badge ch├¡nh ΓÇô nß╗ün trß║»ng/x├ím nhß║ít + viß╗ün gradient mß╗Ång */}
                <div className="relative flex items-center gap-2 rounded-full bg-linear-to-r from-[#06b6d4] to-[#11adc9] dark:bg-gray-900 px-5 py-2.5 ">
                  <UserRound className="h-4 w-4 text-white" strokeWidth={2.5} />
                  <span className="font-bold text-sm tracking-wider text-white dark:text-cyan-500">
                    Admin Portal
                  </span>
                </div>
              </div>
            </div>
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "sidebar"
                      : "nav text-[#0782a0]",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="nav-text">{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 w-full p-0 md:p-4 overflow-y-auto overflow-x-hidden relative z-10">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
