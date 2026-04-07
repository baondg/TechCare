// config.tsx
"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Save, Settings, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

type FeatureFlag = {
  id: number
  name: string
  status: number | boolean | string
  featureGroup: string | null
  systemId: number
}

const isFeatureEnabled = (status: FeatureFlag["status"]) =>
  status === true || status === 1 || status === "1" || String(status).toLowerCase() === "true"

export default function SystemConfig() {
  const [config, setConfig] = useState({
    apiKey: "****-****-****-****",
    emailServer: "smtp.hospital.com",
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
  const [featuresLoading, setFeaturesLoading] = useState(false)
  const [features, setFeatures] = useState<FeatureFlag[]>([])
  const [featureSavingId, setFeatureSavingId] = useState<number | null>(null)
  const [featureStats, setFeatureStats] = useState({ total: 0, enabled: 0, disabled: 0 })

  const token = localStorage.getItem('authToken')

  const loadFeatures = async () => {
    setFeaturesLoading(true)
    try {
      const response = await fetch('http://localhost:3000/api/system-config/features', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error("Failed to load features")
      const data = await response.json()
      if (data.success) {
        setFeatures(data.features || [])
        setFeatureStats(data.stats || { total: 0, enabled: 0, disabled: 0 })
      }
    } catch (error) {
      console.error("Error loading features:", error)
      setMessage({ type: "error", text: "Could not load feature flags." })
    } finally {
      setFeaturesLoading(false)
    }
  }

  // Load configuration from API
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/system-config', {
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
    void loadFeatures();
  }, []);

  const handleChange = (field: string, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setMessage(null);
  }

  const handleSaveSystemConfig = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('http://localhost:3000/api/system-config', {
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
        setMessage({ type: 'success', text: 'System configuration saved successfully!' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save configuration' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const handleToggleFeature = async (feature: FeatureFlag) => {
    setFeatureSavingId(feature.id)
    setMessage(null)
    const nextStatus = isFeatureEnabled(feature.status) ? 0 : 1
    try {
      const response = await fetch(`http://localhost:3000/api/system-config/features/${feature.id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update feature status")
      }
      setFeatures((prev) =>
        prev.map((f) =>
          f.id === feature.id ? { ...f, status: nextStatus } : f
        )
      )
      setFeatureStats((prev) => {
        const enabled = nextStatus === 1 ? prev.enabled + 1 : prev.enabled - 1
        return { total: prev.total, enabled, disabled: prev.total - enabled }
      })
      setMessage({ type: "success", text: `Feature "${feature.name}" is now ${nextStatus === 1 ? "enabled" : "disabled"}.` })
      setTimeout(() => setMessage(null), 2500)
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to update feature" })
    } finally {
      setFeatureSavingId(null)
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

        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* API Configuration */}
        <Card className="card-feature-group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              API Configuration
            </CardTitle>
            <CardDescription>Configure API keys and endpoints</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={config.apiKey}
                onChange={(e) => handleChange("apiKey", e.target.value)}
                className="custom-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailServer">Email Server</Label>
              <Input
                id="emailServer"
                value={config.emailServer}
                onChange={(e) => handleChange("emailServer", e.target.value)}
                className="custom-input"
              />
            </div>
            <Button className="gap-2 btn-gradient">
              <Save size={20} />
              Save API Config
            </Button>
          </CardContent>
        </Card>

        {/* AI Model Configuration */}
        <Card className="card-feature-group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              AI Provider Configuration
            </CardTitle>
            <CardDescription>Configure AI chatbot, medicine suggestions, and doctor recommendation providers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Provider info */}
            <div className="rounded-xl bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-100 p-4">
              <p className="text-sm text-slate-700">
                <span className="font-semibold">How it works:</span> If a Groq API key is set (in backend <code className="bg-white/60 px-1 rounded">.env</code>), all AI features use Groq Cloud.
                Otherwise, the system uses the local LLM (Ollama).
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Set <code className="bg-white/60 px-1 rounded">GROQ_API_KEY</code>, <code className="bg-white/60 px-1 rounded">GROQ_MODEL</code>,
                <code className="bg-white/60 px-1 rounded">LOCAL_LLM_BASE_URL</code>, <code className="bg-white/60 px-1 rounded">LOCAL_LLM_MODEL</code> in <code className="bg-white/60 px-1 rounded">backend/.env</code>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="groqApiKey">Groq API Key</Label>
                <Input
                  id="groqApiKey"
                  type="password"
                  placeholder="gsk_..."
                  value={config.apiKey}
                  onChange={(e) => handleChange("apiKey", e.target.value)}
                  className="custom-input"
                />
                <p className="text-xs text-slate-500">Get your key from <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-cyan-600 underline">console.groq.com</a></p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="aiModel">AI Model</Label>
                <Input id="aiModel" value={config.aiModel} onChange={(e) => handleChange("aiModel", e.target.value)} className="custom-input" placeholder="llama-3.1-8b-instant" />
                <p className="text-xs text-slate-500">Model name for Groq or Ollama (e.g., llama3, meditron)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="localLlmUrl">Local LLM URL (Ollama)</Label>
                <Input id="localLlmUrl" value="http://localhost:11434" disabled className="custom-input bg-slate-50" />
                <p className="text-xs text-slate-500">Set via <code className="bg-slate-100 px-1 rounded">LOCAL_LLM_BASE_URL</code> env var</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="localModel">Local Model Name</Label>
                <Input id="localModel" value="llama3" disabled className="custom-input bg-slate-50" />
                <p className="text-xs text-slate-500">Set via <code className="bg-slate-100 px-1 rounded">LOCAL_LLM_MODEL</code> env var</p>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <Button className="gap-2 btn-gradient">
                <Save size={20} />
                Save AI Config
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={async () => {
                  try {
                    const token = localStorage.getItem('authToken');
                    const res = await fetch('http://localhost:3000/api/ai/chat', {
                      headers: { 'Authorization': `Bearer ${token}` },
                    });
                    const data = await res.json();
                    setMessage({
                      type: 'success',
                      text: `AI is online! Provider: ${data.provider || 'unknown'}, Model: ${data.model || 'unknown'}`
                    });
                    setTimeout(() => setMessage(null), 5000);
                  } catch {
                    setMessage({ type: 'error', text: 'Cannot reach AI service. Check backend server.' });
                  }
                }}
              >
                Test AI Connection
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Limits */}
        <Card className="card-feature-group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              System Limits
            </CardTitle>
            <CardDescription>Configure system limits and timeouts</CardDescription>
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
                  Save System Config
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Current active sessions will be affected by these changes. New login sessions will use the updated timeout.
            </p>
          </CardContent>
        </Card>

        {/* Feature Flags */}
        <Card className="card-feature-group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Feature Flags
            </CardTitle>
            <CardDescription>Enable/disable modules by feature switch</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-3 text-sm md:grid-cols-3">
              <div><span className="font-medium">Total:</span> {featureStats.total}</div>
              <div><span className="font-medium text-emerald-700">Enabled:</span> {featureStats.enabled}</div>
              <div><span className="font-medium text-slate-600">Disabled:</span> {featureStats.disabled}</div>
            </div>

            {featuresLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading feature flags...
              </div>
            ) : features.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No rows found in table FEATURE. Please insert seed data first.
              </p>
            ) : (
              <div className="space-y-2">
                {features.map((f) => {
                  const enabled = isFeatureEnabled(f.status)
                  const busy = featureSavingId === f.id
                  return (
                    <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="font-medium">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Group: {f.featureGroup || "General"} · System ID: {f.systemId}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${enabled ? "text-emerald-700" : "text-slate-500"}`}>
                          {enabled ? "Enabled" : "Disabled"}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant={enabled ? "outline" : "default"}
                          className={enabled ? "" : "btn-gradient"}
                          disabled={busy}
                          onClick={() => void handleToggleFeature(f)}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {enabled ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}