"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Activity, User, Stethoscope, ClipboardList } from "lucide-react"
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const router = useNavigate()
  const [role, setRole] = useState<"patient" | "doctor" | "nurse">("patient")

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    // Redirect based on role
    if (role === "patient") {
      router("/patient/dashboard")
    } else {
      router("/doctor/dashboard")        //TODO
    } 
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Activity className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold">TechCare</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Welcome!</CardTitle>
            <CardDescription>Sign in to your TechCare account</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={role} onValueChange={(v) => setRole(v as any)} className="mb-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="patient" className="gap-2 h-7">
                  <User className="h-4 w-4" />
                  Patient
                </TabsTrigger>
                <TabsTrigger value="doctor" className="gap-2 h-7">
                  <Stethoscope className="h-4 w-4" />
                  Hospital Staff
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={
                    role === "patient"
                      ? "patient@example.com"
                      : role === "doctor"
                        ? "doctor@hospital.com"
                        : "nurse@hospital.com"
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required />
              </div>
              <div className="flex items-center justify-between text-sm">
                <Link to="#" className="text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Button type="submit" className="w-full">
                Sign In
              </Button>
            </form>

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link to="/register" className="text-primary hover:underline">
                  Register as Patient
                </Link>
              </div>

          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
