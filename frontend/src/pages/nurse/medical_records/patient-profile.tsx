"use client"
import { useEffect, useMemo, useState } from "react"
import { Navigate, useLocation, useParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, Users, Loader2, CalendarIcon, ShieldCheck, CircleAlert } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, parseISO } from "date-fns"
import type { PatientProfile } from "@/services/profile-service"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useProfile } from "@/hooks/useProfile"
import { NurseLayout } from "@/components/nurse-layout"
/** Route param may be `OP000000049` (USER.id padded) or plain `49`; profile API expects USER.id. */
function parseProfileRouteUserId(raw: string | undefined): number | null {
  if (!raw?.trim()) return null
  const n = Number(String(raw).replace(/^OP0*/i, ""))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
/** Shared by EMR tab (`nurse-layout-2`) và trang standalone (`/doctor/patients/:id/profile`). */
export function NursePatientProfilePanel() {
  const { patientId } = useParams<{ patientId: string }>()
  const routeUserId = useMemo(() => parseProfileRouteUserId(patientId), [patientId])
  const invalidParam = Boolean(patientId != null && String(patientId).trim() !== "" && routeUserId == null)
  const { profile, loading, saving, error: saveError, success, save, clearMessages } = useProfile(
    invalidParam ? undefined : routeUserId ?? undefined
  )
  const [isEditing, setIsEditing] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [dob, setDob] = useState<Date | undefined>()
  const [sex, setSex] = useState("Male")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [relativeName, setRelativeName] = useState("")
  const [relationship, setRelationship] = useState("Mother")
  const [reDob, setReDob] = useState<Date | undefined>()
  const [reSex, setReSex] = useState("Female")
  const [rePhone, setRePhone] = useState("")
  const [reEmail, setReEmail] = useState("")
  const [reNationalId, setReNationalId] = useState("")
  const [insuranceId, setInsuranceId] = useState("")
  const [insuranceProvider, setInsuranceProvider] = useState("")
  const [insuranceExpiry, setInsuranceExpiry] = useState("")
  const mapSex = (value?: string) => {
    const s = String(value || "").trim()
    if (s === "M" || s.toLowerCase() === "male" || s.toLowerCase() === "m") return "Male"
    if (s === "F" || s.toLowerCase() === "female" || s.toLowerCase() === "f") return "Female"
    return "Other"
  }
  const age = dob ? calculateAge(dob) : ""
  const reAge = reDob ? calculateAge(reDob) : ""
  const populateForm = (p: PatientProfile) => {
    let fn = p.firstName ?? ""
    let ln = p.lastName ?? ""
    if (!fn && !ln && p.fullName?.trim()) {
      const parts = p.fullName.trim().split(/\s+/)
      fn = parts[0] || ""
      ln = parts.slice(1).join(" ") || ""
    }
    setFirstName(fn)
    setLastName(ln)
    setDob(p.dateOfBirth ? parseISO(p.dateOfBirth) : undefined)
    setSex(mapSex(p.sex))
    setPhone(p.phone || "")
    setEmail(p.email || "")
    setNationalId(p.nationalId || "")
    setRelativeName(p.relativeName || "")
    setRelationship(p.relativeRelationship || "Mother")
    setReDob(p.relativeDateOfBirth ? parseISO(p.relativeDateOfBirth) : undefined)
    setReSex(mapSex(p.relativeSex))
    setRePhone(p.relativePhone || "")
    setReEmail(p.relativeEmail || "")
    setReNationalId(p.relativeNationalId || "")
    setInsuranceId(p.insuranceId || "")
    setInsuranceProvider(p.insuranceProvider || "")
    setInsuranceExpiry(p.insuranceExpiry || "")
  }
  useEffect(() => {
    if (profile) populateForm(profile)
  }, [profile])
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setIsEditing(false), 100)
      return () => clearTimeout(t)
    }
  }, [success])
  const handleSave = async () => {
    if (routeUserId == null) return
    const profileData: Partial<PatientProfile> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: dob ? format(dob, "yyyy-MM-dd") : undefined,
      sex,
      phone,
      email,
      nationalId,
      relativeName,
      relativeRelationship: relationship,
      relativeDateOfBirth: reDob ? format(reDob, "yyyy-MM-dd") : undefined,
      relativeSex: reSex,
      relativePhone: rePhone,
      relativeEmail: reEmail,
      relativeNationalId: reNationalId,
      insuranceId,
      insuranceProvider,
      insuranceExpiry,
    }
    await save(profileData)
  }
  const handleCancel = () => {
    if (profile) populateForm(profile)
    else {
      handleClear()
    }
    setIsEditing(false)
    clearMessages()
  }
  const handleClear = () => {
    setFirstName("")
    setLastName("")
    setDob(undefined)
    setSex("Male")
    setPhone("")
    setEmail("")
    setNationalId("")
    setRelativeName("")
    setRelationship("Mother")
    setReDob(undefined)
    setReSex("Female")
    setRePhone("")
    setReEmail("")
    setReNationalId("")
    setInsuranceId("")
    setInsuranceProvider("")
    setInsuranceExpiry("")
  }
  if (invalidParam) {
    return (
      <Card className="card-feature border-red-200">
        <CardContent className="p-6 text-red-600">Invalid patient id</CardContent>
      </Card>
    )
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[240px] py-8">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading patient profile...</p>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-8">
      <Card className="card-feature border-slate-200/60">
        <CardHeader className="bg-linear-to-r from-cyan-50/50 to-transparent">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-3 text-slate-900">
              <div className="card-icon-wrapper h-10 w-10">
                <User className="h-5 w-5" />
              </div>
              Personal Information
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Button className="btn-gradient" size="sm" onClick={() => setIsEditing(true)} disabled={isEditing}>
                Edit
              </Button>
              <Button className="btn-gradient" size="sm" onClick={handleSave} disabled={!isEditing || saving}>
                Save
              </Button>
              <Button className="btn-outline" size="sm" onClick={handleCancel} disabled={!isEditing || saving}>
                Cancel
              </Button>
              <Button className="btn-outline" size="sm" onClick={handleClear} disabled={!isEditing}>
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        {saveError && (
          <div className="px-6">
            <Alert variant="destructive">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          </div>
        )}
        {success && (
          <div className="px-6">
            <Alert className="bg-green-50 border-green-200 text-green-800">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          </div>
        )}
        <CardContent className="pt-6">
          <form className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nurse-pp-first" className="text-sm font-semibold text-slate-700">
                  First name
                </Label>
                <Input
                  id="nurse-pp-first"
                  className="custom-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nurse-pp-last" className="text-sm font-semibold text-slate-700">
                  Last name
                </Label>
                <Input
                  id="nurse-pp-last"
                  className="custom-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={!isEditing}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Date of Birth</Label>
                <Popover>
                  <PopoverTrigger asChild disabled={!isEditing}>
                    <div
                      className={`custom-popover w-full flex items-center justify-between px-3 py-2 text-sm ${!isEditing ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span className={dob ? "text-slate-900" : "text-slate-400"}>
                        {dob ? format(dob, "dd/MM/yyyy") : "dd/mm/yyyy"}
                      </span>
                      <CalendarIcon className="h-4 w-4 opacity-60" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="p-0">
                    <Calendar mode="single" selected={dob} onSelect={setDob} captionLayout="dropdown" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Age</Label>
                <Input value={age} disabled className="custom-input bg-slate-50" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-sm font-semibold text-slate-700">Sex</Label>
                <Select value={sex} onValueChange={setSex} disabled={!isEditing}>
                  <SelectTrigger className="custom-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nurse-pp-phone" className="text-sm font-semibold text-slate-700">
                  Phone Number
                </Label>
                <Input
                  id="nurse-pp-phone"
                  type="tel"
                  className="custom-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nurse-pp-email" className="text-sm font-semibold text-slate-700">
                  Email Address
                </Label>
                <Input
                  id="nurse-pp-email"
                  type="email"
                  className="custom-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!isEditing}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nurse-pp-national" className="text-sm font-semibold text-slate-700">
                National ID / Passport
              </Label>
              <Input
                id="nurse-pp-national"
                className="custom-input"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                disabled={!isEditing}
              />
            </div>
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
            </div>
            <CardTitle className="flex items-center gap-3 text-slate-900 pt-2">
              <div className="card-icon-wrapper h-10 w-10">
                <Users className="h-5 w-5" />
              </div>
              Relative&apos;s Information
            </CardTitle>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Relative&apos;s Name</Label>
              <Input
                className="custom-input"
                value={relativeName}
                onChange={(e) => setRelativeName(e.target.value)}
                disabled={!isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Relationship</Label>
              <Select value={relationship} onValueChange={setRelationship} disabled={!isEditing}>
                <SelectTrigger className="custom-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mother">Mother</SelectItem>
                  <SelectItem value="Father">Father</SelectItem>
                  <SelectItem value="Spouse">Spouse</SelectItem>
                  <SelectItem value="Sibling">Sibling</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Date of Birth</Label>
                <Popover>
                  <PopoverTrigger asChild disabled={!isEditing}>
                    <div
                      className={`custom-popover w-full flex items-center justify-between px-3 py-2 text-sm ${!isEditing ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span className={reDob ? "text-slate-900" : "text-slate-400"}>
                        {reDob ? format(reDob, "dd/MM/yyyy") : "dd/mm/yyyy"}
                      </span>
                      <CalendarIcon className="h-4 w-4 opacity-60" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="p-0">
                    <Calendar mode="single" selected={reDob} onSelect={setReDob} captionLayout="dropdown" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Age</Label>
                <Input value={reAge} disabled className="custom-input bg-slate-50" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-sm font-semibold text-slate-700">Sex</Label>
                <Select value={reSex} onValueChange={setReSex} disabled={!isEditing}>
                  <SelectTrigger className="custom-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  className="custom-input"
                  value={rePhone}
                  onChange={(e) => setRePhone(e.target.value)}
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Email Address</Label>
                <Input
                  type="email"
                  className="custom-input"
                  value={reEmail}
                  onChange={(e) => setReEmail(e.target.value)}
                  disabled={!isEditing}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">National ID / Passport</Label>
              <Input
                className="custom-input"
                value={reNationalId}
                onChange={(e) => setReNationalId(e.target.value)}
                disabled={!isEditing}
              />
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="card-feature border-slate-200/60">
        <CardHeader className="bg-linear-to-r from-purple-50/50 to-transparent">
          <CardTitle className="flex items-center gap-3 text-slate-900">
            <div className="card-icon-wrapper h-10 w-10 bg-linear-to-br from-purple-500 to-purple-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            Insurance & Clinical Context
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Insurance ID</Label>
                <Input value={insuranceId} disabled className="custom-input bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Insurance Provider</Label>
                <Input value={insuranceProvider} disabled className="custom-input bg-slate-50" />
              </div>
            </div>
            <div className="space-y-2 max-w-[calc(50%-8px)]">
              <Label className="text-sm font-semibold text-slate-700">Expiry Date</Label>
              <Input value={insuranceExpiry} disabled className="custom-input bg-slate-50" />
            </div>
            <div className="p-4 bg-linear-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 flex gap-3">
              <CircleAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700">
                To update insurance information, please contact the hospital administration or visit the front desk.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
function calculateAge(date: Date) {
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const monthDiff = today.getMonth() - date.getMonth()
  const dayDiff = today.getDate() - date.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1
  return String(age)
}
/**
 * Nurse: `/nurse/patients/:id/profile` → redirect EMR `/nurse/medical_records/:id/profile`.
 * Doctor: `/doctor/patients/:id/profile` → full page (`NurseLayout` + panel).
 */
export default function NursePatientProfilePage() {
  const { patientId } = useParams<{ patientId: string }>()
  const location = useLocation()
  if (!patientId) {
    return <Navigate to="/" replace />
  }
  if (location.pathname.startsWith("/nurse/patients/")) {
    return <Navigate to={`/nurse/medical_records/${patientId}/profile`} replace />
  }
  return (
    <NurseLayout>
      <NursePatientProfilePanel />
    </NurseLayout>
  )
}
