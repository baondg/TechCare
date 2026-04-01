"use client"

import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { NurseLayout } from "@/components/nurse-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, CreditCard, Users, Loader2, CalendarIcon, ShieldCheck } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, parseISO } from "date-fns"
import { profileService, type PatientProfile } from "@/services/profile-service"

export default function NursePatientProfilePage() {
  const { patientId } = useParams<{ patientId: string }>()
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
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
    const s = String(value || "").toLowerCase()
    if (s === "m" || s === "male") return "Male"
    if (s === "f" || s === "female") return "Female"
    return "Other"
  }

  const age = dob ? String(calculateAge(dob)) : ""
  const reAge = reDob ? String(calculateAge(reDob)) : ""

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
    const load = async () => {
      if (!patientId || !Number.isFinite(Number(patientId))) {
        setError("Invalid patient id")
        setLoading(false)
        return
      }
      setLoading(true)
      setError("")
      try {
        const data = await profileService.getProfile(Number(patientId))
        setProfile(data)
        populateForm(data)
      } catch (e: any) {
        setError(e?.message || "Failed to load patient profile")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [patientId])

  return (
    <NurseLayout>
      <div className="space-y-8">
        <div>
          <h2 className="h-12 text-4xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
            Patient Profile
          </h2>
          <p className="text-slate-600">View core patient information and insurance details.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading patient profile...</p>
            </div>
          </div>
        ) : error ? (
          <Card className="card-feature border-red-200">
            <CardContent className="p-6 text-red-600">{error}</CardContent>
          </Card>
        ) : (
          <>
            <Card className="card-feature border-slate-200/60">
              <CardHeader className="bg-linear-to-r from-cyan-50/50 to-transparent">
                <CardTitle className="flex items-center gap-3 text-slate-900">
                  <div className="card-icon-wrapper h-10 w-10">
                    <User className="h-5 w-5" />
                  </div>
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <form className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">First name</Label>
                      <Input value={firstName} disabled className="custom-input bg-slate-50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Last name</Label>
                      <Input value={lastName} disabled className="custom-input bg-slate-50" />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Date of Birth</Label>
                      <Popover>
                        <PopoverTrigger asChild disabled>
                          <div className="custom-popover w-full flex items-center justify-between px-3 py-2 text-sm opacity-70 cursor-not-allowed">
                            <span className={dob ? "text-slate-900" : "text-slate-400"}>
                              {dob ? format(dob, "dd/MM/yyyy") : "dd/mm/yyyy"}
                            </span>
                            <CalendarIcon className="h-4 w-4 opacity-60" />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="p-0">
                          <Calendar mode="single" selected={dob} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Age</Label>
                      <Input value={age} disabled className="custom-input bg-slate-50" />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label className="text-sm font-semibold text-slate-700">Sex</Label>
                      <Select value={sex} disabled>
                        <SelectTrigger className="custom-select bg-slate-50">
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
                      <Input value={phone} disabled className="custom-input bg-slate-50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Email Address</Label>
                      <Input value={email} disabled className="custom-input bg-slate-50" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">National ID / Passport</Label>
                    <Input value={nationalId} disabled className="custom-input bg-slate-50" />
                  </div>

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200"></div>
                    </div>
                  </div>

                  <CardTitle className="flex items-center gap-3 text-slate-900 pt-2">
                    <div className="card-icon-wrapper h-10 w-10">
                      <Users className="h-5 w-5" />
                    </div>
                    Relative's Information
                  </CardTitle>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">Relative's Name</Label>
                    <Input value={relativeName} disabled className="custom-input bg-slate-50" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">Relationship</Label>
                    <Select value={relationship} disabled>
                      <SelectTrigger className="custom-select bg-slate-50">
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
                        <PopoverTrigger asChild disabled>
                          <div className="custom-popover w-full flex items-center justify-between px-3 py-2 text-sm opacity-70 cursor-not-allowed">
                            <span className={reDob ? "text-slate-900" : "text-slate-400"}>
                              {reDob ? format(reDob, "dd/MM/yyyy") : "dd/mm/yyyy"}
                            </span>
                            <CalendarIcon className="h-4 w-4 opacity-60" />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="p-0">
                          <Calendar mode="single" selected={reDob} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Age</Label>
                      <Input value={reAge} disabled className="custom-input bg-slate-50" />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label className="text-sm font-semibold text-slate-700">Sex</Label>
                      <Select value={reSex} disabled>
                        <SelectTrigger className="custom-select bg-slate-50">
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
                      <Input value={rePhone} disabled className="custom-input bg-slate-50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Email Address</Label>
                      <Input value={reEmail} disabled className="custom-input bg-slate-50" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">National ID / Passport</Label>
                    <Input value={reNationalId} disabled className="custom-input bg-slate-50" />
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Current department</Label>
                      <Input value={"-"} disabled className="custom-input bg-slate-50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Profile user ID</Label>
                      <Input value={String(profile?.userId ?? "-")} disabled className="custom-input bg-slate-50" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </NurseLayout>
  )
}

function calculateAge(date: Date) {
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const monthDiff = today.getMonth() - date.getMonth()
  const dayDiff = today.getDate() - date.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1
  return age
}

