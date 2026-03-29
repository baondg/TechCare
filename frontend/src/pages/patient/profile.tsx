"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PatientLayout } from "@/components/patient-layout"
import { User, CreditCard, Edit, Save, X, RotateCcw, Users, CalendarIcon, CircleAlert, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, parseISO } from "date-fns"
import { useAuth } from "@/contexts/AuthContext"
import type { PatientProfile } from "@/services/profile-service"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useProfile } from "@/hooks/useProfile"

export default function ProfilePage() {
  const { user } = useAuth()
  const { profile, loading, saving, error, success, save, clearMessages } = useProfile(user?.id)
  

  const [isEditing, setIsEditing] = useState(false)

  // Personal information
  const [fullName, setFullName] = useState("")
  const [dob, setDob] = useState<Date | undefined>()
  const [sex, setSex] = useState("Male")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [nationalId, setNationalId] = useState("")

  // Relative information
  const [relativeName, setRelativeName] = useState("")
  const [relationship, setRelationship] = useState("Mother")
  const [reDob, setReDob] = useState<Date | undefined>()
  const [reSex, setReSex] = useState("Female")
  const [rePhone, setRePhone] = useState("")
  const [reEmail, setReEmail] = useState("")
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

  const mapSex = (sex?: string) => {
    if (sex === "M") return "Male"
    if (sex === "F") return "Female"
    return "Other"
  }

  const populateForm = (p: PatientProfile) => {
    setFullName(p.fullName || "")
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


  const handleSave = async () => {
    if (!user?.id) return

    const profileData: Partial<PatientProfile> = {
      fullName,
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
    if (profile) {
      populateForm(profile)
    } else {
      handleClear()
    }
    setIsEditing(false)
    clearMessages()
  }

  const handleClear = () => {
    setFullName("")
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
        {/* Gradient header */}
        <div>
          <h2 className="h-12 text-4xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
            Profile Settings
          </h2>
          <p className="text-slate-600">Manage your personal information and preferences</p>
        </div>

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

          {success && (
            <div className="px-6">
              <Alert className="bg-green-50 border-green-200 text-green-800">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            </div>
          )}
          <CardContent className="pt-6">
            <form className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-semibold text-slate-700">
                  Full Name
                </Label>
                <Input 
                  id="name" 
                  placeholder="Enter your full name" 
                  className="custom-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={!isEditing}
                />
              </div>

              {/* Date of Birth, Age & Sex */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="dob" className="text-sm font-semibold text-slate-700">
                    Date of Birth
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild disabled={!isEditing}>
                      <div className={`custom-popover w-full flex items-center justify-between px-3 py-2 text-sm ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <span className={dob ? "text-slate-900" : "text-slate-400"}>
                          {dob ? format(dob, "dd/MM/yyyy") : "dd/mm/yyyy"}
                        </span>
                        <CalendarIcon className="h-4 w-4 opacity-60" />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <Calendar 
                        mode="single" 
                        selected={dob} 
                        onSelect={setDob} 
                        captionLayout="dropdown"
                      />
                    </PopoverContent>
                  </Popover>
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
                    Sex
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
                    Phone Number
                  </Label>
                  <Input 
                    id="phone" 
                    type="tel" 
                    placeholder="+84 xxx xxx xxx" 
                    className="custom-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              {/* National ID */}
              <div className="space-y-2">
                <Label htmlFor="national-id" className="text-sm font-semibold text-slate-700">
                  National ID / Passport
                </Label>
                <Input 
                  id="national-id" 
                  placeholder="Enter your ID number" 
                  className="custom-input"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
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
                  Relative's Name
                </Label>
                <Input 
                  id="relative-name" 
                  placeholder="Enter relative's name" 
                  className="custom-input"
                  value={relativeName}
                  onChange={(e) => setRelativeName(e.target.value)}
                  disabled={!isEditing}
                />
              </div>

              {/* Relationship */}
              <div className="space-y-2">
                <Label htmlFor="relationship" className="text-sm font-semibold text-slate-700">
                  Relationship
                </Label>
                <Select value={relationship} onValueChange={setRelationship} disabled={!isEditing}>
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
              </div>

              {/* Relative DOB, Age & Sex */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Date of Birth
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild disabled={!isEditing}>
                      <div className={`custom-popover w-full flex items-center justify-between px-3 py-2 text-sm ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <span className={reDob ? "text-slate-900" : "text-slate-400"}>
                          {reDob ? format(reDob, "dd/MM/yyyy") : "dd/mm/yyyy"}
                        </span>
                        <CalendarIcon className="h-4 w-4 opacity-60" />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <Calendar 
                        mode="single" 
                        selected={reDob} 
                        onSelect={setReDob} 
                        captionLayout="dropdown"
                      />
                    </PopoverContent>
                  </Popover>
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
                    Phone Number
                  </Label>
                  <Input 
                    type="tel" 
                    placeholder="+84 xxx xxx xxx" 
                    className="custom-input"
                    value={rePhone}
                    onChange={(e) => setRePhone(e.target.value)}
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
                    onChange={(e) => setReEmail(e.target.value)}
                    disabled={!isEditing}
                  />
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
                  onChange={(e) => setReNationalId(e.target.value)}
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
    </PatientLayout>
  )
}

function calculateAge(date: Date) {
  if (!date) return ""
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const monthDiff = today.getMonth() - date.getMonth()
  const dayDiff = today.getDate() - date.getDate()

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--
  }

  return age.toString()
}
