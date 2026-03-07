"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PatientLayout } from "@/components/patient-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
<<<<<<< HEAD
<<<<<<< HEAD
import { Activity, Heart, AlertCircle, FileText, Save, History, X, Loader2, Stethoscope } from "lucide-react"
=======
import { Activity, Heart, AlertCircle, FileText, Save, History, X } from "lucide-react"
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
import { Activity, Heart, AlertCircle, FileText, Save, History, X, Loader2, Stethoscope } from "lucide-react"
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CollapsibleSection } from "@/components/collapsible-section"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { healthInfoService } from "@/services/health-info-service"
import type { HealthInfo } from "@/services/health-info-service"
import { useAuth } from "@/contexts/AuthContext"

export default function HealthInfoPage() {
  const { user } = useAuth()

  type HealthRecord = {
    id: number
    updatedAt: Date
    height: number
    weight: number
    bmi: number
    bloodPressure: string
    heartRate: number
    respiratoryRate: number
    temperature: number
    spo2: number
    symptoms: string
    updatedBy: string
  }

  // Loading states
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [height, setHeight] = useState("")
  const [weight, setWeight] = useState("")
  const [bpSys, setBpSys] = useState("")
  const [bpDia, setBpDia] = useState("")
  const [heartRate, setHeartRate] = useState("")
  const [respiratoryRate, setRespiratoryRate] = useState("")
  const [temperature, setTemperature] = useState("")
  const [spo2, setSpo2] = useState("")
  const [bloodType, setBloodType] = useState("O+")
  const [symptoms, setSymptoms] = useState("")

  // Current health info ID for updates
  const [currentHealthInfoId, setCurrentHealthInfoId] = useState<number | null>(null)


  const bmi = useMemo(() => {
    const h = parseFloat(height)
    const w = parseFloat(weight)
    if (!h || !w || h <= 0) return "N/A"
    return (w / ((h / 100) ** 2)).toFixed(1)
  }, [height, weight])

<<<<<<< HEAD
<<<<<<< HEAD
  const [healthHistory, setHealthHistory] = useState<HealthRecord[]>([])
  const [historyPagination, setHistoryPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 })
