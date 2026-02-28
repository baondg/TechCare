"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Activity, Heart, AlertCircle, FileText, History, X, Loader2, Trash2, Save } from "lucide-react"
import { CollapsibleSection } from "@/components/collapsible-section"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { doctorService, type HealthInfo } from "@/services/doctor-service"

export default function ViewingPatientHealthInfo() {
  const { patientId } = useParams()
  const pid = Number(patientId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  // History list
  const [healthHistory, setHealthHistory] = useState<HealthInfo[]>([])
  const [selectedRecord, setSelectedRecord] = useState<HealthInfo | null>(null)

  // Form state
  const [isEditing, setIsEditing] = useState(false)
  const [height, setHeight] = useState("")
  const [weight, setWeight] = useState("")
  const [bpSys, setBpSys] = useState("")
  const [bpDia, setBpDia] = useState("")
  const [heartRate, setHeartRate] = useState("")
  const [respiratoryRate, setRespiratoryRate] = useState("")
  const [temperature, setTemperature] = useState("")
  const [spo2, setSpo2] = useState("")
  const [bloodType, setBloodType] = useState("")
  const [symptoms, setSymptoms] = useState("")

  const [drugAllergies, setDrugAllergies] = useState<string[]>([])
  const [foodAllergies, setFoodAllergies] = useState<string[]>([])
  const [otherAllergies, setOtherAllergies] = useState<string[]>([])
  const [chronicConditions, setChronicConditions] = useState<string[]>([])
  const [pastSurgeries, setPastSurgeries] = useState<string[]>([])
  const [familyHistory, setFamilyHistory] = useState<string[]>([])
  const [pastIllnesses, setPastIllnesses] = useState<string[]>([])
  const [vaccinations, setVaccinations] = useState<string[]>([])
  const [substanceAbuse, setSubstanceAbuse] = useState<string[]>([])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const bmi = useMemo(() => {
    const h = parseFloat(height)
    const w = parseFloat(weight)
    if (!h || !w || h <= 0) return "N/A"
    return (w / ((h / 100) ** 2)).toFixed(1)
  }, [height, weight])

  // Load data
  useEffect(() => {
    if (pid) loadData()
  }, [pid])

  const loadData = async () => {
    try {
      setLoading(true)
      setError("")

      const [infoRes, historyRes] = await Promise.all([
        doctorService.getHealthInfo(pid),
        doctorService.getHealthInfoHistory(pid, 1, 50),
      ])

      if (infoRes.healthInfo) {
        loadRecordToForm(infoRes.healthInfo)
        setSelectedRecord(infoRes.healthInfo)
      }

      setHealthHistory(historyRes.history || [])
    } catch (err: any) {
      setError(err.message || "Failed to load health info")
    } finally {
      setLoading(false)
    }
  }

  const loadRecordToForm = (record: HealthInfo) => {
    setHeight(record.height?.toString() || "")
    setWeight(record.weight?.toString() || "")
    setBpSys(record.bloodPressureSys?.toString() || "")
    setBpDia(record.bloodPressureDia?.toString() || "")
    setHeartRate(record.heartRate?.toString() || "")
    setRespiratoryRate(record.respiratoryRate?.toString() || "")
    setTemperature(record.temperature?.toString() || "")
    setSpo2(record.spo2?.toString() || "")
    setBloodType(record.bloodType || "")
    setSymptoms(record.currentSymptoms || "")
    setDrugAllergies(record.drugAllergies?.length ? record.drugAllergies : [])
    setFoodAllergies(record.foodAllergies?.length ? record.foodAllergies : [])
    setOtherAllergies(record.otherAllergies?.length ? record.otherAllergies : [])
    setChronicConditions(record.chronicConditions?.length ? record.chronicConditions : [])
    setPastSurgeries(record.pastSurgeries?.length ? record.pastSurgeries : [])
    setFamilyHistory(record.familyHistory?.length ? record.familyHistory : [])
    setPastIllnesses(record.pastIllnesses?.length ? record.pastIllnesses : [])
    setVaccinations(record.vaccinations?.length ? record.vaccinations : [])
    setSubstanceAbuse(record.substanceAbuse?.length ? record.substanceAbuse : [])
    setSelectedRecord(record)
  }

  const getFormData = (): Partial<HealthInfo> => ({
    height: height ? parseFloat(height) : null,
    weight: weight ? parseFloat(weight) : null,
    bmi: bmi !== "N/A" ? parseFloat(bmi) : null,
    bloodPressureSys: bpSys ? parseInt(bpSys) : null,
    bloodPressureDia: bpDia ? parseInt(bpDia) : null,
    heartRate: heartRate ? parseInt(heartRate) : null,
    respiratoryRate: respiratoryRate ? parseInt(respiratoryRate) : null,
    temperature: temperature ? parseFloat(temperature) : null,
    spo2: spo2 ? parseInt(spo2) : null,
    bloodType: bloodType || null,
    currentSymptoms: symptoms || null,
    drugAllergies: drugAllergies.filter(Boolean),
    foodAllergies: foodAllergies.filter(Boolean),
    otherAllergies: otherAllergies.filter(Boolean),
    chronicConditions: chronicConditions.filter(Boolean),
    pastSurgeries: pastSurgeries.filter(Boolean),
    familyHistory: familyHistory.filter(Boolean),
    pastIllnesses: pastIllnesses.filter(Boolean),
    vaccinations: vaccinations.filter(Boolean),
    substanceAbuse: substanceAbuse.filter(Boolean),
  })

  const handleSave = async () => {
    try {
      setSaving(true)
      setError("")
      setSuccessMsg("")

      const data = getFormData()

      if (selectedRecord?.id) {
        await doctorService.updateHealthInfo(pid, selectedRecord.id, data)
        setSuccessMsg("Health info updated successfully")
      } else {
        await doctorService.createHealthInfo(pid, data)
        setSuccessMsg("Health info created successfully")
      }

      setIsEditing(false)
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleCreateNew = async () => {
    try {
      setSaving(true)
      setError("")
      const data = getFormData()
      await doctorService.createHealthInfo(pid, data)
      setSuccessMsg("New health info record created")
      setIsEditing(false)
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedRecord?.id) return
    if (!confirm("Delete this health info record?")) return

    try {
      setError("")
      await doctorService.deleteHealthInfo(pid, selectedRecord.id)
      setSuccessMsg("Record deleted")
      setSelectedRecord(null)
      setIsEditing(false)
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to delete")
    }
  }

  const pageCount = Math.ceil(healthHistory.length / pageSize)
  const paginated = healthHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function InputList({ label, values, setValues, disabled }: {
    label: string; values: string[]; setValues: (v: string[]) => void; disabled: boolean
  }) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="space-y-2">
          {values.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={v} disabled={disabled} onChange={e => {
                const nv = [...values]; nv[i] = e.target.value; setValues(nv)
              }} className="flex-1" />
              {!disabled && (
                <button type="button" onClick={() => setValues(values.filter((_, idx) => idx !== i))}
                  className="p-2 rounded-md hover:bg-red-100 text-red-600 transition">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => setValues([...values, ""])}>
            + Add
          </Button>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading health info...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded">{error}</div>}
      {successMsg && <div className="bg-green-50 text-green-700 px-4 py-2 rounded">{successMsg}</div>}

      {/* Action bar */}
      <div className="flex gap-2 justify-end">
        {!isEditing ? (
          <>
            <Button onClick={() => setIsEditing(true)} className="btn-gradient">Edit</Button>
            <Button onClick={handleCreateNew} variant="outline">+ New Record</Button>
            {selectedRecord?.id && (
              <Button onClick={handleDelete} variant="outline" className="text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={handleSave} disabled={saving} className="btn-gradient">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
            <Button variant="outline" onClick={() => { setIsEditing(false); if (selectedRecord) loadRecordToForm(selectedRecord) }}>
              Cancel
            </Button>
          </>
        )}
      </div>

      {/* History table */}
      <Card className="flex flex-col h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <History className="h-5 w-5" /> Health Information History
          </CardTitle>
          <p className="text-sm text-muted-foreground">Click on any row to load that record</p>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-gray-50 border-b">
                <TableRow>
                  <TableHead className="w-12 text-center">No.</TableHead>
                  <TableHead className="w-40">Updated Time</TableHead>
                  <TableHead className="w-24 text-center">Height</TableHead>
                  <TableHead className="w-24 text-center">Weight</TableHead>
                  <TableHead className="w-20 text-center">BMI</TableHead>
                  <TableHead className="w-32 text-center">BP</TableHead>
                  <TableHead className="w-24 text-center">HR</TableHead>
                  <TableHead className="w-28 text-center">Resp.</TableHead>
                  <TableHead className="w-28 text-center">Temp</TableHead>
                  <TableHead className="w-24 text-center">SpO2</TableHead>
                  <TableHead>Symptoms</TableHead>
                  <TableHead className="w-28">By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((r, i) => (
                  <TableRow key={r.id} onClick={() => { loadRecordToForm(r); setIsEditing(false) }}
                    className={`cursor-pointer transition-all h-14 hover:bg-cyan-50 hover:border-l-4 hover:border-l-cyan-500 ${
                      selectedRecord?.id === r.id ? "bg-cyan-50 border-l-4 border-l-cyan-600" : ""
                    }`}>
                    <TableCell className="text-center font-medium">{(currentPage - 1) * pageSize + i + 1}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(r.updatedAt).toLocaleDateString("vi-VN")}
                      <br /><span className="text-muted-foreground text-xs">{new Date(r.updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </TableCell>
                    <TableCell className="text-center">{r.height ?? "-"}</TableCell>
                    <TableCell className="text-center">{r.weight ?? "-"}</TableCell>
                    <TableCell className="text-center font-semibold">{r.bmi?.toFixed(1) ?? "-"}</TableCell>
                    <TableCell className="text-center">{r.bloodPressureSys && r.bloodPressureDia ? `${r.bloodPressureSys}/${r.bloodPressureDia}` : "-"}</TableCell>
                    <TableCell className="text-center">{r.heartRate ?? "-"}</TableCell>
                    <TableCell className="text-center">{r.respiratoryRate ?? "-"}</TableCell>
                    <TableCell className="text-center">{r.temperature ? `${r.temperature.toFixed(1)}°C` : "-"}</TableCell>
                    <TableCell className="text-center">
                      {r.spo2 != null ? <span className={r.spo2 >= 95 ? "text-green-600" : "text-red-600"}>{r.spo2}%</span> : "-"}
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate" title={r.currentSymptoms || ""}>{r.currentSymptoms || "-"}</TableCell>
                    <TableCell>
                      <span className="px-2 py-1 text-xs rounded-full bg-cyan-100 text-cyan-800">{r.updatedBy || "System"}</span>
                    </TableCell>
                  </TableRow>
                ))}
                {paginated.length === 0 && (
                  <TableRow><TableCell colSpan={12} className="text-center py-12 text-gray-500">No records found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>

            {pageCount > 1 && (
              <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t text-sm">
                <div className="flex items-center gap-3">
                  <span>Show</span>
                  <Select value={pageSize.toString()} onValueChange={v => { setPageSize(Number(v)); setCurrentPage(1) }}>
                    <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>entries</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Previous</Button>
                  {Array.from({ length: pageCount }, (_, i) => (
                    <Button key={i + 1} variant={currentPage === i + 1 ? "default" : "outline"} size="sm"
                      className={currentPage === i + 1 ? "bg-[#06b6d4]" : ""} onClick={() => setCurrentPage(i + 1)}>{i + 1}</Button>
                  ))}
                  <Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}>Next</Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vital Signs */}
      <CollapsibleSection title="Vital Signs" icon={<Activity className="h-5 w-5" />} description="Current vital measurements" defaultOpen={true}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Blood Pressure (mmHg)</Label>
            <div className="flex gap-2">
              <Input placeholder="Sys" value={bpSys} onChange={e => setBpSys(e.target.value)} disabled={!isEditing} />
              <Input placeholder="Dia" value={bpDia} onChange={e => setBpDia(e.target.value)} disabled={!isEditing} />
            </div>
          </div>
          <div className="space-y-2"><Label>Blood Oxygen (SpO2 %)</Label><Input value={spo2} onChange={e => setSpo2(e.target.value)} disabled={!isEditing} /></div>
          <div className="space-y-2"><Label>Body Temperature (°C)</Label><Input value={temperature} onChange={e => setTemperature(e.target.value)} disabled={!isEditing} /></div>
          <div className="space-y-2"><Label>Height (cm)</Label><Input value={height} onChange={e => setHeight(e.target.value)} disabled={!isEditing} type="number" /></div>
          <div className="space-y-2"><Label>Respiratory Rate (breaths/min)</Label><Input value={respiratoryRate} onChange={e => setRespiratoryRate(e.target.value)} disabled={!isEditing} /></div>
          <div className="space-y-2"><Label>Weight (kg)</Label><Input value={weight} onChange={e => setWeight(e.target.value)} disabled={!isEditing} type="number" /></div>
          <div className="space-y-2"><Label>Heart Rate (bpm)</Label><Input value={heartRate} onChange={e => setHeartRate(e.target.value)} disabled={!isEditing} /></div>
          <div className="space-y-2"><Label>BMI</Label><Input value={bmi} disabled /></div>
          <div className="space-y-2">
            <Label>Blood Type</Label>
            <Select value={bloodType} onValueChange={setBloodType} disabled={!isEditing}>
              <SelectTrigger><SelectValue placeholder="Select blood type" /></SelectTrigger>
              <SelectContent>
                {["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CollapsibleSection>

      {/* Allergies */}
      <CollapsibleSection title="Allergic Information" icon={<AlertCircle className="h-5 w-5" />} description="List any known allergies" defaultOpen={true}>
        <div className="space-y-4">
          <InputList label="Drug Allergies" values={drugAllergies} setValues={setDrugAllergies} disabled={!isEditing} />
          <InputList label="Food Allergies" values={foodAllergies} setValues={setFoodAllergies} disabled={!isEditing} />
          <InputList label="Other Allergies" values={otherAllergies} setValues={setOtherAllergies} disabled={!isEditing} />
        </div>
      </CollapsibleSection>

      {/* Current Symptoms */}
      <CollapsibleSection title="Current Symptoms" icon={<Heart className="h-5 w-5" />} description="Describe any symptoms" defaultOpen={true}>
        <div className="space-y-2">
          <Label>Symptoms</Label>
          <Textarea value={symptoms} onChange={e => setSymptoms(e.target.value)} disabled={!isEditing} rows={3} />
        </div>
      </CollapsibleSection>

      {/* Medical History */}
      <CollapsibleSection title="Medical History" icon={<FileText className="h-5 w-5" />} description="Past medical conditions and treatments" defaultOpen={true}>
        <div className="space-y-4">
          <InputList label="Chronic Conditions" values={chronicConditions} setValues={setChronicConditions} disabled={!isEditing} />
          <InputList label="Past Surgeries" values={pastSurgeries} setValues={setPastSurgeries} disabled={!isEditing} />
          <InputList label="Family Medical History" values={familyHistory} setValues={setFamilyHistory} disabled={!isEditing} />
          <InputList label="Previous Illnesses" values={pastIllnesses} setValues={setPastIllnesses} disabled={!isEditing} />
          <InputList label="Vaccinations" values={vaccinations} setValues={setVaccinations} disabled={!isEditing} />
          <InputList label="Substance Abuse" values={substanceAbuse} setValues={setSubstanceAbuse} disabled={!isEditing} />
        </div>
      </CollapsibleSection>
    </div>
  )
}
