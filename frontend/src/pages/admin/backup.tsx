"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminLayout } from "@/components/admin-layout"
import { Database, Download, Upload, Clock, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface BackupHistory {
  id: string
  date: string
  time: string
  size: string
  type: string
  status: 'success' | 'failed'
}

const mockBackups: BackupHistory[] = [
  { id: "1", date: "2025-12-26", time: "14:30", size: "245 MB", type: "Full", status: "success" },
  { id: "2", date: "2025-12-25", time: "14:30", size: "243 MB", type: "Full", status: "success" },
  { id: "3", date: "2025-12-24", time: "14:30", size: "240 MB", type: "Full", status: "success" },
  { id: "4", date: "2025-12-23", time: "14:30", size: "238 MB", type: "Full", status: "success" },
  { id: "5", date: "2025-12-22", time: "14:30", size: "235 MB", type: "Full", status: "failed" },
]

export default function BackupManagement() {
  const [backups] = useState<BackupHistory[]>(mockBackups)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [config, setConfig] = useState({
    autoBackup: true,
    frequency: "daily",
    retentionDays: "30",
    backupLocation: "/var/backups/techcare",
  })

  const handleBackupNow = async () => {
    setLoading(true)
    setMessage(null)
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      setMessage({ type: 'success', text: 'Backup completed successfully!' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Backup failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (backupId: string) => {
    if (!confirm('Are you sure you want to restore from this backup? Current data will be overwritten.')) {
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      setMessage({ type: 'success', text: `Restored from backup ${backupId} successfully!` })
    } catch (error) {
      setMessage({ type: 'error', text: 'Restore failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = (backupId: string) => {
    setMessage({ type: 'success', text: `Downloading backup ${backupId}...` })
  }

  const handleSaveConfig = async () => {
    setLoading(true)
    setMessage(null)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      setMessage({ type: 'success', text: 'Backup configuration saved successfully!' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save configuration.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Backup Management</h2>
            <p className="text-gray-600 mt-2">Manage database backups and restore points</p>
          </div>
          <Button 
            onClick={handleBackupNow}
            disabled={loading}
            className="bg-[#0086C4] hover:bg-[#06b6d4]"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Creating Backup...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" /> Backup Now
              </>
            )}
          </Button>
        </div>

        {/* Alert Messages */}
        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Operational baseline uses backend scripts: <code>npm run db:backup</code> and <code>npm run db:restore</code> in <code>backend/</code>.
            This admin screen remains a UI surface and should be wired to those operations before production use.
          </AlertDescription>
        </Alert>

        {/* Backup Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Automatic Backup Settings
            </CardTitle>
            <CardDescription>
              Configure automatic backup schedule and retention policy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-base font-medium">Enable Automatic Backups</Label>
                <p className="text-sm text-gray-600">Schedule regular automated backups</p>
              </div>
              <Button
                type="button"
                variant={config.autoBackup ? "default" : "outline"}
                onClick={() => setConfig({ ...config, autoBackup: !config.autoBackup })}
                className={
                  config.autoBackup
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
                }
              >
                {config.autoBackup ? "Enabled" : "Disabled"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="frequency">Backup Frequency</Label>
                <Select value={config.frequency} onValueChange={(v) => setConfig({ ...config, frequency: v })}>
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Every Hour</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="retention">Retention Period (days)</Label>
                <Input
                  id="retention"
                  type="number"
                  value={config.retentionDays}
                  onChange={(e) => setConfig({ ...config, retentionDays: e.target.value })}
                  placeholder="30"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="location">Backup Location</Label>
              <Input
                id="location"
                value={config.backupLocation}
                onChange={(e) => setConfig({ ...config, backupLocation: e.target.value })}
                placeholder="/var/backups/techcare"
              />
              <p className="text-xs text-gray-500 mt-1">Server path where backups will be stored</p>
            </div>

            <Button onClick={handleSaveConfig} disabled={loading} className="w-full">
              Save Configuration
            </Button>
          </CardContent>
        </Card>

        {/* Backup History */}
        <Card>
          <CardHeader>
            <CardTitle>Backup History</CardTitle>
            <CardDescription>
              View and manage previous backups
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Time</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Size</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{backup.date}</td>
                      <td className="py-3 px-4">{backup.time}</td>
                      <td className="py-3 px-4">{backup.size}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                          {backup.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {backup.status === 'success' ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="w-4 h-4" />
                            Success
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertCircle className="w-4 h-4" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          {backup.status === 'success' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownload(backup.id)}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestore(backup.id)}
                              >
                                <Upload className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Storage Info */}
        <Card>
          <CardHeader>
            <CardTitle>Storage Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Total Backups</p>
                <p className="text-2xl font-bold text-blue-600">{backups.length}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Total Size</p>
                <p className="text-2xl font-bold text-green-600">1.2 GB</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg">
                <p className="text-sm text-gray-600">Storage Used</p>
                <p className="text-2xl font-bold text-amber-600">12%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