=======
  const [healthHistory] = useState<HealthRecord[]>([
    {
      id: 1,
      updatedAt: new Date("2025-11-20T10:30:00"),
      height: 174,
      weight: 82,
      bmi: 27.1,
      bloodPressure: "120/78",
      heartRate: 80,
      respiratoryRate: 16,
      temperature: 36.7,
      spo2: 98,
      symptoms: "Sore throat, mild fever",
      updatedBy: "Patient",
    },
    {
      id: 2,
      updatedAt: new Date("2025-10-15T14:20:00"),
      height: 174,
      weight: 85,
      bmi: 28.0,
      bloodPressure: "118/76",
      heartRate: 84,
      respiratoryRate: 18,
      temperature: 36.8,
      spo2: 97,
      symptoms: "Headache, fatigue",
      updatedBy: "Patient",
    },
  ])
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
  const [healthHistory, setHealthHistory] = useState<HealthRecord[]>([])
  const [historyPagination, setHistoryPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 })
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)

  const [selectedRecord, setSelectedRecord] = useState<HealthRecord | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const pageCount = Math.ceil(healthHistory.length / pageSize)
  const paginated = healthHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Load health info on mount
  useEffect(() => {
    loadHealthInfo()
    loadHealthHistory()
  }, [user])

  const loadHealthInfo = async () => {
    if (!user?.id) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await healthInfoService.getHealthInfo()
      if (result.success && result.healthInfo) {
        const info = result.healthInfo
        setCurrentHealthInfoId(info.id)
        setHeight(info.height?.toString() || "")
        setWeight(info.weight?.toString() || "")
        setBpSys(info.bloodPressureSys?.toString() || "")
        setBpDia(info.bloodPressureDia?.toString() || "")
        setHeartRate(info.heartRate?.toString() || "")
        setRespiratoryRate(info.respiratoryRate?.toString() || "")
        setTemperature(info.temperature?.toString() || "")
        setSpo2(info.spo2?.toString() || "")
        setBloodType(info.bloodType || "O+")
        setSymptoms(info.currentSymptoms || "")
        
        // Set allergies
        if (info.drugAllergies) setDrugAllergies(info.drugAllergies)
        if (info.foodAllergies) setFoodAllergies(info.foodAllergies)
        if (info.otherAllergies) setOtherAllergies(info.otherAllergies)
        
        // Set medical history
        if (info.chronicConditions) setChronicConditions(info.chronicConditions)
        if (info.pastSurgeries) setPastSurgeries(info.pastSurgeries)
        if (info.familyHistory) setFamilyHistory(info.familyHistory)
        if (info.pastIllnesses) setPastIllnesses(info.pastIllnesses)
        if (info.vaccinations) setVaccinations(info.vaccinations)
        if (info.substanceAbuse) setSubstanceAbuse(info.substanceAbuse)
      }
    } catch (err) {
      console.error("Failed to load health info:", err)
    } finally {
      setLoading(false)
    }
  }

  const loadHealthHistory = async () => {
    try {
      const result = await healthInfoService.getHealthHistory(1, 100)
      if (result.success && result.history) {
        const records: HealthRecord[] = result.history.map((h, i) => ({
          id: h.id,
          updatedAt: new Date(h.updatedAt || h.createdAt || Date.now()),
          height: h.height || 0,
          weight: h.weight || 0,
          bmi: h.bmi || 0,
          bloodPressure: `${h.bloodPressureSys || 0}/${h.bloodPressureDia || 0}`,
          heartRate: h.heartRate || 0,
          respiratoryRate: h.respiratoryRate || 0,
          temperature: h.temperature || 0,
          spo2: h.spo2 || 0,
          symptoms: h.currentSymptoms || "",
          updatedBy: h.updatedBy || "Patient"
        }))
        setHealthHistory(records)
        if (result.pagination) {
          setHistoryPagination(result.pagination)
        }
      }
    } catch (err) {
      console.error("Failed to load health history:", err)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const healthData = {
        height: height ? parseFloat(height) : undefined,
        weight: weight ? parseFloat(weight) : undefined,
        bloodPressureSys: bpSys ? parseInt(bpSys) : undefined,
        bloodPressureDia: bpDia ? parseInt(bpDia) : undefined,
        heartRate: heartRate ? parseInt(heartRate) : undefined,
        respiratoryRate: respiratoryRate ? parseInt(respiratoryRate) : undefined,
        temperature: temperature ? parseFloat(temperature) : undefined,
        spo2: spo2 ? parseInt(spo2) : undefined,
        bloodType: bloodType as any,
        currentSymptoms: symptoms,
        drugAllergies,
        foodAllergies,
        otherAllergies,
        chronicConditions,
        pastSurgeries,
        familyHistory,
        pastIllnesses,
        vaccinations,
        substanceAbuse,
        updatedBy: "Patient"
      }

      let result
      if (currentHealthInfoId) {
        result = await healthInfoService.updateHealthInfo(currentHealthInfoId, healthData)
      } else {
        result = await healthInfoService.createHealthInfo(healthData)
      }

      if (result.success) {
        setSuccess("Health information saved successfully!")
        setIsEditing(false)
        loadHealthHistory()
        setTimeout(() => setSuccess(null), 3000)
      } else {
        setError(result.error || "Failed to save health information")
      }
    } catch (err: any) {
      setError(err.message || "Failed to save health information")
    } finally {
      setSaving(false)
    }
  }

  const loadRecordToForm = (record: HealthRecord) => {
    setHeight(record.height.toString())
    setWeight(record.weight.toString())
    const [sys, dia] = record.bloodPressure.split("/")
    setBpSys(sys)
    setBpDia(dia)
    setHeartRate(record.heartRate.toString())
    setRespiratoryRate(record.respiratoryRate.toString())
    setTemperature(record.temperature.toString())
    setSpo2(record.spo2.toString())
    setSymptoms(record.symptoms)

    setSelectedRecord(record)
    setIsEditing(true) // tự động bật edit để người dùng có thể sửa tiếp
  }

  const [drugAllergies, setDrugAllergies] = useState<string[]>([])
  const [foodAllergies, setFoodAllergies] = useState<string[]>([])
  const [otherAllergies, setOtherAllergies] = useState<string[]>([])

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
  const [chronicConditions, setChronicConditions] = useState<string[]>([])
  const [pastSurgeries, setPastSurgeries] = useState<string[]>([])
  const [familyHistory, setFamilyHistory] = useState<string[]>([])
  const [pastIllnesses, setPastIllnesses] = useState<string[]>([])
  const [vaccinations, setVaccinations] = useState<string[]>([])
  const [substanceAbuse, setSubstanceAbuse] = useState<string[]>([])
