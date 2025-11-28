"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Activity, User, Stethoscope, Eye, EyeOff } from "lucide-react"
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const router = useNavigate()
  const [role, setRole] = useState<"patient" | "hospital staff" | "admin">("patient")
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    // Redirect based on role
    if (role === "patient") {
      router("/patient/dashboard")
    } else if (role === "hospital staff" || role === "admin") {
      router("/admin/dashboard")        //TODO
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
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="patient" className="gap-2 h-7">
                  <User className="h-4 w-4" />
                  Patient
                </TabsTrigger>
                <TabsTrigger value="hospital staff" className="gap-2 h-7">
                  <Stethoscope className="h-4 w-4" />
                  Hospital Staff
                </TabsTrigger>
                <TabsTrigger value="admin" className="gap-2 h-7">
                  <Stethoscope className="h-4 w-4" />
                  Admin
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="username"
                  placeholder={
                    role === "patient"
                      ? "Enter username"
                      : role === "hospital staff"
                        ? "Enter username"
                        : "Enter username"
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative"> 
                    <Input 
                        id="password" 
                        type={showPassword ? "text" : "password"} 
                        placeholder="Enter password" 
                        required 
                        className="pr-10" // Thêm padding-right để nhường chỗ cho icon
                    />
                    <button
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute bg-accent-foreground mx-1 my-1 inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground focus-visible:ring-0 focus:outline-none" // Loại bỏ viền focus khi click
                    >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <Link to="#" className="text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Button type="submit" size="default" className="w-full">
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
