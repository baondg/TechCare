"use client"

import { useState, useEffect, type ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Save, Settings, Loader2, Shield, RefreshCw, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useTranslation } from "react-i18next"
import { emitErrorToast, emitSuccessToast } from "@/lib/toast-bus"
import { apiClient } from "@/api/client"

/** Must match backend CONFIG_DEFAULTS for rate-limit keys */
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

type SystemConfigForm = {
  maxUsers: string
  sessionTimeout: string
  apiRateLimit: string
  apiTimeWindow: string
  chatbotRateLimit: string
  chatbotTimeWindow: string
  aiSymptomRateLimit: string
  aiSymptomTimeWindow: string
  appointmentRateLimit: string
  appointmentTimeWindow: string
  loginRateLimit: string
  loginTimeWindow: string
  registrationRateLimit: string
  registrationTimeWindow: string
  ipBasedLimit: boolean
  rateLimitEnabled: boolean
}

const INITIAL_FORM: SystemConfigForm = {
  maxUsers: "500",
  sessionTimeout: "30",
  ...RATE_LIMIT_FORM_DEFAULTS,
  rateLimitEnabled: RATE_LIMIT_FORM_DEFAULTS.enabled,
}

function mapApiToForm(c: Record<string, string> | undefined, prev: SystemConfigForm): SystemConfigForm {
  if (!c) return prev
  return {
    maxUsers: c.maxConcurrentUsers || prev.maxUsers,
    sessionTimeout: c.sessionTimeoutMinutes || prev.sessionTimeout,
    rateLimitEnabled: String(c.rateLimitEnabled ?? prev.rateLimitEnabled).toLowerCase() === "true",
    ipBasedLimit: String(c.rateLimitIpBased ?? prev.ipBasedLimit).toLowerCase() === "true",
    apiRateLimit: c.globalRateLimitRequests || prev.apiRateLimit,
    apiTimeWindow: c.globalRateLimitWindowSeconds || prev.apiTimeWindow,
    chatbotRateLimit: c.chatbotRateLimitRequests || prev.chatbotRateLimit,
    chatbotTimeWindow: c.chatbotRateLimitWindowSeconds || prev.chatbotTimeWindow,
    aiSymptomRateLimit: c.aiSymptomRateLimitRequests || prev.aiSymptomRateLimit,
    aiSymptomTimeWindow: c.aiSymptomRateLimitWindowSeconds || prev.aiSymptomTimeWindow,
    appointmentRateLimit: c.appointmentRateLimitRequests || prev.appointmentRateLimit,
    appointmentTimeWindow: c.appointmentRateLimitWindowSeconds || prev.appointmentTimeWindow,
    loginRateLimit: c.loginRateLimitRequests || prev.loginRateLimit,
    loginTimeWindow: c.loginRateLimitWindowSeconds || prev.loginTimeWindow,
    registrationRateLimit: c.registrationRateLimitRequests || prev.registrationRateLimit,
    registrationTimeWindow: c.registrationRateLimitWindowSeconds || prev.registrationTimeWindow,
  }
}

function RateLimitPair({
  limitId,
  windowId,
  limitLabel,
  windowLabel,
  limitValue,
  windowValue,
  onLimitChange,
  onWindowChange,
  summary,
  summaryClassName,
}: {
  limitId: string
  windowId: string
  limitLabel: string
  windowLabel: string
  limitValue: string
  windowValue: string
  onLimitChange: (v: string) => void
  onWindowChange: (v: string) => void
  summary: ReactNode
  summaryClassName: string
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={limitId}>{limitLabel}</Label>
          <Input
            id={limitId}
            type="number"
            value={limitValue}
            onChange={(e) => onLimitChange(e.target.value)}
            className="custom-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={windowId}>{windowLabel}</Label>
          <Input
            id={windowId}
            type="number"
            value={windowValue}
            onChange={(e) => onWindowChange(e.target.value)}
            className="custom-input"
          />
        </div>
      </div>
      <div className={`rounded-md border p-3 text-sm ${summaryClassName}`}>{summary}</div>
    </div>
  )
}

