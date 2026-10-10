"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PatientLayout } from "@/components/patient-layout"
import { User, CreditCard, Edit, Save, X, Users, CalendarIcon, CircleAlert, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, isValid, parse, parseISO } from "date-fns"
import { useAuth } from "@/contexts/auth-context"
import type { PatientProfile } from "@/services/profile-service"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useProfile } from "@/hooks/use-profile"
import { usePauseableToast } from "@/hooks/use-pauseable-toast"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import { useTranslation } from "react-i18next"

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { profile, loading, saving, error, success, save, clearMessages } = useProfile(user?.id)
  const { toast, isExiting, showSuccess, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const lastSuccessRef = useRef("")

  const [isEditing, setIsEditing] = useState(false)

  // Personal information
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [firstNameError, setFirstNameError] = useState("")
  const [lastNameError, setLastNameError] = useState("")
  const [dob, setDob] = useState<Date | undefined>()
  const [dobInputValue, setDobInputValue] = useState("")
  const [dobError, setDobError] = useState("")
  const [sex, setSex] = useState("Male")
  const [phone, setPhone] = useState("")
  const [phoneError, setPhoneError] = useState("")
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [nationalIdError, setNationalIdError] = useState("")

  // Relative information
  const [relativeName, setRelativeName] = useState("")
  const [relationship, setRelationship] = useState("Mother")
  const [relationshipOther, setRelationshipOther] = useState("")
  const [reDob, setReDob] = useState<Date | undefined>()
  const [reDobInputValue, setReDobInputValue] = useState("")
  const [reDobError, setReDobError] = useState("")
  const [reSex, setReSex] = useState("Female")
  const [rePhone, setRePhone] = useState("")
  const [rePhoneError, setRePhoneError] = useState("")
  const [reEmail, setReEmail] = useState("")
  const [reEmailError, setReEmailError] = useState("")
  const [relativeNameError, setRelativeNameError] = useState("")
  const [reNationalId, setReNationalId] = useState("")
  const [reNationalIdError, setReNationalIdError] = useState("")

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
        return t("patient.profile.validation.invalidDate")
      }
      return ""
    }
    if (isAfterToday(date)) {
      return t("patient.profile.validation.futureDob")
    }
    return ""
  }

  const validateEmail = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ""
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(trimmed) ? "" : t("patient.profile.validation.invalidEmail")
  }

  const validateRequiredName = (value: string) => {
    const trimmed = value.normalize("NFC").trim()
    if (!trimmed) return t("patient.profile.validation.nameRequired")
    if (/\d/u.test(trimmed)) return t("patient.profile.validation.nameLettersOnly")
    const lettersOnlyRegex = /^[\p{L}\p{M}\s'-]+$/u
    if (!lettersOnlyRegex.test(trimmed)) return t("patient.profile.validation.nameLettersOnly")
    const hasLetter = /[\p{L}]/u.test(trimmed)
    return hasLetter ? "" : t("patient.profile.validation.nameLettersOnly")
  }

  const validateRequiredPhone = (value: string) => {
    const normalized = normalizePhone(value)
    return normalized ? "" : t("patient.profile.validation.phoneRequired")
  }

  const validateRequiredNationalId = (value: string) => {
    const normalized = normalizeNationalId(value)
    return normalized ? "" : t("patient.profile.validation.nationalIdRequired")
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
    setFirstNameError("")
    setLastNameError("")
    const parsedDob = p.dateOfBirth ? parseISO(p.dateOfBirth) : undefined
    setDob(parsedDob)
    setDobInputValue(parsedDob ? format(parsedDob, "dd/MM/yyyy") : "")
    setDobError("")
    setSex(mapSex(p.sex))
    setPhone(normalizePhone(p.phone || ""))
    setPhoneError("")
    setEmail(p.email || "")
    setEmailError("")
    setNationalId(normalizeNationalId(p.nationalId || ""))
    setNationalIdError("")

    setRelativeName(p.relativeName || "")
    setRelativeNameError("")
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
    setRePhoneError("")
    setReEmail(p.relativeEmail || "")
    setReEmailError("")
    setReNationalId(normalizeNationalId(p.relativeNationalId || ""))
    setReNationalIdError("")

    setInsuranceId(p.insuranceId || "")
    setInsuranceProvider(p.insuranceProvider || "")
    setInsuranceExpiry(p.insuranceExpiry || "")
  }


  const handleSave = async () => {
    if (!user?.id) return
    const currentFirstNameError = validateRequiredName(firstName)
    const currentLastNameError = validateRequiredName(lastName)
    const currentRelativeNameError = validateRequiredName(relativeName)
    const currentDobError = dob ? validateDob(dob, dobInputValue) : t("patient.profile.validation.dobRequired")
    const currentPhoneError = validateRequiredPhone(phone)
    const currentNationalIdError = validateRequiredNationalId(nationalId)
    const currentRelativeDobError = reDob ? validateDob(reDob, reDobInputValue) : t("patient.profile.validation.dobRequired")
    const currentRelativePhoneError = validateRequiredPhone(rePhone)
    const currentRelativeNationalIdError = validateRequiredNationalId(reNationalId)
    const currentEmailError = validateEmail(email)
    const currentRelativeEmailError = validateEmail(reEmail)
    setFirstNameError(currentFirstNameError)
    setLastNameError(currentLastNameError)
    setRelativeNameError(currentRelativeNameError)
    setDobError(currentDobError)
    setPhoneError(currentPhoneError)
    setNationalIdError(currentNationalIdError)
    setReDobError(currentRelativeDobError)
    setRePhoneError(currentRelativePhoneError)
    setReNationalIdError(currentRelativeNationalIdError)
    setEmailError(currentEmailError)
    setReEmailError(currentRelativeEmailError)
    if (
      currentFirstNameError ||
      currentLastNameError ||
      currentRelativeNameError ||
      currentDobError ||
      currentPhoneError ||
      currentNationalIdError ||
      currentRelativeDobError ||
      currentRelativePhoneError ||
      currentRelativeNationalIdError ||
      currentEmailError ||
      currentRelativeEmailError
    ) return

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
      relativeName: relativeName.trim(),
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
    }
    setIsEditing(false)
    clearMessages()
  }

  if (loading) {
    return (
      <PatientLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600 mx-auto mb-4" />
            <p className="text-slate-600">{t("patient.profile.loading")}</p>
          </div>
        </div>
      </PatientLayout>
    )
  }

  return (
    <PatientLayout>
      <div className="mx-auto max-w-[calc(64rem+200px)] space-y-8 pb-24">
        {/* Personal & Relative Information Card */}
        <Card className="card-feature border-slate-200/60">
          <CardHeader className="bg-linear-to-r from-cyan-50/50 to-transparent">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <div className="card-icon-wrapper h-10 w-10">
                  <User className="h-5 w-5" />
                </div>
                {t("patient.profile.sections.personalInformation")}
              </CardTitle>
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
                    {t("patient.profile.fields.firstName")} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    placeholder={t("patient.profile.placeholders.firstName")}
                    className="custom-input"
                    value={firstName}
                    onChange={(e) => {
                      const value = e.target.value
                      setFirstName(value)
                      setFirstNameError(validateRequiredName(value))
                    }}
                    onBlur={(e) => {
                      const value = e.target.value
                      setFirstName(value)
                      setFirstNameError(validateRequiredName(value))
                    }}
                    disabled={!isEditing}
                  />
                  {firstNameError ? <p className="mt-1 text-xs text-red-500">{firstNameError}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sm font-semibold text-slate-700">
                    {t("patient.profile.fields.lastName")} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    placeholder={t("patient.profile.placeholders.lastName")}
                    className="custom-input"
                    value={lastName}
                    onChange={(e) => {
                      const value = e.target.value
                      setLastName(value)
                      setLastNameError(validateRequiredName(value))
                    }}
                    onBlur={(e) => {
                      const value = e.target.value
                      setLastName(value)
                      setLastNameError(validateRequiredName(value))
                    }}
                    disabled={!isEditing}
                  />
                  {lastNameError ? <p className="mt-1 text-xs text-red-500">{lastNameError}</p> : null}
                </div>
              </div>

              {/* Date of Birth, Age & Sex */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="dob" className="text-sm font-semibold text-slate-700">
                    {t("patient.profile.fields.dateOfBirth")} <span className="text-red-500">*</span>
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
                      placeholder={t("patient.profile.placeholders.dob")}
                      inputMode="numeric"
                      className="custom-input"
                      disabled={!isEditing}
                    />
                    <Popover>
                      <PopoverTrigger asChild disabled={!isEditing}>
                        <Button type="button" variant="outline" size="icon" aria-label={t("patient.profile.aria.openDatePicker")}>
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
                    {t("patient.profile.fields.age")}
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
                    {t("patient.profile.fields.sex")} <span className="text-red-500">*</span>
                  </Label>
                  <Select value={sex} onValueChange={setSex} disabled={!isEditing}>
                    <SelectTrigger id="sex" className="custom-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">{t("patient.profile.options.male")}</SelectItem>
                      <SelectItem value="Female">{t("patient.profile.options.female")}</SelectItem>
                      <SelectItem value="Other">{t("patient.profile.options.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-semibold text-slate-700">
                    {t("patient.profile.fields.phoneNumber")} <span className="text-red-500">*</span>
                  </Label>
                  <Input 
                    id="phone" 
                    type="tel" 
                    placeholder={t("patient.profile.placeholders.phone")}
                    className="custom-input"
                    value={phone}
                    onChange={(e) => {
                      const value = normalizePhone(e.target.value)
                      setPhone(value)
                      setPhoneError(validateRequiredPhone(value))
                    }}
                    onBlur={(e) => {
                      const value = normalizePhone(e.target.value)
                      setPhone(value)
                      setPhoneError(validateRequiredPhone(value))
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    disabled={!isEditing}
                  />
                  {phoneError ? <p className="mt-1 text-xs text-red-500">{phoneError}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-slate-700">
                    {t("patient.profile.fields.emailAddress")}
                  </Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder={t("patient.profile.placeholders.email")}
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
                  {t("patient.profile.fields.nationalIdPassport")} <span className="text-red-500">*</span>
                </Label>
                <Input 
                  id="national-id" 
                  placeholder={t("patient.profile.placeholders.nationalId")}
                  className="custom-input"
                  value={nationalId}
                  onChange={(e) => {
                    const value = normalizeNationalId(e.target.value)
                    setNationalId(value)
                    setNationalIdError(validateRequiredNationalId(value))
                  }}
                  onBlur={(e) => {
                    const value = normalizeNationalId(e.target.value)
                    setNationalId(value)
                    setNationalIdError(validateRequiredNationalId(value))
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={12}
                  disabled={!isEditing}
                />
                {nationalIdError ? <p className="mt-1 text-xs text-red-500">{nationalIdError}</p> : null}
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
                {t("patient.profile.sections.relativeInformation")}
              </CardTitle>

              {/* Relative Name */}
              <div className="space-y-2">
                <Label htmlFor="relative-name" className="text-sm font-semibold text-slate-700">
                  {t("patient.profile.fields.relativeName")} <span className="text-red-500">*</span>
                </Label>
                <Input 
                  id="relative-name" 
                  placeholder={t("patient.profile.placeholders.relativeName")}
                  className="custom-input"
                  value={relativeName}
                  onChange={(e) => {
                    const value = e.target.value
                    setRelativeName(value)
                    setRelativeNameError(validateRequiredName(value))
                  }}
                  onBlur={(e) => {
                    const value = e.target.value
                    setRelativeName(value)
                    setRelativeNameError(validateRequiredName(value))
                  }}
                  disabled={!isEditing}
                />
                {relativeNameError ? <p className="mt-1 text-xs text-red-500">{relativeNameError}</p> : null}
              </div>

              {/* Relationship */}
              <div className="space-y-2">
                <Label htmlFor="relationship" className="text-sm font-semibold text-slate-700">
                  {t("patient.profile.fields.relationship")} <span className="text-red-500">*</span>
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
                    <SelectItem value="Mother">{t("patient.profile.options.relationship.mother")}</SelectItem>
                    <SelectItem value="Father">{t("patient.profile.options.relationship.father")}</SelectItem>
                    <SelectItem value="Spouse">{t("patient.profile.options.relationship.spouse")}</SelectItem>
                    <SelectItem value="Sibling">{t("patient.profile.options.relationship.sibling")}</SelectItem>
                    <SelectItem value="Other">{t("patient.profile.options.relationship.other")}</SelectItem>
                  </SelectContent>
                </Select>
                {relationship === "Other" ? (
                  <Input
                    id="relationship-other"
                    placeholder={t("patient.profile.placeholders.relationshipOther")}
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
                    {t("patient.profile.fields.dateOfBirth")}
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
                      placeholder={t("patient.profile.placeholders.dob")}
                      inputMode="numeric"
                      className="custom-input"
                      disabled={!isEditing}
                    />
                    <Popover>
                      <PopoverTrigger asChild disabled={!isEditing}>
                        <Button type="button" variant="outline" size="icon" aria-label={t("patient.profile.aria.openRelativeDatePicker")}>
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
                  <Label className="text-sm font-semibold text-slate-700">{t("patient.profile.fields.age")}</Label>
                  <Input 
                    value={reAge} 
                    disabled 
                    className="custom-input bg-slate-50"
                  />
                </div>
                
                <div className="space-y-2 col-span-2">
                  <Label className="text-sm font-semibold text-slate-700">{t("patient.profile.fields.sex")}</Label>
                  <Select value={reSex} onValueChange={setReSex} disabled={!isEditing}>
                    <SelectTrigger className="custom-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">{t("patient.profile.options.male")}</SelectItem>
                      <SelectItem value="Female">{t("patient.profile.options.female")}</SelectItem>
                      <SelectItem value="Other">{t("patient.profile.options.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Relative Phone & Email */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    {t("patient.profile.fields.phoneNumber")} <span className="text-red-500">*</span>
                  </Label>
                  <Input 
                    type="tel" 
                    placeholder={t("patient.profile.placeholders.phone")}
                    className="custom-input"
                    value={rePhone}
                    onChange={(e) => {
                      const value = normalizePhone(e.target.value)
                      setRePhone(value)
                      setRePhoneError(validateRequiredPhone(value))
                    }}
                    onBlur={(e) => {
                      const value = normalizePhone(e.target.value)
                      setRePhone(value)
                      setRePhoneError(validateRequiredPhone(value))
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    disabled={!isEditing}
                  />
                  {rePhoneError ? <p className="mt-1 text-xs text-red-500">{rePhoneError}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    {t("patient.profile.fields.emailAddress")}
                  </Label>
                  <Input 
                    type="email" 
                    placeholder={t("patient.profile.placeholders.relativeEmail")}
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
                  {t("patient.profile.fields.nationalIdPassport")}
                </Label>
                <Input 
                  placeholder={t("patient.profile.placeholders.relativeNationalId")}
                  className="custom-input"
                  value={reNationalId}
                  onChange={(e) => {
                    const value = normalizeNationalId(e.target.value)
                    setReNationalId(value)
                    setReNationalIdError(validateRequiredNationalId(value))
                  }}
                  onBlur={(e) => {
                    const value = normalizeNationalId(e.target.value)
                    setReNationalId(value)
                    setReNationalIdError(validateRequiredNationalId(value))
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={12}
                  disabled={!isEditing}
                />
                {reNationalIdError ? <p className="mt-1 text-xs text-red-500">{reNationalIdError}</p> : null}
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
                {t("patient.profile.sections.insuranceInformation")}
              </CardTitle>
            </div>
            <CardDescription className="mt-2">{t("patient.profile.insuranceDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    {t("patient.profile.fields.insuranceId")}
                  </Label>
                  <Input 
                    value={insuranceId}
                    disabled
                    className={`custom-input ${!isEditing ? 'bg-slate-50' : ''}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    {t("patient.profile.fields.insuranceProvider")}
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
                  {t("patient.profile.fields.expiryDate")}
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
                  {t("patient.profile.insuranceHint")}
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
      <div className="fixed bottom-6 right-10 z-40 flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsEditing(true)}
          disabled={isEditing}
          aria-label={t("patient.profile.aria.editProfile")}
          className="h-12 w-12 rounded-full border-slate-300 bg-white text-slate-800 shadow-lg hover:bg-slate-50 hover:text-slate-900"
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!isEditing || saving}
          aria-label={t("patient.profile.aria.saveProfile")}
          className="h-12 w-12 rounded-full bg-[#0086C4] text-white shadow-lg hover:bg-[#0078b0] hover:text-white border border-[#006a9e]"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={!isEditing || saving}
          aria-label={t("patient.profile.aria.cancelEditProfile")}
          className="h-12 w-12 rounded-full border-slate-300 bg-white text-slate-800 shadow-lg hover:bg-slate-50 hover:text-slate-900"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
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
