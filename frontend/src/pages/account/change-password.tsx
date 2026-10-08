import type React from "react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { AlertCircle, Eye, EyeOff, KeyRound } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/AuthContext"
import { getSafeRedirectByRole } from "@/lib/auth-paths"
import { emitSuccessToast } from "@/lib/success-toast-bus"
import { authService } from "@/services/auth-service"

/**
 * Change password. Also the only screen a user with an admin-issued password can reach
 * (App redirects here while `user.mustChangePassword`).
 */
export default function ChangePasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout, markPasswordChanged } = useAuth()
  const forced = Boolean(user?.mustChangePassword)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPasswords, setShowPasswords] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError(t("auth.changePassword.mismatch"))
      return
    }
    setSaving(true)
    try {
      await authService.changePassword(currentPassword, newPassword)
      markPasswordChanged()
      emitSuccessToast(t("auth.changePassword.success"))
      navigate(getSafeRedirectByRole(user?.role), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.unexpectedError"))
    } finally {
      setSaving(false)
    }
  }

  const passwordField = (id: string, label: string, value: string, onChange: (v: string) => void, autoComplete: string) => (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} <span className="text-red-500">*</span>
      </Label>
      <Input
        id={id}
        type={showPasswords ? "text" : "password"}
        required
        autoComplete={autoComplete}
        className="custom-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-[#0891b2]" />
            {t("auth.changePassword.title")}
          </CardTitle>
          <CardDescription>{forced ? t("auth.changePassword.forcedNotice") : t("auth.changePassword.rules")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {passwordField("current-password", t("auth.changePassword.current"), currentPassword, setCurrentPassword, "current-password")}
            {passwordField("new-password", t("auth.changePassword.new"), newPassword, setNewPassword, "new-password")}
            {passwordField("confirm-password", t("auth.changePassword.confirm"), confirmPassword, setConfirmPassword, "new-password")}
            {forced && <p className="text-sm text-muted-foreground">{t("auth.changePassword.rules")}</p>}
            <button
              type="button"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowPasswords((v) => !v)}
            >
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPasswords ? t("auth.hidePassword") : t("auth.showPassword")}
            </button>
            <div className="flex gap-2 pt-2">
              {forced ? (
                <Button type="button" variant="outline" className="flex-1" onClick={logout}>
                  {t("common.logout")}
                </Button>
              ) : (
                <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(-1)}>
                  {t("common.cancel")}
                </Button>
              )}
              <Button type="submit" className="btn-gradient flex-1" disabled={saving}>
                {t("auth.changePassword.submit")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