<<<<<<< HEAD
=======
  const [chronicConditions, setChronicConditions] = useState(["Hypertension (controlled)"])
  const [pastSurgeries, setPastSurgeries] = useState(["Appendectomy (2018)"])
  const [familyHistory, setFamilyHistory] = useState(["Father: Heart disease, Mother: Diabetes"])
  const [pastIllnesses, setPastIllnesses] = useState(["Mumps"])
  const [vaccinations, setVaccinations] = useState(["Tetanus and diphtheria"])
  const [substanceAbuse, setSubstanceAbuse] = useState(["Alcohol"])
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)

  function InputList({
    label,
    values,
    setValues,
    disabled
  }: {
    label: string,
    values: string[],
    setValues: (v: string[]) => void,
    disabled: boolean
  }) {

  const updateValue = (index: number, v: string) => {
      const newValues = [...values]
      newValues[index] = v
      setValues(newValues)
    }

    const addNew = () => {
      setValues([...values, ""])
    }

    const removeItem = (index: number) => {
      const newValues = values.filter((_, i) => i !== index)
      setValues(newValues)
    }

    return (
      <div className="space-y-2">
        <Label>{label}</Label>

        <div className="space-y-2">
          {values.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={v}
                disabled={disabled}
                onChange={(e) => updateValue(i, e.target.value)}
                className="flex-1"
              />

              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="p-2 rounded-md hover:bg-red-100 text-red-600 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 flex items-center gap-2"
            onClick={addNew}
          >
            + Add
          </Button>
        )}
      </div>
    )
  }


  if (loading) {
    return (
      <PatientLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600 mx-auto mb-4" />
            <p className="text-slate-600">Loading health information...</p>
          </div>
        </div>
      </PatientLayout>
    )
  }

  return (
    <PatientLayout>
      <div className="space-y-6">
        {/* Data table */}
        <Card className="flex flex-col h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <History className="h-5 w-5" />
              Health Information History
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Click on any row to load that record into the form below
            </p>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <div className="h-full overflow-auto">
              <Table>
                <TableHeader 
                  className="sticky top-0 z-10 bg-gray-50 border-b" style={{
                  background:
                    "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                  }}>
                  <TableRow>
                    <TableHead className="w-12 text-center text-white">No.</TableHead>
                    <TableHead className="w-40 text-white">Updated Time</TableHead>
                    <TableHead className="w-24 text-center text-white">Height</TableHead>
                    <TableHead className="w-24 text-center text-white">Weight</TableHead>
                    <TableHead className="w-20 text-center text-white">BMI</TableHead>
                    <TableHead className="w-32 text-center text-white">BP</TableHead>
                    <TableHead className="w-24 text-center text-white">HR</TableHead>
                    <TableHead className="w-28 text-center text-white">Resp.</TableHead>
                    <TableHead className="w-28 text-center text-white">Temp</TableHead>
                    <TableHead className="w-24 text-center text-white">SpO2</TableHead>
                    <TableHead className="text-white">Symptoms</TableHead>
                    <TableHead className="w-28  text-white">By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((r, i) => (
                    <TableRow
                      key={r.id}
                      onClick={() => loadRecordToForm(r)}
                      className={`cursor-pointer transition-all h-14 hover:bg-cyan-50 hover:border-l-4 hover:border-l-cyan-500 ${
                        selectedRecord?.id === r.id ? "bg-cyan-50 border-l-4 border-l-cyan-600" : ""
                      }`}
                    >
                      <TableCell className="text-center font-medium">
                        {(currentPage - 1) * pageSize + i + 1}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.updatedAt.toLocaleDateString("vi-VN")}
                        <br />
                        <span className="text-muted-foreground text-xs">
                          {r.updatedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">{r.height}</TableCell>
                      <TableCell className="text-center">{r.weight}</TableCell>
                      <TableCell className="text-center font-semibold">{r.bmi.toFixed(1)}</TableCell>
                      <TableCell className="text-center">{r.bloodPressure}</TableCell>
                      <TableCell className="text-center">{r.heartRate}</TableCell>
                      <TableCell className="text-center">{r.respiratoryRate}</TableCell>
                      <TableCell className="text-center">{r.temperature.toFixed(1)}°C</TableCell>
                      <TableCell className="text-center">
                        <span className={r.spo2 >= 95 ? "text-green-600" : "text-red-600"}>
                          {r.spo2}%
                        </span>
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate" title={r.symptoms}>
                        {r.symptoms || "-"}
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 text-xs rounded-full bg-cyan-100 text-cyan-800">
                          {r.updatedBy}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginated.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-12 text-gray-500">
                        No records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t text-sm">
                <div className="flex items-center gap-3">
                  <span>Show</span>
                  <Select value={pageSize.toString()} onValueChange={v => { setPageSize(Number(v)); setCurrentPage(1) }}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>entries</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  {Array.from({ length: pageCount }, (_, i) => (
                    <Button
                      key={i + 1}
                      variant={currentPage === i + 1 ? "default" : "outline"}
                      size="sm"
                      className={currentPage === i + 1 ? "bg-[#06b6d4]" : ""}
                      onClick={() => setCurrentPage(i + 1)}
                    >
                      {i + 1}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" disabled={currentPage === pageCount}
                    onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}>
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>



        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Health Information</h2>
            <p className="text-muted-foreground">Update your health data before your visit</p>
          </div>
          <Button onClick={() => isEditing ? handleSave() : setIsEditing(true)} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            ) : (
              "Edit Information"
            )}
          </Button>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <Alert className="bg-green-50 border-green-200 text-green-800">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Alert */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Keeping your health information up-to-date helps doctors provide better care and reduces wait time at the hospital.
          </AlertDescription>
        </Alert>

        {/* ------------------- VITAL SIGNS ------------------- */}
        <CollapsibleSection
          title="Vital Signs"
          icon={<Activity className="h-5 w-5" />}
          description="Your current vital measurements"
          defaultOpen={true}
        >
          <div className="grid gap-4 md:grid-cols-2">

            {/* Blood Pressure */}
            <div className="space-y-2">
              <Label>Blood Pressure (mmHg)</Label>
              <div className="flex gap-2 text-sm font-normal bg-background text-muted-foreground">
                <Input
                  placeholder="118"
                  value={bpSys}
                  onChange={(e) => setBpSys(e.target.value)}
                  disabled={!isEditing}
                />

                <Input
                  placeholder="76"
                  value={bpDia}
                  onChange={(e) => setBpDia(e.target.value)}
                  disabled={!isEditing}
                />
              </div>
            </div>

            {/* Blood Oxygen */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="oxygen">Blood Oxygen (SpO2 %)</Label>
              <Input
                id="oxygen"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                disabled={!isEditing}
              />
            </div>

            {/* Temperature */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="temperature">Body Temperature (°C)</Label>
              <Input
                id="temperature"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={!isEditing}
              />
            </div>

            {/* Height */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="height">Height (cm)</Label>
              <Input 
                id="height" 
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                disabled={!isEditing}
                type="number" />
            </div>

            {/* Respiratory Rate */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="respiratory">Respiratory Rate (breaths/min)</Label>
              <Input
                id="respiratory"
                value={respiratoryRate}
                onChange={(e) => setRespiratoryRate(e.target.value)}
                disabled={!isEditing}
              />
            </div>

            {/* Weight */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input id="weight" 
                value={weight}
                disabled={!isEditing}
                onChange={(e) => setWeight(e.target.value)}
                type="number" />
            </div>

            {/* Heart Rate */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="heart-rate">Heart Rate (bpm)</Label>
              <Input
                id="heart-rate"
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
                disabled={!isEditing}
              />
            </div>

            {/* BMI */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="bmi">BMI</Label>
              <Input id="bmi" value={bmi} disabled />
            </div>

            {/* Blood Type */}
            <div className="space-y-2 ">
              <Label>Blood Type</Label>
              <Select value={bloodType} onValueChange={setBloodType} disabled={!isEditing}>
                <SelectTrigger>
                <div className="text-sm font-normal bg-background text-muted-foreground">
                    <SelectValue placeholder="Select blood type" />
                </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A+">A+</SelectItem>
                  <SelectItem value="A-">A-</SelectItem>
                  <SelectItem value="B+">B+</SelectItem>
                  <SelectItem value="B-">B-</SelectItem>
                  <SelectItem value="O+">O+</SelectItem>
                  <SelectItem value="O-">O-</SelectItem>
                  <SelectItem value="AB+">AB+</SelectItem>
                  <SelectItem value="AB-">AB-</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
        </CollapsibleSection>

        {/* ------------------- ALLERGIC INFORMATION ------------------- */}
        <CollapsibleSection
          title="Allergic Information"
          icon={<AlertCircle className="h-5 w-5" />}
          description="List any known allergies"
          defaultOpen={true}
        >
          <div className="space-y-4 text-sm font-normal bg-background text-muted-foreground">

            <InputList
              label="Drug Allergies"
              values={drugAllergies}
              setValues={setDrugAllergies}
              disabled={!isEditing}
            />

            <InputList
              label="Food Allergies"
              values={foodAllergies}
              setValues={setFoodAllergies}
              disabled={!isEditing}
            />

            <InputList
              label="Other Allergies"
              values={otherAllergies}
              setValues={setOtherAllergies}
              disabled={!isEditing}
            />

          </div>
        </CollapsibleSection>


        {/* ------------------- CURRENT SYMPTOMS ------------------- */}
        <CollapsibleSection
          title="Current Symptoms"
          icon={<Heart className="h-5 w-5" />}
          description="Record your current symptoms"
          defaultOpen={true}
        >
          <div className="space-y-2">
            <Label>Symptoms</Label>
            <Textarea
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              disabled={!isEditing}
              rows={4}
              placeholder="Describe any current symptoms you are experiencing..."
            />
          </div>
        </CollapsibleSection>

        {/* ------------------- MEDICAL HISTORY ------------------- */}
        <CollapsibleSection
          title="Medical History"
          icon={<FileText className="h-5 w-5" />}
          description="Your past medical conditions and treatments"
          defaultOpen={true}
        >
          <div className="space-y-4 text-sm font-normal bg-background text-muted-foreground">

            <InputList
              label="Chronic Conditions"
              values={chronicConditions}
              setValues={setChronicConditions}
              disabled={!isEditing}
            />

            <InputList
              label="Past Surgeries"
              values={pastSurgeries}
              setValues={setPastSurgeries}
              disabled={!isEditing}
            />

            <InputList
              label="Family Medical History"
              values={familyHistory}
              setValues={setFamilyHistory}
              disabled={!isEditing}
            />

            <InputList
              label="Previous Illnesses"
              values={pastIllnesses}
              setValues={setPastIllnesses}
              disabled={!isEditing}
            />

            <InputList
              label="Vaccinations"
              values={vaccinations}
              setValues={setVaccinations}
              disabled={!isEditing}
            />

            <InputList
              label="Substance Abuse"
              values={substanceAbuse}
              setValues={setSubstanceAbuse}
              disabled={!isEditing}
            />

          </div>
        </CollapsibleSection>

      </div>
    </PatientLayout>
  )
<<<<<<< HEAD
}
<<<<<<< HEAD
=======

// const calculateBMI = (weightStr: string, heightStr: string): number | null => {
//   // Chuyển chuỗi thành số. Nếu chuỗi rỗng hoặc không hợp lệ, trả về 0.
//   const weightKg = parseFloat(weightStr);
//   const heightCm = parseFloat(heightStr);
  
//   if (isNaN(weightKg) || isNaN(heightCm) || weightKg <= 0 || heightCm <= 0) return null;
  
//   const heightMeters = heightCm / 100;
//   return weightKg / (heightMeters * heightMeters);
// }
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
}
>>>>>>> eca8cbaa (add some page in doctor portal)
