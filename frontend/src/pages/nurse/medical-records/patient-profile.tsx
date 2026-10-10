"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useLocation, useParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, Users, Loader2, CalendarIcon, ShieldCheck } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, isValid, parse, parseISO } from "date-fns"
import type { PatientProfile } from "@/services/profile-service"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useProfile } from "@/hooks/use-profile"
import { NurseLayout } from "@/components/nurse-layout"
import { usePauseableToast } from "@/hooks/use-pauseable-toast"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
/** Route param may be `OP000000049` (USER.id padded) or plain `49`; profile API expects USER.id. */
function parseProfileRouteUserId(raw: string | undefined): number | null {
  if (!raw?.trim()) return null
  const n = Number(String(raw).replace(/^OP0*/i, ""))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
/** Shared by EMR tab (`nurse-emr-layout`) và trang standalone (`/doctor/patients/:id/profile`). */
export function NursePatientProfilePanel() {
  const { patientId } = useParams<{ patientId: string }>()
  const routeUserId = useMemo(() => parseProfileRouteUserId(patientId), [patientId])
  const invalidParam = Boolean(patientId != null && String(patientId).trim() !== "" && routeUserId == null)
  const { profile, loading, saving, error: saveError, success, save, clearMessages } = useProfile(
    invalidParam ? undefined : routeUserId ?? undefined
  )
  const { toast, isExiting, showSuccess, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const lastSuccessRef = useRef("")
  const [isEditing, setIsEditing] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [dob, setDob] = useState<Date | undefined>()
  const [dobInputValue, setDobInputValue] = useState("")
  const [dobError, setDobError] = useState("")
  const [sex, setSex] = useState("Male")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [relativeName, setRelativeName] = useState("")
  const [relationship, setRelationship] = useState("Mother")
  const [relationshipOther, setRelationshipOther] = useState("")
  const [reDob, setReDob] = useState<Date | undefined>()
  const [reDobInputValue, setReDobInputValue] = useState("")
  const [reDobError, setReDobError] = useState("")
  const [reSex, setReSex] = useState("Female")
  const [rePhone, setRePhone] = useState("")
  const [reEmail, setReEmail] = useState("")
  const [reEmailError, setReEmailError] = useState("")
  const [reNationalId, setReNationalId] = useState("")
  const [insuranceId, setInsuranceId] = useState("")
  const [insuranceProvider, setInsuranceProvider] = useState("")
  const [insuranceExpiry, setInsuranceExpiry] = useState<Date | undefined>()
  const [insuranceExpiryInputValue, setInsuranceExpiryInputValue] = useState("")
  const mapSex = (value?: string) => {
    const s = String(value || "").trim()
    if (s === "M" || s.toLowerCase() === "male" || s.toLowerCase() === "m") return "Male"
    if (s === "F" || s.toLowerCase() === "female" || s.toLowerCase() === "f") return "Female"
    return "Other"
  }
  const normalizeNationalId = (value: string) => value.replace(/\D/g, "").slice(0, 12)
  const normalizePhone = (value: string) => value.replace(/\D/g, "").slice(0, 10)
  const syncNationalId = (value: string) => setNationalId(normalizeNationalId(value))
  const syncPhone = (value: string) => setPhone(normalizePhone(value))
  const syncRelativeNationalId = (value: string) => setReNationalId(normalizeNationalId(value))
  const syncRelativePhone = (value: string) => setRePhone(normalizePhone(value))
  const formatDateInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8)
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  }
  const parseDateInput = (value: string) => {
    if (!value) return undefined
    const parsedDate = parse(value, "dd/MM/yyyy", new Date())
    if (!isValid(parsedDate)) return undefined
    if (format(parsedDate, "dd/MM/yyyy") !== value) return undefined
    return parsedDate
  }
  const isAfterToday = (date: Date) => {
    const candidate = new Date(date)
    candidate.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return candidate > today
  }
  const validateDob = (date: Date | undefined, rawInput?: string) => {
    if (!date) {
      if (rawInput && rawInput.length === 10) return "Invalid date. Please use dd/mm/yyyy."
      return ""
    }
    if (isAfterToday(date)) return "Date of birth cannot be later than today."
    return ""
  }
  const validateEmail = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ""
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(trimmed) ? "" : "Invalid email format"
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
    const parsedDob = p.dateOfBirth ? parseISO(p.dateOfBirth) : undefined
    setDob(parsedDob)
    setDobInputValue(parsedDob ? format(parsedDob, "dd/MM/yyyy") : "")
    setDobError("")
    setSex(mapSex(p.sex))
    setPhone(normalizePhone(p.phone || ""))
    setEmail(p.email || "")
    setEmailError("")
    setNationalId(normalizeNationalId(p.nationalId || ""))
    setRelativeName(p.relativeName || "")
    const relativeRelationshipValue = (p.relativeRelationship || "").trim()
    const relationshipOptions = ["Mother", "Father", "Spouse", "Sibling", "Other"]
    if (!relativeRelationshipValue) {
      setRelationship("Mother")
      setRelationshipOther("")
    } else if (relationshipOptions.includes(relativeRelationshipValue)) {
      setRelationship(relativeRelationshipValue)
      setRelationshipOther("")
    } else {
      setRelationship("Other")
      setRelationshipOther(relativeRelationshipValue)
    }
    const parsedReDob = p.relativeDateOfBirth ? parseISO(p.relativeDateOfBirth) : undefined
    setReDob(parsedReDob)
    setReDobInputValue(parsedReDob ? format(parsedReDob, "dd/MM/yyyy") : "")
    setReDobError("")
    setReSex(mapSex(p.relativeSex))
    setRePhone(normalizePhone(p.relativePhone || ""))
    setReEmail(p.relativeEmail || "")
    setReEmailError("")
    setReNationalId(normalizeNationalId(p.relativeNationalId || ""))
    setInsuranceId(p.insuranceId || "")
    const providerRaw = String(p.insuranceProvider || "").trim().toLowerCase()
    setInsuranceProvider(providerRaw === "vss" || providerRaw === "vietnam social security" ? "vss" : "")
    const parsedInsuranceExpiry = p.insuranceExpiry ? parseISO(p.insuranceExpiry) : undefined
    const validInsuranceExpiry = parsedInsuranceExpiry && isValid(parsedInsuranceExpiry) ? parsedInsuranceExpiry : undefined
    setInsuranceExpiry(validInsuranceExpiry)
    setInsuranceExpiryInputValue(validInsuranceExpiry ? format(validInsuranceExpiry, "dd/MM/yyyy") : "")
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
  useEffect(() => {
    if (!success) return
    if (success === lastSuccessRef.current) return
    lastSuccessRef.current = success
    showSuccess(success)
  }, [success, showSuccess])
  const handleSave = async () => {
    if (routeUserId == null) return
    const currentDobError = validateDob(dob, dobInputValue)
    const currentReDobError = validateDob(reDob, reDobInputValue)
    const currentEmailError = validateEmail(email)
    const currentReEmailError = validateEmail(reEmail)
    setDobError(currentDobError)
    setReDobError(currentReDobError)
    setEmailError(currentEmailError)
    setReEmailError(currentReEmailError)
    if (currentDobError || currentReDobError || currentEmailError || currentReEmailError) return
    const relativeRelationshipValue = relationship === "Other" ? relationshipOther.trim() : relationship
    const profileData: Partial<PatientProfile> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: dob ? format(dob, "yyyy-MM-dd") : undefined,
      sex,
      phone: normalizePhone(phone),
      email,
      nationalId: normalizeNationalId(nationalId),
      relativeName,
      relativeRelationship: relativeRelationshipValue,
      relativeDateOfBirth: reDob ? format(reDob, "yyyy-MM-dd") : undefined,
      relativeSex: reSex,
      relativePhone: normalizePhone(rePhone),
      relativeEmail: reEmail,
      relativeNationalId: normalizeNationalId(reNationalId),
      insuranceId,
      insuranceProvider,
      insuranceExpiry: insuranceExpiry ? format(insuranceExpiry, "yyyy-MM-dd") : undefined,
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
    setDobInputValue("")
    setDobError("")
    setSex("Male")
    setPhone("")
    setEmail("")
    setEmailError("")
    setNationalId("")
    setRelativeName("")
    setRelationship("Mother")
    setRelationshipOther("")
    setReDob(undefined)
    setReDobInputValue("")
    setReDobError("")
    setReSex("Female")
    setRePhone("")
    setReEmail("")
    setReEmailError("")
    setReNationalId("")
    setInsuranceId("")
    setInsuranceProvider("")
    setInsuranceExpiry(undefined)
    setInsuranceExpiryInputValue("")
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
        <CardContent className="pt-6">
          <form className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nurse-pp-first" className="text-sm font-semibold text-slate-700">
                  First name <span className="text-red-500">*</span>
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
                  Last name <span className="text-red-500">*</span>
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
                <div className="flex items-center gap-2">
                  <Input
                    value={dobInputValue}
                    onChange={(e) => {
                      const formattedInput = formatDateInput(e.target.value)
                      setDobInputValue(formattedInput)
                      if (formattedInput.length === 10) {
                        const parsedDate = parseDateInput(formattedInput)
                        setDob(parsedDate)
                        setDobError(validateDob(parsedDate, formattedInput))
                      } else {
                        setDob(undefined)
                        setDobError("")
                      }
                    }}
                    onBlur={(e) => {
                      const formattedInput = formatDateInput(e.target.value)
                      const parsedDate = parseDateInput(formattedInput)
                      setDob(parsedDate)
                      setDobError(validateDob(parsedDate, formattedInput))
                      setDobInputValue(parsedDate ? format(parsedDate, "dd/MM/yyyy") : formattedInput)
                    }}
                    placeholder="dd/mm/yyyy"
                    inputMode="numeric"
                    className="custom-input"
                    disabled={!isEditing}
                  />
                  <Popover>
                    <PopoverTrigger asChild disabled={!isEditing}>
                      <Button type="button" variant="outline" size="icon" aria-label="Open date picker">
                        <CalendarIcon className="h-4 w-4 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <Calendar
                        mode="single"
                        selected={dob}
                        onSelect={(selectedDate) => {
                          setDob(selectedDate)
                          setDobInputValue(selectedDate ? format(selectedDate, "dd/MM/yyyy") : "")
                          setDobError(validateDob(selectedDate))
                        }}
                        disabled={(date) => isAfterToday(date)}
                        captionLayout="dropdown"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                {dobError ? <p className="mt-1 text-xs text-red-500">{dobError}</p> : null}
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
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nurse-pp-phone"
                  type="tel"
                  className="custom-input"
                  value={phone}
                  onChange={(e) => syncPhone(e.target.value)}
                  onBlur={(e) => syncPhone(e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
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
                  onChange={(e) => {
                    const value = e.target.value
                    setEmail(value)
                    setEmailError(validateEmail(value))
                  }}
                  onBlur={(e) => {
                    const value = e.target.value
                    setEmail(value)
                    setEmailError(validateEmail(value))
                  }}
                  disabled={!isEditing}
                />
                {emailError ? <p className="mt-1 text-xs text-red-500">{emailError}</p> : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nurse-pp-national" className="text-sm font-semibold text-slate-700">
                National ID / Passport <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nurse-pp-national"
                className="custom-input"
                value={nationalId}
                onChange={(e) => syncNationalId(e.target.value)}
                onBlur={(e) => syncNationalId(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={12}
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
              <Label className="text-sm font-semibold text-slate-700">
                Relative&apos;s Name <span className="text-red-500">*</span>
              </Label>
              <Input
                className="custom-input"
                value={relativeName}
                onChange={(e) => setRelativeName(e.target.value)}
                disabled={!isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">
                Relationship <span className="text-red-500">*</span>
              </Label>
              <Select
                value={relationship}
                onValueChange={(value) => {
                  setRelationship(value)
                  if (value !== "Other") setRelationshipOther("")
                }}
                disabled={!isEditing}
              >
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
              {relationship === "Other" ? (
                <Input
                  placeholder="Enter relationship"
                  className="custom-input"
                  value={relationshipOther}
                  onChange={(e) => setRelationshipOther(e.target.value)}
                  onBlur={(e) => setRelationshipOther(e.target.value)}
                  disabled={!isEditing}
                />
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Date of Birth <span className="text-red-500">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={reDobInputValue}
                    onChange={(e) => {
                      const formattedInput = formatDateInput(e.target.value)
                      setReDobInputValue(formattedInput)
                      if (formattedInput.length === 10) {
                        const parsedDate = parseDateInput(formattedInput)
                        setReDob(parsedDate)
                        setReDobError(validateDob(parsedDate, formattedInput))
                      } else {
                        setReDob(undefined)
                        setReDobError("")
                      }
                    }}
                    onBlur={(e) => {
                      const formattedInput = formatDateInput(e.target.value)
                      const parsedDate = parseDateInput(formattedInput)
                      setReDob(parsedDate)
                      setReDobError(validateDob(parsedDate, formattedInput))
                      setReDobInputValue(parsedDate ? format(parsedDate, "dd/MM/yyyy") : formattedInput)
                    }}
                    placeholder="dd/mm/yyyy"
                    inputMode="numeric"
                    className="custom-input"
                    disabled={!isEditing}
                  />
                  <Popover>
                    <PopoverTrigger asChild disabled={!isEditing}>
                      <Button type="button" variant="outline" size="icon" aria-label="Open relative date picker">
                        <CalendarIcon className="h-4 w-4 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <Calendar
                        mode="single"
                        selected={reDob}
                        onSelect={(selectedDate) => {
                          setReDob(selectedDate)
                          setReDobInputValue(selectedDate ? format(selectedDate, "dd/MM/yyyy") : "")
                          setReDobError(validateDob(selectedDate))
                        }}
                        disabled={(date) => isAfterToday(date)}
                        captionLayout="dropdown"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                {reDobError ? <p className="mt-1 text-xs text-red-500">{reDobError}</p> : null}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Age</Label>
                <Input value={reAge} disabled className="custom-input bg-slate-50" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Sex <span className="text-red-500">*</span>
                </Label>
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
                <Label className="text-sm font-semibold text-slate-700">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  className="custom-input"
                  value={rePhone}
                  onChange={(e) => syncRelativePhone(e.target.value)}
                  onBlur={(e) => syncRelativePhone(e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Email Address</Label>
                <Input
                  type="email"
                  className="custom-input"
                  value={reEmail}
                  onChange={(e) => {
                    const value = e.target.value
                    setReEmail(value)
                    setReEmailError(validateEmail(value))
                  }}
                  onBlur={(e) => {
                    const value = e.target.value
                    setReEmail(value)
                    setReEmailError(validateEmail(value))
                  }}
                  disabled={!isEditing}
                />
                {reEmailError ? <p className="mt-1 text-xs text-red-500">{reEmailError}</p> : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">National ID / Passport</Label>
              <Input
                className="custom-input"
                value={reNationalId}
                onChange={(e) => syncRelativeNationalId(e.target.value)}
                onBlur={(e) => syncRelativeNationalId(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={12}
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
                <Input
                  value={insuranceId}
                  onChange={(e) => setInsuranceId(e.target.value)}
                  onInput={(e) => setInsuranceId((e.target as HTMLInputElement).value)}
                  onBlur={(e) => setInsuranceId(e.target.value)}
                  disabled={!isEditing}
                  className={`custom-input ${!isEditing ? "bg-slate-50" : ""}`}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Insurance Provider</Label>
                <Select value={insuranceProvider} onValueChange={setInsuranceProvider} disabled={!isEditing}>
                  <SelectTrigger className="custom-select">
                    <SelectValue placeholder="Vietnam Social Security" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vss">Vietnam Social Security</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 max-w-[calc(50%-8px)]">
              <Label className="text-sm font-semibold text-slate-700">Expiry Date</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={insuranceExpiryInputValue}
                  onChange={(e) => {
                    const formattedInput = formatDateInput(e.target.value)
                    setInsuranceExpiryInputValue(formattedInput)
                    if (formattedInput.length === 10) {
                      setInsuranceExpiry(parseDateInput(formattedInput))
                    }
                  }}
                  onInput={(e) => {
                    const formattedInput = formatDateInput((e.target as HTMLInputElement).value)
                    setInsuranceExpiryInputValue(formattedInput)
                  }}
                  onBlur={(e) => {
                    const parsedDate = parseDateInput(e.target.value)
                    setInsuranceExpiry(parsedDate)
                    if (parsedDate) {
                      setInsuranceExpiryInputValue(format(parsedDate, "dd/MM/yyyy"))
                    }
                  }}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={!isEditing}
                  className={`custom-input ${!isEditing ? "bg-slate-50" : ""}`}
                />
                <Popover>
                  <PopoverTrigger asChild disabled={!isEditing}>
                    <Button type="button" variant="outline" size="icon" aria-label="Open insurance expiry date picker">
                      <CalendarIcon className="h-4 w-4 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0">
                    <Calendar
                      mode="single"
                      selected={insuranceExpiry}
                      onSelect={(selectedDate) => {
                        setInsuranceExpiry(selectedDate)
                        setInsuranceExpiryInputValue(selectedDate ? format(selectedDate, "dd/MM/yyyy") : "")
                      }}
                      captionLayout="dropdown"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <PauseableCornerToastPortal
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </div>
  )
}
function calculateAge(date: Date) {
  if (!date) return ""
  const today = new Date()
  const diffTime = today.getTime() - date.getTime()
  if (diffTime < 0) return ""

  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  if (diffDays < 60) {
    return `${diffDays} days`
  }

  let diffMonths =
    (today.getFullYear() - date.getFullYear()) * 12 +
    (today.getMonth() - date.getMonth())
  if (today.getDate() < date.getDate()) {
    diffMonths--
  }

  if (diffMonths < 24) {
    return `${Math.max(diffMonths, 0)} months`
  }

  let ageYears = today.getFullYear() - date.getFullYear()
  const monthDiff = today.getMonth() - date.getMonth()
  const dayDiff = today.getDate() - date.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    ageYears--
  }

  return `${ageYears} years`
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
