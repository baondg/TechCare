"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Save, Settings } from "lucide-react"

export default function SystemConfig() {
  const [config, setConfig] = useState({
    apiKey: "****-****-****-****",
    emailServer: "smtp.hospital.com",
    aiModel: "gpt-4-turbo",
    maxUsers: "500",
    sessionTimeout: "30",
  })

  const handleChange = (field: string, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">System Configuration</h2>
          <p className="text-muted-foreground mt-2">Manage system settings and parameters</p>
        </div>

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
            <Button className="gap-2">
              <Save size={20} />
              Save System Config
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
