"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Save, Settings, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/contexts/AuthContext"

export default function SystemConfig() {
  const { user } = useAuth();
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

  // Load configuration from API
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const token = localStorage.getItem('authToken');
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
              sessionTimeout: data.config.sessionTimeoutMinutes || prev.sessionTimeout,
              rateLimitRequests: data.config.rateLimitRequests || prev.rateLimitRequests,
              rateLimitWindow: data.config.rateLimitWindowMinutes || prev.rateLimitWindow,
              apiRateLimitRequests: data.config.apiRateLimitRequests || prev.apiRateLimitRequests,
              apiRateLimitWindow: data.config.apiRateLimitWindowMinutes || prev.apiRateLimitWindow
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
          sessionTimeoutMinutes: parseInt(config.sessionTimeout),
          rateLimitRequests: parseInt(config.rateLimitRequests),
          rateLimitWindowMinutes: parseInt(config.rateLimitWindow),
          apiRateLimitRequests: parseInt(config.apiRateLimitRequests),
          apiRateLimitWindowMinutes: parseInt(config.apiRateLimitWindow)
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
        <Card>
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailServer">Email Server</Label>
              <Input
                id="emailServer"
                value={config.emailServer}
                onChange={(e) => handleChange("emailServer", e.target.value)}
              />
            </div>
            <Button className="gap-2">
              <Save size={20} />
              Save API Config
            </Button>
          </CardContent>
        </Card>

        {/* AI Model Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              AI Model Configuration
            </CardTitle>
            <CardDescription>Configure AI model and parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aiModel">AI Model Version</Label>
              <Input id="aiModel" value={config.aiModel} onChange={(e) => handleChange("aiModel", e.target.value)} />
            </div>
            <Button className="gap-2">
              <Save size={20} />
              Save AI Config
            </Button>
          </CardContent>
        </Card>

        {/* System Limits */}
        <Card>
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                <Input
                  id="sessionTimeout"
                  type="number"
                  value={config.sessionTimeout}
                  onChange={(e) => handleChange("sessionTimeout", e.target.value)}
                />
              </div>
            </div>
            <Button 
              className="gap-2" 
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

        {/* Rate Limiting Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Rate Limiting
            </CardTitle>
            <CardDescription>Configure request rate limits to prevent abuse</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-3">General Rate Limit</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rateLimitRequests">Max Requests</Label>
                    <Input
                      id="rateLimitRequests"
                      type="number"
                      min="1"
                      value={config.rateLimitRequests}
                      onChange={(e) => handleChange("rateLimitRequests", e.target.value)}
                      placeholder="100"
                    />
                    <p className="text-xs text-muted-foreground">Maximum requests per time window</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rateLimitWindow">Time Window (minutes)</Label>
                    <Input
                      id="rateLimitWindow"
                      type="number"
                      min="1"
                      value={config.rateLimitWindow}
                      onChange={(e) => handleChange("rateLimitWindow", e.target.value)}
                      placeholder="15"
                    />
                    <p className="text-xs text-muted-foreground">Time window for rate limiting</p>
                  </div>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3">API Rate Limit</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="apiRateLimitRequests">Max API Requests</Label>
                    <Input
                      id="apiRateLimitRequests"
                      type="number"
                      min="1"
                      value={config.apiRateLimitRequests}
                      onChange={(e) => handleChange("apiRateLimitRequests", e.target.value)}
                      placeholder="60"
                    />
                    <p className="text-xs text-muted-foreground">Maximum API requests per time window</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiRateLimitWindow">Time Window (minutes)</Label>
                    <Input
                      id="apiRateLimitWindow"
                      type="number"
                      min="1"
                      value={config.apiRateLimitWindow}
                      onChange={(e) => handleChange("apiRateLimitWindow", e.target.value)}
                      placeholder="1"
                    />
                    <p className="text-xs text-muted-foreground">Time window for API rate limiting</p>
                  </div>
                </div>
              </div>
            </div>
            
            <Button 
              className="gap-2" 
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
                  Save Rate Limit Config
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Rate limits are applied per user/IP address. Changes take effect immediately for new requests.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