export default function SystemConfig() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<SystemConfigForm>(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const data = await apiClient.get<{
          success: boolean
          config?: Record<string, string>
          error?: string
        }>("/api/system-config")
        if (!data.success) throw new Error(data.error || "Failed to load configuration")
        setConfig((prev) => mapApiToForm(data.config, prev))
      } catch (error) {
        console.error("Error loading config:", error)
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to load configuration",
        })
      } finally {
        setLoading(false)
      }
    }
    void loadConfig()
  }, [])

  useEffect(() => {
    if (!message || message.type !== "error") return
    emitErrorToast(message.text)
    setMessage(null)
  }, [message])

  const patch = (partial: Partial<SystemConfigForm>) => {
    setConfig((prev) => ({ ...prev, ...partial }))
    setMessage(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const data = await apiClient.put<{ success: boolean; error?: string }>("/api/system-config", {
        maxConcurrentUsers: parseInt(config.maxUsers, 10),
        sessionTimeoutMinutes: parseInt(config.sessionTimeout, 10),
        rateLimitEnabled: config.rateLimitEnabled,
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
      })
      if (!data.success) throw new Error(data.error || "Failed to save configuration")
      emitSuccessToast("System configuration saved successfully!")
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Network error. Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setConfig((prev) => ({
      ...prev,
      ...RATE_LIMIT_FORM_DEFAULTS,
      rateLimitEnabled: RATE_LIMIT_FORM_DEFAULTS.enabled,
    }))
    emitSuccessToast("Settings reset to defaults.")
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl space-y-6 pb-24">
        <div>
          <h2 className="text-3xl font-bold text-foreground">System Configuration</h2>
          <p className="mt-2 text-muted-foreground">Manage system settings, limits, and rate limiting</p>
        </div>

        {message?.type === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <Card className="card-feature-group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t("admin.config.systemLimits")}
            </CardTitle>
            <CardDescription>{t("admin.config.configureSystemLimits")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxUsers">Max Concurrent Users</Label>
                <Input
                  id="maxUsers"
                  type="number"
                  value={config.maxUsers}
                  onChange={(e) => patch({ maxUsers: e.target.value })}
                  className="custom-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                <Input
                  id="sessionTimeout"
                  type="number"
                  value={config.sessionTimeout}
                  onChange={(e) => patch({ sessionTimeout: e.target.value })}
                  className="custom-input"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              New login sessions use the updated timeout. Active sessions may be affected when limits change.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t("nav.rateLimits")}
            </CardTitle>
            <CardDescription>Control global rate limiting and per-endpoint limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col justify-between gap-3 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-center">
              <div>
                <Label className="text-base font-medium">Enable Rate Limiting</Label>
                <p className="text-sm text-muted-foreground">Turn rate limiting on or off globally</p>
              </div>
              <Button
                type="button"
                variant={config.rateLimitEnabled ? "default" : "outline"}
                onClick={() => patch({ rateLimitEnabled: !config.rateLimitEnabled })}
                className={
                  config.rateLimitEnabled
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : ""
                }
              >
                {config.rateLimitEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
            <div className="flex flex-col justify-between gap-3 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-center">
              <div>
                <Label className="text-base font-medium">IP-Based Rate Limiting</Label>
                <p className="text-sm text-muted-foreground">Track limits per IP address instead of per user</p>
              </div>
              <Button
                type="button"
                variant={config.ipBasedLimit ? "default" : "outline"}
                onClick={() => patch({ ipBasedLimit: !config.ipBasedLimit })}
                className={config.ipBasedLimit ? "bg-sky-600 text-white hover:bg-sky-700" : ""}
              >
                {config.ipBasedLimit ? "Enabled" : "Disabled"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>General API Requests</CardTitle>
            <CardDescription>Limit all API requests to prevent server overload</CardDescription>
          </CardHeader>
          <CardContent>
            <RateLimitPair
              limitId="apiRateLimit"
              windowId="apiTimeWindow"
              limitLabel="Max Requests"
              windowLabel="Time Window (seconds)"
              limitValue={config.apiRateLimit}
              windowValue={config.apiTimeWindow}
              onLimitChange={(v) => patch({ apiRateLimit: v })}
              onWindowChange={(v) => patch({ apiTimeWindow: v })}
              summary={
                <>
                  Current: <strong>{config.apiRateLimit}</strong> requests per{" "}
                  <strong>{config.apiTimeWindow}</strong> seconds
                </>
              }
              summaryClassName="border-blue-200 bg-blue-50 text-blue-800"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Chatbot Requests</CardTitle>
            <CardDescription>Limit chatbot interactions to manage API costs</CardDescription>
          </CardHeader>
          <CardContent>
            <RateLimitPair
              limitId="chatbotRateLimit"
              windowId="chatbotTimeWindow"
              limitLabel="Max Messages"
              windowLabel="Time Window (seconds)"
              limitValue={config.chatbotRateLimit}
              windowValue={config.chatbotTimeWindow}
              onLimitChange={(v) => patch({ chatbotRateLimit: v })}
              onWindowChange={(v) => patch({ chatbotTimeWindow: v })}
              summary={
                <>
                  Current: <strong>{config.chatbotRateLimit}</strong> messages per{" "}
                  <strong>{config.chatbotTimeWindow}</strong> seconds
                </>
              }
              summaryClassName="border-purple-200 bg-purple-50 text-purple-800"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Symptom Analysis</CardTitle>
            <CardDescription>Limit symptom checker requests</CardDescription>
          </CardHeader>
          <CardContent>
            <RateLimitPair
              limitId="aiSymptomRateLimit"
              windowId="aiSymptomTimeWindow"
              limitLabel="Max Analyses"
              windowLabel="Time Window (seconds)"
              limitValue={config.aiSymptomRateLimit}
              windowValue={config.aiSymptomTimeWindow}
              onLimitChange={(v) => patch({ aiSymptomRateLimit: v })}
              onWindowChange={(v) => patch({ aiSymptomTimeWindow: v })}
              summary={
                <>
                  Current: <strong>{config.aiSymptomRateLimit}</strong> analyses per{" "}
                  <strong>{config.aiSymptomTimeWindow}</strong> seconds
                </>
              }
              summaryClassName="border-indigo-200 bg-indigo-50 text-indigo-800"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appointment Booking</CardTitle>
            <CardDescription>Prevent spam booking attempts</CardDescription>
          </CardHeader>
          <CardContent>
            <RateLimitPair
              limitId="appointmentRateLimit"
              windowId="appointmentTimeWindow"
              limitLabel="Max Bookings"
              windowLabel="Time Window (seconds)"
              limitValue={config.appointmentRateLimit}
              windowValue={config.appointmentTimeWindow}
              onLimitChange={(v) => patch({ appointmentRateLimit: v })}
              onWindowChange={(v) => patch({ appointmentTimeWindow: v })}
              summary={
                <>
                  Current: <strong>{config.appointmentRateLimit}</strong> bookings per{" "}
                  <strong>{config.appointmentTimeWindow}</strong> seconds
                </>
              }
              summaryClassName="border-teal-200 bg-teal-50 text-teal-800"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Login Attempts</CardTitle>
            <CardDescription>Protect against brute force attacks</CardDescription>
          </CardHeader>
          <CardContent>
            <RateLimitPair
              limitId="loginRateLimit"
              windowId="loginTimeWindow"
              limitLabel="Max Attempts"
              windowLabel="Lockout Duration (seconds)"
              limitValue={config.loginRateLimit}
              windowValue={config.loginTimeWindow}
              onLimitChange={(v) => patch({ loginRateLimit: v })}
              onWindowChange={(v) => patch({ loginTimeWindow: v })}
              summary={
                <>
                  Current: <strong>{config.loginRateLimit}</strong> attempts, then{" "}
                  <strong>{config.loginTimeWindow}</strong> second lockout
                </>
              }
              summaryClassName="border-amber-200 bg-amber-50 text-amber-800"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registration</CardTitle>
            <CardDescription>Prevent spam account creation</CardDescription>
          </CardHeader>
          <CardContent>
            <RateLimitPair
              limitId="registrationRateLimit"
              windowId="registrationTimeWindow"
              limitLabel="Max Registrations"
              windowLabel="Time Window (seconds)"
              limitValue={config.registrationRateLimit}
              windowValue={config.registrationTimeWindow}
              onLimitChange={(v) => patch({ registrationRateLimit: v })}
              onWindowChange={(v) => patch({ registrationTimeWindow: v })}
              summary={
                <>
                  Current: <strong>{config.registrationRateLimit}</strong> registrations per{" "}
                  <strong>{config.registrationTimeWindow}</strong> seconds
                </>
              }
              summaryClassName="border-green-200 bg-green-50 text-green-800"
            />
          </CardContent>
        </Card>

      </div>

      <div className="fixed bottom-6 right-10 z-40 flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={saving}
          aria-label="Reset rate limit settings to defaults"
          className="h-12 w-12 rounded-full border-slate-300 bg-white text-slate-800 shadow-lg hover:bg-slate-50 hover:text-slate-900"
        >
          <RefreshCw className={`h-4 w-4 ${saving ? "animate-spin" : ""}`} />
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          aria-label="Save configuration changes"
          className="h-12 w-12 rounded-full border border-[#006a9e] bg-[#0086C4] text-white shadow-lg hover:bg-[#0078b0] hover:text-white"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
    </AdminLayout>
  )
}
