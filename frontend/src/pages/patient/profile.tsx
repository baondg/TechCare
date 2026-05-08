"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PatientLayout } from "@/components/patient-layout"
import { User, CreditCard, Edit, Save, X, RotateCcw, Users, CalendarIcon, CircleAlert, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, isValid, parse, parseISO } from "date-fns"
import { useAuth } from "@/contexts/AuthContext"
import type { PatientProfile } from "@/services/profile-service"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useProfile } from "@/hooks/useProfile"
import { usePauseableToast } from "@/hooks/usePauseableToast"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"

export default function ProfilePage() {
  const { user } = useAuth()
  const { profile, loading, saving, error, success, save, clearMessages } = useProfile(user?.id)
  const { toast, isExiting, showSuccess, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const lastSuccessRef = useRef("")

  const [isEditing, setIsEditing] = useState(false)

  // Personal information
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

  // Relative information
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

  // Insurance information
  const [insuranceId, setInsuranceId] = useState("")
  const [insuranceProvider, setInsuranceProvider] = useState("")
  const [insuranceExpiry, setInsuranceExpiry] = useState("")

  const age = dob ? calculateAge(dob) : ""
  const reAge = reDob ? calculateAge(reDob) : ""

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      populateForm(profile)
    }
  }, [profile])

  // Auto-dismiss success message
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

  const mapSex = (sex?: string) => {
    if (sex === "M") return "Male"
    if (sex === "F") return "Female"
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
      if (rawInput && rawInput.length === 10) {
        return "Invalid date. Please use dd/mm/yyyy."
      }
      return ""
    }
    if (isAfterToday(date)) {
      return "Date of birth cannot be later than today."
    }
    return ""
  }

  const validateEmail = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ""
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(trimmed) ? "" : "Invalid email format"
  }

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
    const parsedRelativeDob = p.relativeDateOfBirth ? parseISO(p.relativeDateOfBirth) : undefined
    setReDob(parsedRelativeDob)
    setReDobInputValue(parsedRelativeDob ? format(parsedRelativeDob, "dd/MM/yyyy") : "")
    setReDobError("")
    setReSex(mapSex(p.relativeSex))
    setRePhone(normalizePhone(p.relativePhone || ""))
    setReEmail(p.relativeEmail || "")
    setReEmailError("")
    setReNationalId(normalizeNationalId(p.relativeNationalId || ""))

    setInsuranceId(p.insuranceId || "")
    setInsuranceProvider(p.insuranceProvider || "")
    setInsuranceExpiry(p.insuranceExpiry || "")
  }


  const handleSave = async () => {
    if (!user?.id) return
    const currentDobError = validateDob(dob, dobInputValue)
    const currentRelativeDobError = validateDob(reDob, reDobInputValue)
    const currentEmailError = validateEmail(email)
    const currentRelativeEmailError = validateEmail(reEmail)
    setDobError(currentDobError)
    setReDobError(currentRelativeDobError)
    setEmailError(currentEmailError)
    setReEmailError(currentRelativeEmailError)
    if (currentDobError || currentRelativeDobError || currentEmailError || currentRelativeEmailError) return

    const relativeRelationshipValue =
      relationship === "Other" ? relationshipOther.trim() : relationship

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
      insuranceExpiry,
    }

    await save(profileData)
  }

  const handleCancel = () => {
    if (profile) {
      populateForm(profile)
    } else {
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
    setInsuranceExpiry("")
  }

  if (loading) {
    return (
      <PatientLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600 mx-auto mb-4" />
            <p className="text-slate-600">Loading profile...</p>
          </div>
        </div>
      </PatientLayout>
    )
  }

  return (
    <PatientLayout>
      <div className="space-y-8">
        {/* Personal & Relative Information Card */}
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
                <div className="flex gap-2 flex-wrap">
                  {/* Edit */}
                  <Button
                    className="btn-gradient"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    disabled={isEditing}
                  >
                    Edit
                  </Button>

                  {/* Save */}
                  <Button
                    className="btn-gradient"
                    size="sm"
                    onClick={handleSave}
                    disabled={!isEditing || saving}
                  >
                    Save
                  </Button>

                  {/* Cancel */}
                  <Button
                    className="btn-outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={!isEditing || saving}
                  >
                    Cancel
                  </Button>

                  {/* Clear */}
                  <Button
                    className="btn-outline"
                    size="sm"
                    onClick={handleClear}
                    disabled={!isEditing}
                  >
                    Clear
                  </Button>

                </div>
              </div>
            </div>
          </CardHeader>

          {error && (
            <div className="px-6">
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          <CardContent className="pt-6">
            <form className="space-y-6">
              {/* First / Last name */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-sm font-semibold text-slate-700">
                    First name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    placeholder="First name"
                    className="custom-input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onInput={(e) => setFirstName((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setFirstName(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sm font-semibold text-slate-700">
                    Last name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    placeholder="Last name"
                    className="custom-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onInput={(e) => setLastName((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setLastName(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              {/* Date of Birth, Age & Sex */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="dob" className="text-sm font-semibold text-slate-700">
                    Date of Birth <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="dob"
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
                  <Label htmlFor="age" className="text-sm font-semibold text-slate-700">
                    Age
                  </Label>
                  <Input 
                    id="age" 
                    value={age} 
                    disabled 
                    className="custom-input bg-slate-50"
                  />
                </div>
                
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="sex" className="text-sm font-semibold text-slate-700">
                    Sex <span className="text-red-500">*</span>
                  </Label>
                  <Select value={sex} onValueChange={setSex} disabled={!isEditing}>
                    <SelectTrigger id="sex" className="custom-select">
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

              {/* Phone & Email */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-semibold text-slate-700">
                    Phone Number <span className="text-red-500">*</span>
                  </Label>
                  <Input 
                    id="phone" 
                    type="tel" 
                    placeholder="+84 xxx xxx xxx" 
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
                  <Label htmlFor="email" className="text-sm font-semibold text-slate-700">
                    Email Address
                  </Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="your.email@example.com" 
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

              {/* National ID */}
              <div className="space-y-2">
                <Label htmlFor="national-id" className="text-sm font-semibold text-slate-700">
                  National ID / Passport <span className="text-red-500">*</span>
                </Label>
                <Input 
                  id="national-id" 
                  placeholder="Enter your ID number" 
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

              {/* Gradient divider */}
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                </div>
              </div>

              {/* Relative's Information Section */}
              <CardTitle className="flex items-center gap-3 text-slate-900 pt-2">
                <div className="card-icon-wrapper h-10 w-10">
                  <Users className="h-5 w-5" />
                </div>
                Relative's Information
              </CardTitle>

              {/* Relative Name */}
              <div className="space-y-2">
                <Label htmlFor="relative-name" className="text-sm font-semibold text-slate-700">
                  Relative's Name <span className="text-red-500">*</span>
                </Label>
                <Input 
                  id="relative-name" 
                  placeholder="Enter relative's name" 
                  className="custom-input"
                  value={relativeName}
                  onChange={(e) => setRelativeName(e.target.value)}
                  onInput={(e) => setRelativeName((e.target as HTMLInputElement).value)}
                  onBlur={(e) => setRelativeName(e.target.value)}
                  disabled={!isEditing}
                />
              </div>

              {/* Relationship */}
              <div className="space-y-2">
                <Label htmlFor="relationship" className="text-sm font-semibold text-slate-700">
                  Relationship <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={relationship}
                  onValueChange={(value) => {
                    setRelationship(value)
                    if (value !== "Other") {
                      setRelationshipOther("")
                    }
                  }}
                  disabled={!isEditing}
                >
                  <SelectTrigger id="relationship" className="custom-select">
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
                    id="relationship-other"
                    placeholder="Enter relationship"
                    className="custom-input"
                    value={relationshipOther}
                    onChange={(e) => setRelationshipOther(e.target.value)}
                    onBlur={(e) => setRelationshipOther(e.target.value)}
                    disabled={!isEditing}
                  />
                ) : null}
              </div>

              {/* Relative DOB, Age & Sex */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Date of Birth
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
                  <Input 
                    value={reAge} 
                    disabled 
                    className="custom-input bg-slate-50"
                  />
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

              {/* Relative Phone & Email */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Phone Number <span className="text-red-500">*</span>
                  </Label>
                  <Input 
                    type="tel" 
                    placeholder="+84 xxx xxx xxx" 
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
                  <Label className="text-sm font-semibold text-slate-700">
                    Email Address
                  </Label>
                  <Input 
                    type="email" 
                    placeholder="relative@example.com" 
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

              {/* Relative National ID */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  National ID / Passport
                </Label>
                <Input 
                  placeholder="Enter ID number" 
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

        {/* Insurance Information Card */}
        <Card className="card-feature border-slate-200/60">
          <CardHeader className="bg-linear-to-r from-purple-50/50 to-transparent">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <div className="card-icon-wrapper h-10 w-10 bg-linear-to-br from-purple-500 to-purple-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                Insurance Information
              </CardTitle>
            </div>
            <CardDescription className="mt-2">Your health insurance details</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Insurance ID
                  </Label>
                  <Input 
                    value={insuranceId}
                    disabled
                    className={`custom-input ${!isEditing ? 'bg-slate-50' : ''}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Insurance Provider
                  </Label>
                  <Input 
                    value={insuranceProvider}
                    disabled
                    className={`custom-input ${!isEditing ? 'bg-slate-50' : ''}`}
                  />
                </div>
              </div>

              <div className="space-y-2 max-w-[calc(50%-8px)]">
                <Label className="text-sm font-semibold text-slate-700">
                  Expiry Date
                </Label>
                <Input 
                  value={insuranceExpiry}
                  disabled
                  className={`custom-input ${!isEditing ? 'bg-slate-50' : ''}`}
                />
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
      <PauseableCornerToastPortal
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </PatientLayout>
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
