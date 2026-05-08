"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Shield, Save, RefreshCw, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { emitSuccessToast } from "@/lib/success-toast-bus"

/** Must match backend CONFIG_DEFAULTS (systemConfigurationContract) for rate-limit keys */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"

const RATE_LIMIT_FORM_DEFAULTS = {
  apiRateLimit: "100",
  apiTimeWindow: "60",
  chatbotRateLimit: "20",
  chatbotTimeWindow: "60",
  aiSymptomRateLimit: "10",
  aiSymptomTimeWindow: "60",
  appointmentRateLimit: "10",
  appointmentTimeWindow: "300",
  loginRateLimit: "100",
  loginTimeWindow: "900",
  registrationRateLimit: "20",
  registrationTimeWindow: "3600",
  ipBasedLimit: true,
  enabled: true,
}

export default function RateLimitConfig() {
  const [config, setConfig] = useState({ ...RATE_LIMIT_FORM_DEFAULTS })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error', text: string } | null>(null)
  const token = localStorage.getItem("authToken")

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${API_BASE}/api/system-config`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.error || "Failed to load rate limit config")
        setConfig((prev) => ({
          ...prev,
          enabled: String(data.config.rateLimitEnabled).toLowerCase() === "true",
          ipBasedLimit: String(data.config.rateLimitIpBased).toLowerCase() === "true",
          apiRateLimit: data.config.globalRateLimitRequests || prev.apiRateLimit,
          apiTimeWindow: data.config.globalRateLimitWindowSeconds || prev.apiTimeWindow,
          chatbotRateLimit: data.config.chatbotRateLimitRequests || prev.chatbotRateLimit,
          chatbotTimeWindow: data.config.chatbotRateLimitWindowSeconds || prev.chatbotTimeWindow,
          aiSymptomRateLimit: data.config.aiSymptomRateLimitRequests || prev.aiSymptomRateLimit,
          aiSymptomTimeWindow: data.config.aiSymptomRateLimitWindowSeconds || prev.aiSymptomTimeWindow,
          appointmentRateLimit: data.config.appointmentRateLimitRequests || prev.appointmentRateLimit,
          appointmentTimeWindow: data.config.appointmentRateLimitWindowSeconds || prev.appointmentTimeWindow,
          loginRateLimit: data.config.loginRateLimitRequests || prev.loginRateLimit,
          loginTimeWindow: data.config.loginRateLimitWindowSeconds || prev.loginTimeWindow,
          registrationRateLimit: data.config.registrationRateLimitRequests || prev.registrationRateLimit,
          registrationTimeWindow: data.config.registrationRateLimitWindowSeconds || prev.registrationTimeWindow,
        }))
      } catch (error) {
        setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to load settings." })
      } finally {
        setLoading(false)
      }
    }
    void loadConfig()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/api/system-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rateLimitEnabled: config.enabled,
          rateLimitIpBased: config.ipBasedLimit,
          globalRateLimitRequests: Number(config.apiRateLimit),
          globalRateLimitWindowSeconds: Number(config.apiTimeWindow),
          chatbotRateLimitRequests: Number(config.chatbotRateLimit),
          chatbotRateLimitWindowSeconds: Number(config.chatbotTimeWindow),
          aiSymptomRateLimitRequests: Number(config.aiSymptomRateLimit),
          aiSymptomRateLimitWindowSeconds: Number(config.aiSymptomTimeWindow),
          appointmentRateLimitRequests: Number(config.appointmentRateLimit),
          appointmentRateLimitWindowSeconds: Number(config.appointmentTimeWindow),
          loginRateLimitRequests: Number(config.loginRateLimit),
          loginRateLimitWindowSeconds: Number(config.loginTimeWindow),
          registrationRateLimitRequests: Number(config.registrationRateLimit),
          registrationRateLimitWindowSeconds: Number(config.registrationTimeWindow),
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to save settings")
      emitSuccessToast("Rate limit settings saved successfully!")
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save settings. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setConfig({ ...RATE_LIMIT_FORM_DEFAULTS })
    emitSuccessToast("Settings reset to defaults.")
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Rate Limit Configuration</h2>
            <p className="text-gray-600 mt-2">Configure rate limiting to protect your API from abuse</p>
          </div>
        </div>

        {/* Alert Messages */}
        {message && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* Global Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Global Rate Limit Settings
            </CardTitle>
            <CardDescription>
              Control the overall rate limiting behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-base font-medium">Enable Rate Limiting</Label>
                <p className="text-sm text-gray-600">Turn rate limiting on or off globally</p>
              </div>
              <Button
                type="button"
                variant={config.enabled ? "default" : "outline"}
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                className={
                  config.enabled
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
                }
              >
                {config.enabled ? "Enabled" : "Disabled"}
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-base font-medium">IP-Based Rate Limiting</Label>
                <p className="text-sm text-gray-600">Track limits per IP address instead of per user</p>
              </div>
              <Button
                type="button"
                variant={config.ipBasedLimit ? "default" : "outline"}
                onClick={() => setConfig({ ...config, ipBasedLimit: !config.ipBasedLimit })}
                className={
                  config.ipBasedLimit
                    ? "bg-sky-600 text-white hover:bg-sky-700 hover:text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
                }
              >
                {config.ipBasedLimit ? "Enabled" : "Disabled"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* API Rate Limits */}
        <Card>
          <CardHeader>
            <CardTitle>General API Requests</CardTitle>
            <CardDescription>
              Limit all API requests to prevent server overload and abuse
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="apiRateLimit">Max Requests</Label>
                <Input
                  id="apiRateLimit"
                  type="number"
                  value={config.apiRateLimit}
                  onChange={(e) => setConfig({ ...config, apiRateLimit: e.target.value })}
                  placeholder="100"
                />
                <p className="text-xs text-gray-500 mt-1">Total requests allowed</p>
              </div>
              <div>
                <Label htmlFor="apiTimeWindow">Time Window (seconds)</Label>
                <Input
                  id="apiTimeWindow"
                  type="number"
                  value={config.apiTimeWindow}
                  onChange={(e) => setConfig({ ...config, apiTimeWindow: e.target.value })}
                  placeholder="60"
                />
                <p className="text-xs text-gray-500 mt-1">Period to count requests</p>
              </div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                Current setting: <strong>{config.apiRateLimit} requests per {config.apiTimeWindow} seconds</strong>
              </p>
              <p className="text-xs text-blue-700 mt-1">Applies to all API endpoints including health records, appointments, profile updates</p>
            </div>
          </CardContent>
        </Card>

        {/* AI Chatbot Rate Limits */}
        <Card>
          <CardHeader>
            <CardTitle>AI Chatbot Requests</CardTitle>
            <CardDescription>
              Limit chatbot/AI interactions to manage API costs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="chatbotRateLimit">Max Chatbot Messages</Label>
                <Input
                  id="chatbotRateLimit"
                  type="number"
                  value={config.chatbotRateLimit}
                  onChange={(e) => setConfig({ ...config, chatbotRateLimit: e.target.value })}
                  placeholder="20"
                />
                <p className="text-xs text-gray-500 mt-1">Messages per time window</p>
              </div>
              <div>
                <Label htmlFor="chatbotTimeWindow">Time Window (seconds)</Label>
                <Input
                  id="chatbotTimeWindow"
                  type="number"
                  value={config.chatbotTimeWindow}
                  onChange={(e) => setConfig({ ...config, chatbotTimeWindow: e.target.value })}
                  placeholder="60"
                />
                <p className="text-xs text-gray-500 mt-1">Duration to count messages</p>
              </div>
            </div>
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-md">
              <p className="text-sm text-purple-800">
                Current setting: <strong>{config.chatbotRateLimit} messages per {config.chatbotTimeWindow} seconds</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Symptom Checker Rate Limits */}
        <Card>
          <CardHeader>
            <CardTitle>AI Symptom Analysis</CardTitle>
            <CardDescription>
              Limit symptom checker requests to prevent abuse
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="aiSymptomRateLimit">Max Analyses</Label>
                <Input
                  id="aiSymptomRateLimit"
                  type="number"
                  value={config.aiSymptomRateLimit}
                  onChange={(e) => setConfig({ ...config, aiSymptomRateLimit: e.target.value })}
                  placeholder="10"
                />
                <p className="text-xs text-gray-500 mt-1">Symptom checks allowed</p>
              </div>
              <div>
                <Label htmlFor="aiSymptomTimeWindow">Time Window (seconds)</Label>
                <Input
                  id="aiSymptomTimeWindow"
                  type="number"
                  value={config.aiSymptomTimeWindow}
                  onChange={(e) => setConfig({ ...config, aiSymptomTimeWindow: e.target.value })}
                  placeholder="60"
                />
                <p className="text-xs text-gray-500 mt-1">Duration to count requests</p>
              </div>
            </div>
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-md">
              <p className="text-sm text-indigo-800">
                Current setting: <strong>{config.aiSymptomRateLimit} analyses per {config.aiSymptomTimeWindow} seconds</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Appointment Booking Rate Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Appointment Booking</CardTitle>
            <CardDescription>
              Prevent spam booking attempts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="appointmentRateLimit">Max Bookings</Label>
                <Input
                  id="appointmentRateLimit"
                  type="number"
                  value={config.appointmentRateLimit}
                  onChange={(e) => setConfig({ ...config, appointmentRateLimit: e.target.value })}
                  placeholder="10"
                />
                <p className="text-xs text-gray-500 mt-1">Booking requests allowed</p>
              </div>
              <div>
                <Label htmlFor="appointmentTimeWindow">Time Window (seconds)</Label>
                <Input
                  id="appointmentTimeWindow"
                  type="number"
                  value={config.appointmentTimeWindow}
                  onChange={(e) => setConfig({ ...config, appointmentTimeWindow: e.target.value })}
                  placeholder="300"
                />
                <p className="text-xs text-gray-500 mt-1">Duration to count bookings</p>
              </div>
            </div>
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-md">
              <p className="text-sm text-teal-800">
                Current setting: <strong>{config.appointmentRateLimit} bookings per {config.appointmentTimeWindow} seconds</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Login Rate Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Login Attempts</CardTitle>
            <CardDescription>
              Protect against brute force attacks on login endpoints
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="loginRateLimit">Max Attempts</Label>
                <Input
                  id="loginRateLimit"
                  type="number"
                  value={config.loginRateLimit}
                  onChange={(e) => setConfig({ ...config, loginRateLimit: e.target.value })}
                  placeholder="100"
                />
                <p className="text-xs text-gray-500 mt-1">Failed login attempts allowed</p>
              </div>
              <div>
                <Label htmlFor="loginTimeWindow">Lockout Duration (seconds)</Label>
                <Input
                  id="loginTimeWindow"
                  type="number"
                  value={config.loginTimeWindow}
                  onChange={(e) => setConfig({ ...config, loginTimeWindow: e.target.value })}
                  placeholder="900"
                />
                <p className="text-xs text-gray-500 mt-1">How long to block after limit</p>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm text-amber-800">
                Current setting: <strong>{config.loginRateLimit} attempts, then {config.loginTimeWindow} second lockout</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Registration Rate Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Registration</CardTitle>
            <CardDescription>
              Prevent spam account creation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="registrationRateLimit">Max Registrations</Label>
                <Input
                  id="registrationRateLimit"
                  type="number"
                  value={config.registrationRateLimit}
                  onChange={(e) => setConfig({ ...config, registrationRateLimit: e.target.value })}
                  placeholder="20"
                />
                <p className="text-xs text-gray-500 mt-1">Accounts per IP address</p>
              </div>
              <div>
                <Label htmlFor="registrationTimeWindow">Time Window (seconds)</Label>
                <Input
                  id="registrationTimeWindow"
                  type="number"
                  value={config.registrationTimeWindow}
                  onChange={(e) => setConfig({ ...config, registrationTimeWindow: e.target.value })}
                  placeholder="3600"
                />
                <p className="text-xs text-gray-500 mt-1">Duration to count registrations</p>
              </div>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                Current setting: <strong>{config.registrationRateLimit} registrations per {config.registrationTimeWindow} seconds</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-6 right-10 z-40 flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={loading}
          aria-label="Reset rate limit settings to defaults"
          className="h-12 w-12 rounded-full border-slate-300 bg-white text-slate-800 shadow-lg hover:bg-slate-50 hover:text-slate-900"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={loading}
          aria-label="Save rate limit changes"
          className="h-12 w-12 rounded-full bg-[#0086C4] text-white shadow-lg hover:bg-[#0078b0] hover:text-white border border-[#006a9e]"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
    </AdminLayout>
  )
}
