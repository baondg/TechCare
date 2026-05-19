// config.tsx
"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Save, Settings, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useTranslation } from "react-i18next"
import { emitErrorToast } from "@/lib/error-toast-bus"
import { emitSuccessToast } from "@/lib/success-toast-bus"
import { apiClient } from "@/api/client"

type AdminSession = {
  id: number
  userId: number
  lastActivity: string
  expiresAt: string
  ipAddress?: string | null
  userAgent?: string | null
  roleCode?: string
}

export default function SystemConfig() {
  const { t } = useTranslation()
  const [config, setConfig] = useState({
    aiModel: "gpt-4-turbo",
    maxUsers: "500",
    sessionTimeout: "30",
    rateLimitRequests: "100",
    rateLimitWindow: "15",
    apiRateLimitRequests: "60",
    apiRateLimitWindow: "1",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionActionLoading, setSessionActionLoading] = useState(false)
  const ADMIN_ROLE_CODE = "ADM"
  const nonAdminSessions = useMemo(
    () => sessions.filter((s) => String(s.roleCode || "").toUpperCase() !== ADMIN_ROLE_CODE),
    [sessions]
  )
  const loadSessions = async () => {
    setSessionsLoading(true)
    try {
      const data = await apiClient.get<{ success: boolean; sessions?: AdminSession[]; error?: string }>(
        "/api/system-config/sessions"
      )
      if (!data.success) throw new Error(data.error || t("admin.config.failedLoadSessions"))
      setSessions(data.sessions || [])
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("admin.config.couldNotLoadSessions") })
    } finally {
      setSessionsLoading(false)
    }
  }

  // Load configuration from API
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const data = await apiClient.get<{
          success: boolean
          config?: { maxConcurrentUsers?: string; sessionTimeoutMinutes?: string }
        }>("/api/system-config")
        if (data.success && data.config) {
          setConfig((prev) => ({
            ...prev,
            maxUsers: data.config!.maxConcurrentUsers || prev.maxUsers,
            sessionTimeout: data.config!.sessionTimeoutMinutes || prev.sessionTimeout,
          }))
        }
      } catch (error) {
        console.error("Error loading config:", error)
      } finally {
        setLoading(false)
      }
    }

    loadConfig();
    void loadSessions();
  }, []);

  useEffect(() => {
    if (!message || message.type !== "error") return
    emitErrorToast(message.text)
    setMessage(null)
  }, [message])

  const handleChange = (field: string, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setMessage(null);
  }

  const revokeSession = async (id: number) => {
    setSessionActionLoading(true)
    setMessage(null)
    try {
      const data = await apiClient.delete<{ success: boolean; error?: string }>(
        `/api/system-config/sessions/${id}`
      )
      if (!data.success) throw new Error(data.error || "Failed to revoke session")
      setSessions((prev) => prev.filter((s) => s.id !== id))
      emitSuccessToast(t("admin.config.sessionRevokedSuccessfully"))
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to revoke session." })
    } finally {
      setSessionActionLoading(false)
    }
  }

  const revokeAllSessions = async () => {
    setSessionActionLoading(true)
    setMessage(null)
    try {
      const data = await apiClient.post<{ success: boolean; revokedCount?: number; error?: string }>(
        "/api/system-config/sessions/revoke-all",
        {}
      )
      if (!data.success) throw new Error(data.error || "Failed to revoke sessions")
      setSessions((prev) =>
        prev.filter((session) => String(session.roleCode || "").toUpperCase() === ADMIN_ROLE_CODE)
      )
      emitSuccessToast(`Revoked ${data.revokedCount || 0} sessions.`)
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to revoke sessions." })
    } finally {
      setSessionActionLoading(false)
    }
  }

  const handleSaveSystemConfig = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      const data = await apiClient.put<{ success: boolean; error?: string }>("/api/system-config", {
        maxConcurrentUsers: parseInt(config.maxUsers, 10),
        sessionTimeoutMinutes: parseInt(config.sessionTimeout, 10),
      })
      if (data.success) {
        emitSuccessToast("System configuration saved successfully!")
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save configuration" })
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Network error. Please try again.",
      })
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">System Configuration</h2>
          <p className="text-muted-foreground mt-2">Manage system settings and parameters</p>
        </div>

        {/* System Limits */}
        <Card className="card-feature-group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t("admin.config.systemLimits")}
            </CardTitle>
            <CardDescription>{t("admin.config.configureSystemLimits")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxUsers">Max Concurrent Users</Label>
                <Input
                  id="maxUsers"
                  type="number"
                  value={config.maxUsers}
                  onChange={(e) => handleChange("maxUsers", e.target.value)}
                  className="custom-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                <Input
                  id="sessionTimeout"
                  type="number"
                  value={config.sessionTimeout}
                  onChange={(e) => handleChange("sessionTimeout", e.target.value)}
                  className="custom-input"
                />
              </div>
            </div>
            <Button 
              className="gap-2 btn-gradient" 
              onClick={handleSaveSystemConfig}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={20} />
                  {t("admin.config.saveSystemConfig")}
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Current active sessions will be affected by these changes. New login sessions will use the updated timeout.
            </p>
          </CardContent>
        </Card>

        {/* Sessions */}
        <Card className="card-feature-group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Active Sessions
            </CardTitle>
            <CardDescription>Inspect and revoke currently active user sessions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void loadSessions()} disabled={sessionsLoading || sessionActionLoading}>
                {sessionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
              <Button variant="destructive" onClick={() => void revokeAllSessions()} disabled={sessionActionLoading || nonAdminSessions.length === 0}>
                Revoke All
              </Button>
            </div>
            {sessionsLoading ? (
              <div className="text-sm text-muted-foreground">Loading sessions...</div>
            ) : sessions.length === 0 ? (
              <div className="text-sm text-muted-foreground">No active sessions.</div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between rounded border p-3">
                    <div className="text-sm">
                      <div className="font-medium">Session #{session.id} · User {session.userId}{String(session.roleCode || "").toUpperCase() === ADMIN_ROLE_CODE ? " · Admin" : ""}</div>
                      <div className="text-muted-foreground">
                        Last activity: {new Date(session.lastActivity).toLocaleString()} · Expires: {new Date(session.expiresAt).toLocaleString()}
                      </div>
                      <div className="text-muted-foreground">
                        IP: {session.ipAddress || "n/a"} · Agent: {session.userAgent || "n/a"}
                      </div>
                    </div>
                    {String(session.roleCode || "").toUpperCase() !== ADMIN_ROLE_CODE ? (
                      <Button size="sm" variant="outline" disabled={sessionActionLoading} onClick={() => void revokeSession(session.id)}>
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}