"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Shield, Save, RefreshCw, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function RateLimitConfig() {
  const [config, setConfig] = useState({
    apiRateLimit: "100",
    apiTimeWindow: "60",
    chatbotRateLimit: "20",
    chatbotTimeWindow: "60",
    aiSymptomRateLimit: "10",
    aiSymptomTimeWindow: "60",
    appointmentRateLimit: "5",
    appointmentTimeWindow: "300",
    loginRateLimit: "5",
    loginTimeWindow: "15",
    registrationRateLimit: "3",
    registrationTimeWindow: "60",
    ipBasedLimit: true,
    enabled: true,
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleSave = async () => {
    setLoading(true)
    setMessage(null)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      setMessage({ type: 'success', text: 'Rate limit settings saved successfully!' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setConfig({
      apiRateLimit: "100",
      apiTimeWindow: "60",
      chatbotRateLimit: "20",
      chatbotTimeWindow: "60",
      aiSymptomRateLimit: "10",
      aiSymptomTimeWindow: "60",
      appointmentRateLimit: "5",
      appointmentTimeWindow: "300",
      loginRateLimit: "5",
      loginTimeWindow: "15",
      registrationRateLimit: "3",
      registrationTimeWindow: "60",
      ipBasedLimit: true,
      enabled: true,
    })
    setMessage({ type: 'success', text: 'Settings reset to defaults.' })
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
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" /> Reset to Defaults
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={loading}
              className="bg-[#0086C4] hover:bg-[#06b6d4]"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" /> Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Alert Messages */}
        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
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
                variant={config.enabled ? "default" : "outline"}
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                className={config.enabled ? "bg-green-600 hover:bg-green-700" : ""}
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
                variant={config.ipBasedLimit ? "default" : "outline"}
                onClick={() => setConfig({ ...config, ipBasedLimit: !config.ipBasedLimit })}
                className={config.ipBasedLimit ? "bg-blue-600 hover:bg-blue-700" : ""}
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
                  placeholder="5"
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
                  placeholder="5"
                />
                <p className="text-xs text-gray-500 mt-1">Failed login attempts allowed</p>
              </div>
              <div>
                <Label htmlFor="loginTimeWindow">Lockout Duration (minutes)</Label>
                <Input
                  id="loginTimeWindow"
                  type="number"
                  value={config.loginTimeWindow}
                  onChange={(e) => setConfig({ ...config, loginTimeWindow: e.target.value })}
                  placeholder="15"
                />
                <p className="text-xs text-gray-500 mt-1">How long to block after limit</p>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm text-amber-800">
                Current setting: <strong>{config.loginRateLimit} attempts, then {config.loginTimeWindow} minute lockout</strong>
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
                  placeholder="3"
                />
                <p className="text-xs text-gray-500 mt-1">Accounts per IP address</p>
              </div>
              <div>
                <Label htmlFor="registrationTimeWindow">Time Window (minutes)</Label>
                <Input
                  id="registrationTimeWindow"
                  type="number"
                  value={config.registrationTimeWindow}
                  onChange={(e) => setConfig({ ...config, registrationTimeWindow: e.target.value })}
                  placeholder="60"
                />
                <p className="text-xs text-gray-500 mt-1">Duration to count registrations</p>
              </div>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                Current setting: <strong>{config.registrationRateLimit} registrations per {config.registrationTimeWindow} minutes</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
