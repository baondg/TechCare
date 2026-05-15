// config.tsx
"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Save, Settings, Loader2, Trash2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTranslation } from "react-i18next"
import { emitErrorToast } from "@/lib/error-toast-bus"
import { emitSuccessToast } from "@/lib/success-toast-bus"

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"

const PROVIDER_OPTIONS = [
  { value: "groq", label: "Groq" },
  { value: "local", label: "Local (Ollama / OpenAI-compatible)" },
] as const

/** Preset feature keys — fills the draft input; admins can type any key for new AI routes. */
const FEATURE_KEY_PRESETS = [
  { value: "chat", label: "chat" },
  { value: "symptom-analysis", label: "symptom-analysis" },
  { value: "suggest-medicine", label: "suggest-medicine" },
  { value: "recommend-doctor", label: "recommend-doctor" },
] as const

type AdminSession = {
  id: number
  userId: number
  lastActivity: string
  expiresAt: string
  ipAddress?: string | null
  userAgent?: string | null
}

type AiModel = {
  provider: string
  modelId: string
  featureScope: string
  enabled: boolean
}

type AiCatalogEntry = {
  provider: string
  modelId: string
  label?: string
  enabled?: boolean
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
  const [aiModels, setAiModels] = useState<AiModel[]>([])
  const [aiModelCatalog, setAiModelCatalog] = useState<AiCatalogEntry[]>([])
  const [aiDefaults, setAiDefaults] = useState<Record<string, { provider: string; modelId: string }>>({})
  const [aiSaving, setAiSaving] = useState(false)
  const [draftRow, setDraftRow] = useState({
    featureKey: "",
    provider: "groq",
    modelId: "",
    enabled: true,
  })
  const [catalogDraft, setCatalogDraft] = useState({
    provider: "groq",
    modelId: "",
    label: "",
    enabled: true,
  })

  const token = localStorage.getItem('authToken')
  const catalogByProvider = useMemo(
    () => ({
      groq: aiModelCatalog.filter((m) => m.provider === "groq" && m.enabled !== false),
      local: aiModelCatalog.filter((m) => m.provider === "local" && m.enabled !== false),
    }),
    [aiModelCatalog]
  )

  const loadSessions = async () => {
    setSessionsLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/system-config/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || t("admin.config.failedLoadSessions"))
      setSessions(data.sessions || [])
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("admin.config.couldNotLoadSessions") })
    } finally {
      setSessionsLoading(false)
    }
  }

  const loadAiModels = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/system-config/ai-models`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || t("admin.config.failedLoadAiModels"))
      setAiModels(data.models || [])
      setAiModelCatalog(data.catalog || [])
      setAiDefaults(data.defaults || {})
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("admin.config.couldNotLoadAiModels") })
    }
  }

  // Load configuration from API
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/system-config`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.config) {
            setConfig(prev => ({
              ...prev,
              maxUsers: data.config.maxConcurrentUsers || prev.maxUsers,
              sessionTimeout: data.config.sessionTimeoutMinutes || prev.sessionTimeout
            }));
          }
        }
      } catch (error) {
        console.error('Error loading config:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
    void loadSessions();
    void loadAiModels();
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
      const response = await fetch(`${API_BASE}/api/system-config/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to revoke session")
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
      const response = await fetch(`${API_BASE}/api/system-config/sessions/revoke-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to revoke sessions")
      setSessions([])
      emitSuccessToast(`Revoked ${data.revokedCount || 0} sessions.`)
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to revoke sessions." })
    } finally {
      setSessionActionLoading(false)
    }
  }

  const addDraftAiModel = async () => {
    const featureScope = draftRow.featureKey.trim().toLowerCase()
    if (!featureScope) {
      setMessage({ type: "error", text: "Enter a feature key (e.g. chat, symptom-analysis)." })
      return
    }
    setAiSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/api/system-config/ai-models`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: draftRow.provider,
          modelId: draftRow.modelId,
          featureScope,
          enabled: draftRow.enabled,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to add AI model")
      emitSuccessToast("AI model configuration added.")
      setDraftRow({
        featureKey: "",
        provider: "groq",
        modelId: "",
        enabled: true,
      })
      await loadAiModels()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to add AI model." })
    } finally {
      setAiSaving(false)
    }
  }

  const updateAiModelEnabled = async (model: AiModel, enabled: boolean) => {
    setAiSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/api/system-config/ai-models`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: model.provider,
          modelId: model.modelId,
          featureScope: model.featureScope,
          enabled,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to update AI model")
      await loadAiModels()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to update AI model." })
    } finally {
      setAiSaving(false)
    }
  }

  const deleteAiModelRow = async (model: AiModel) => {
    setAiSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/api/system-config/ai-models`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: model.provider,
          modelId: model.modelId,
          featureScope: model.featureScope,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to remove AI model")
      emitSuccessToast("AI model configuration removed.")
      await loadAiModels()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to remove AI model." })
    } finally {
      setAiSaving(false)
    }
  }

  const setDefaultAiModel = async (model: AiModel) => {
    setAiSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/api/system-config/ai-models/default`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feature: model.featureScope, provider: model.provider, modelId: model.modelId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to set default model")
      setAiDefaults(data.defaults || {})
      emitSuccessToast("Default AI model updated.")
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to set default model." })
    } finally {
      setAiSaving(false)
    }
  }

  const addCatalogModel = async () => {
    const modelId = catalogDraft.modelId.trim()
    if (!modelId) {
      setMessage({ type: "error", text: "Enter model id for catalog row." })
      return
    }
    setAiSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/api/system-config/ai-model-catalog`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: catalogDraft.provider,
          modelId,
          label: catalogDraft.label.trim() || modelId,
          enabled: catalogDraft.enabled,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to add model catalog entry")
      emitSuccessToast("AI model catalog updated.")
      setCatalogDraft((prev) => ({ ...prev, modelId: "", label: "" }))
      await loadAiModels()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to add model catalog entry." })
    } finally {
      setAiSaving(false)
    }
  }

  const deleteCatalogModel = async (entry: AiCatalogEntry) => {
    setAiSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/api/system-config/ai-model-catalog`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: entry.provider,
          modelId: entry.modelId,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to remove model catalog entry")
      emitSuccessToast("AI model catalog entry removed.")
      await loadAiModels()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to remove model catalog entry.",
      })
    } finally {
      setAiSaving(false)
    }
  }

  const handleSaveSystemConfig = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/system-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          maxConcurrentUsers: parseInt(config.maxUsers),
          sessionTimeoutMinutes: parseInt(config.sessionTimeout)
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        emitSuccessToast("System configuration saved successfully!")
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save configuration' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
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

        {/* AI Model Configuration */}
        <Card className="card-feature-group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              AI Provider Configuration
            </CardTitle>
            <CardDescription>
              Configure providers and models per feature.{" "}
              <span className="font-medium text-foreground">
                Feature key must match the string used in backend routes
              </span>{" "}
              (e.g. <code className="rounded bg-muted px-1">chat</code>,{" "}
              <code className="rounded bg-muted px-1">symptom-analysis</code>). New keys can be added without changing this UI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Model catalog</h3>
              <p className="text-xs text-muted-foreground">
                Manage reusable model IDs by provider, then assign them to feature keys below.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select
                    value={catalogDraft.provider}
                    onValueChange={(v) => setCatalogDraft((prev) => ({ ...prev, provider: v.toLowerCase() }))}
                  >
                    <SelectTrigger className="custom-input w-full">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="catalog-model-id">Model ID</Label>
                  <Input
                    id="catalog-model-id"
                    className="custom-input"
                    placeholder="e.g. llama-3.1-8b-instant"
                    value={catalogDraft.modelId}
                    onChange={(e) => setCatalogDraft((prev) => ({ ...prev, modelId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="catalog-label">Label (optional)</Label>
                  <Input
                    id="catalog-label"
                    className="custom-input"
                    placeholder="Friendly display name"
                    value={catalogDraft.label}
                    onChange={(e) => setCatalogDraft((prev) => ({ ...prev, label: e.target.value }))}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button type="button" className="btn-gradient w-full" onClick={() => void addCatalogModel()} disabled={aiSaving}>
                    Add model
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {aiModelCatalog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No catalog models yet.</p>
                ) : (
                  aiModelCatalog.map((entry) => (
                    <div key={`${entry.provider}-${entry.modelId}`} className="flex items-center justify-between rounded border px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {entry.label?.trim() || entry.modelId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.provider.toUpperCase()} · {entry.modelId}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void deleteCatalogModel(entry)}
                        disabled={aiSaving}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Add configuration</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ai-feature-key">Feature key</Label>
                  <div className="space-y-2">
                    <Input
                      id="ai-feature-key"
                      className="custom-input max-w-xl"
                      placeholder="e.g. chat, symptom-analysis, or your-backend feature key"
                      value={draftRow.featureKey}
                      onChange={(e) => setDraftRow((prev) => ({ ...prev, featureKey: e.target.value }))}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Presets:</span>
                      {FEATURE_KEY_PRESETS.map((opt) => (
                        <Button
                          key={opt.value}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setDraftRow((prev) => ({ ...prev, featureKey: opt.value }))}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select
                    value={draftRow.provider}
                    onValueChange={(v) => {
                      const provider = v.toLowerCase()
                      const options = provider === "groq" ? catalogByProvider.groq : catalogByProvider.local
                      setDraftRow((prev) => ({
                        ...prev,
                        provider,
                        modelId: options[0]?.modelId ?? "",
                      }))
                    }}
                  >
                    <SelectTrigger className="custom-input w-full">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={draftRow.modelId}
                    onValueChange={(modelId) => setDraftRow((prev) => ({ ...prev, modelId }))}
                  >
                    <SelectTrigger className="custom-input w-full">
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {(draftRow.provider === "groq" ? catalogByProvider.groq : catalogByProvider.local).map((opt) => (
                        <SelectItem key={`${opt.provider}-${opt.modelId}`} value={opt.modelId}>
                          {opt.label?.trim() || opt.modelId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="custom-input"
                    placeholder="Or type custom model id"
                    value={draftRow.modelId}
                    onChange={(e) => setDraftRow((prev) => ({ ...prev, modelId: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 md:col-span-2">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="draft-ai-enabled"
                      checked={draftRow.enabled}
                      onCheckedChange={(checked) => setDraftRow((prev) => ({ ...prev, enabled: checked }))}
                      disabled={aiSaving}
                    />
                    <Label htmlFor="draft-ai-enabled" className="cursor-pointer text-sm font-normal">
                      Enabled for new row
                    </Label>
                  </div>
                  <Button
                    type="button"
                    className="gap-2 btn-gradient"
                    onClick={() => void addDraftAiModel()}
                    disabled={aiSaving || !draftRow.modelId.trim()}
                  >
                    <Save size={20} />
                    Add row
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="cursor-default hover:bg-muted/40">
                    <TableHead className="w-[22%]">Feature key</TableHead>
                    <TableHead className="w-[12%]">Provider</TableHead>
                    <TableHead className="w-[26%]">Model</TableHead>
                    <TableHead className="w-[12%] text-center">Enabled</TableHead>
                    <TableHead className="w-[14%] text-center">Default</TableHead>
                    <TableHead className="w-[14%] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiModels.length === 0 ? (
                    <TableRow className="cursor-default hover:bg-transparent">
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No AI model records yet. Use &quot;Add row&quot; above.
                      </TableCell>
                    </TableRow>
                  ) : (
                    aiModels.map((model) => {
                      const rowKey = `${model.provider}-${model.featureScope}-${model.modelId}`
                      const isDefault =
                        aiDefaults?.[model.featureScope]?.provider === model.provider &&
                        aiDefaults?.[model.featureScope]?.modelId === model.modelId
                      return (
                        <TableRow key={rowKey} className="cursor-default hover:bg-muted/30">
                          <TableCell className="font-mono text-xs sm:text-sm">{model.featureScope}</TableCell>
                          <TableCell className="uppercase text-xs">{model.provider}</TableCell>
                          <TableCell className="font-medium">{model.modelId}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={!!model.enabled}
                                onCheckedChange={(checked) => void updateAiModelEnabled(model, checked)}
                                disabled={aiSaving}
                                aria-label={`Enable ${model.featureScope}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {isDefault ? (
                              <span className="text-xs font-medium text-emerald-700">Default</span>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                disabled={!model.enabled || aiSaving}
                                onClick={() => void setDefaultAiModel(model)}
                              >
                                Set default
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={aiSaving}
                              onClick={() => void deleteAiModelRow(model)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
                onClick={async () => {
                  try {
                    const token = localStorage.getItem("authToken")
                    const res = await fetch(`${API_BASE}/api/ai/chat`, {
                      headers: { Authorization: `Bearer ${token}` },
                    })
                    const data = await res.json()
                    emitSuccessToast(
                      `AI is online! Provider: ${data.provider || "unknown"}, Model: ${data.model || "unknown"}`
                    )
                  } catch {
                    setMessage({ type: "error", text: t("admin.config.cannotReachAiService") })
                  }
                }}
              >
                {t("admin.config.testAiConnection")}
              </Button>
            </div>
          </CardContent>
        </Card>

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
              <Button variant="destructive" onClick={() => void revokeAllSessions()} disabled={sessionActionLoading}>
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
                      <div className="font-medium">Session #{session.id} · User {session.userId}</div>
                      <div className="text-muted-foreground">
                        Last activity: {new Date(session.lastActivity).toLocaleString()} · Expires: {new Date(session.expiresAt).toLocaleString()}
                      </div>
                      <div className="text-muted-foreground">
                        IP: {session.ipAddress || "n/a"} · Agent: {session.userAgent || "n/a"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" disabled={sessionActionLoading} onClick={() => void revokeSession(session.id)}>
                      Revoke
                    </Button>
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