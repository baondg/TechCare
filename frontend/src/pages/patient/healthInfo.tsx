"use client"

import { useState, useMemo, useEffect, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PatientLayout } from "@/components/patient-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Activity, Heart, AlertCircle, FileText, Save, History, X, Loader2, Stethoscope, Plus, Edit, Search, Copy } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CollapsibleSection } from "@/components/collapsible-section"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { healthInfoService } from "@/services/health-info-service"
import type { HealthInfo } from "@/services/health-info-service"
import { useAuth } from "@/contexts/AuthContext"
import { usePauseableToast, type PauseableToastEntry } from "@/hooks/usePauseableToast"
import { cn } from "@/lib/utils"
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ReferenceLine, ReferenceArea } from "recharts"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function HealthInfoPage() {
  const { user } = useAuth()
  const { toast, isExiting, showSuccess, showError, dismiss, onMouseEnter, onMouseLeave } = usePauseableToast()

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

  const [isEditing, setIsEditing] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [height, setHeight] = useState("")
  const [weight, setWeight] = useState("")
  const [bpSys, setBpSys] = useState("")
  const [bpDia, setBpDia] = useState("")
  const [heartRate, setHeartRate] = useState("")
  const [respiratoryRate, setRespiratoryRate] = useState("")
  const [temperature, setTemperature] = useState("")
  const [spo2, setSpo2] = useState("")
  const [bloodType, setBloodType] = useState("O")
  const [symptoms, setSymptoms] = useState("")

  // for filters
  const [filters, setFilters] = useState({
    date: "",
    height: "",
    weight: "",
    bmi: "",
    bloodPressure: "",
    heartRate: "",
    respiratoryRate: "",
    temperature: "",
    spo2: "",
    symptoms: "",
    status: ""
  })


  // Current health info ID for updates
  const [currentHealthInfoId, setCurrentHealthInfoId] = useState<number | null>(null)

  const bmi = useMemo(() => {
    const h = parseFloat(height)
    const w = parseFloat(weight)
    if (!h || !w || h <= 0) return "N/A"
    return (w / ((h / 100) ** 2)).toFixed(1)
  }, [height, weight])

  const [healthHistory, setHealthHistory] = useState<HealthRecord[]>([])
  
  const filteredHistory = healthHistory.filter(r => {
    const status = r.updatedBy === "Patient" ? "Draft" : "Confirmed"
    return (
      (!filters.date || r.updatedAt.toLocaleDateString("vi-VN").includes(filters.date)) &&
      (!filters.height || r.height.toString().includes(filters.height)) &&
      (!filters.weight || r.weight.toString().includes(filters.weight)) &&
      (!filters.bmi || r.bmi.toFixed(1).includes(filters.bmi)) &&
      (!filters.bloodPressure || r.bloodPressure.includes(filters.bloodPressure)) &&
      (!filters.heartRate || r.heartRate.toString().includes(filters.heartRate)) &&
      (!filters.respiratoryRate || r.respiratoryRate.toString().includes(filters.respiratoryRate)) &&
      (!filters.temperature || r.temperature.toString().includes(filters.temperature)) &&
      (!filters.spo2 || r.spo2.toString().includes(filters.spo2)) &&
      (!filters.symptoms || r.symptoms.toLowerCase().includes(filters.symptoms.toLowerCase())) &&
      (filters.status === "All" || !filters.status || status === filters.status)
    )
  })

  const [historyPagination, setHistoryPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 })

  const [selectedRecord, setSelectedRecord] = useState<HealthRecord | null>(null)
  const [inlineEditingId, setInlineEditingId] = useState<number | null>(null)
  const [inlineEditDraft, setInlineEditDraft] = useState<{
    height: string
    weight: string
    bloodPressure: string
    heartRate: string
    respiratoryRate: string
    temperature: string
    spo2: string
    symptoms: string
  } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const toArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
    if (typeof value === "string" && value.trim()) return [value]
    return []
  }

  const pageCount = Math.ceil(filteredHistory.length / pageSize)

  const paginated = filteredHistory.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const sortedData = [...healthHistory].sort(
    (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()
  )

  //Thêm state để lưu các record được chọn:
  const [selectedRecords, setSelectedRecords] = useState<HealthRecord[]>([])

  const chartData = useMemo(() => {
    const source = selectedRecords.length > 0
      ? selectedRecords
      : healthHistory

    return [...source]
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((r) => {
        const [sys, dia] = r.bloodPressure.split("/").map(Number)
        return {
          time: r.updatedAt.toLocaleString("vi-VN"),
          heartRate: r.heartRate,
          respiratoryRate: r.respiratoryRate,
          spo2: r.spo2,
          systolic: sys,
          diastolic: dia,
          bmi: r.bmi,
          weight: r.weight,
          height: r.height,
        }
      })
  }, [selectedRecords, healthHistory])

  const handleSelectRecord = (record: HealthRecord, isChecked: boolean) => {
    if (isChecked) {
      setSelectedRecords(prev => [...prev, record])
    } else {
      setSelectedRecords(prev => prev.filter(r => r.id !== record.id))
    }
  }

  const handleDeleteRecords = async () => {
    if (!selectedRecords.length) return

    // Kiểm tra có record nào confirmed không
    const confirmedRecords = selectedRecords.filter(r => r.updatedBy !== "Patient")
    if (confirmedRecords.length > 0) {
      showError("Cannot delete confirmed record(s). Please select only draft records.")
      return
    }

    if (!confirm(`Are you sure you want to delete ${selectedRecords.length} record(s)?`)) return

    setLoading(true)
    try {
      const ids = selectedRecords.map(r => r.id)
      const result = await healthInfoService.deleteHealthRecords(ids)
      if (result.success) {
        setHealthHistory(prev => prev.filter(r => !ids.includes(r.id)))
        setSelectedRecords([])
        showSuccess(`${ids.length} record(s) deleted successfully.`)
      } else {
        showError(result.error || "Failed to delete records")
      }
    } catch (err: any) {
      showError(err.message || "Failed to delete records")
    } finally {
      setLoading(false)
    }
  }

  const handleCopyRecord = () => {
    if (!selectedRecord) return

    const record = selectedRecord

    // load dữ liệu
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

    // 🔥 QUAN TRỌNG
    setCurrentHealthInfoId(null) // để create mới
    setSelectedRecord(null) // tránh hiểu nhầm là edit record cũ

    setIsEditing(true)
    setIsAdding(true)
  }

  const startInlineEdit = () => {
    if (!selectedRecord) return
    setInlineEditingId(selectedRecord.id)
    setInlineEditDraft({
      height: String(selectedRecord.height),
      weight: String(selectedRecord.weight),
      bloodPressure: selectedRecord.bloodPressure,
      heartRate: String(selectedRecord.heartRate),
      respiratoryRate: String(selectedRecord.respiratoryRate),
      temperature: String(selectedRecord.temperature),
      spo2: String(selectedRecord.spo2),
      symptoms: selectedRecord.symptoms || "",
    })
  }

  const cancelInlineEdit = () => {
    setInlineEditingId(null)
    setInlineEditDraft(null)
    setIsEditing(false)
  }


  // Load health info on mount
  useEffect(() => {
    loadHealthInfo()
    loadHealthHistory()
  }, [user])

  const loadHealthInfo = async () => {
    if (!user?.id) return
    
    setLoading(true)
    dismiss()

    try {
      const result = await healthInfoService.getHealthInfo()
      if (result.success && result.healthInfo) {
        const info = result.healthInfo as any
        const allergicInfo = info.allergic_info || info.allergicInfo || {}
        const medicalHistory = info.medical_history || info.medicalHistory || {}

        setCurrentHealthInfoId(info.id)
        setHeight(info.height?.toString() || "")
        setWeight(info.weight?.toString() || "")
        setBpSys(info.bloodPressureSys?.toString() || "")
        setBpDia(info.bloodPressureDia?.toString() || "")
        setHeartRate(info.heartRate?.toString() || "")
        setRespiratoryRate(info.respiratoryRate?.toString() || "")
        setTemperature(info.temperature?.toString() || "")
        setSpo2(info.spo2?.toString() || "")
        setBloodType(info.bloodType || "O")
        setSymptoms(info.currentSymptoms || "")
        
        // Set allergies (supports both flat fields and allergic_info object)
        setDrugAllergies(toArray(info.drugAllergies ?? allergicInfo.drugAllergies))
        setFoodAllergies(toArray(info.foodAllergies ?? allergicInfo.foodAllergies))
        setOtherAllergies(toArray(info.otherAllergies ?? allergicInfo.otherAllergies))
        
        // Set medical history (supports both flat fields and medical_history object)
        setChronicConditions(toArray(info.chronicConditions ?? medicalHistory.chronicConditions))
        setPastSurgeries(toArray(info.pastSurgeries ?? medicalHistory.pastSurgeries))
        setFamilyHistory(toArray(info.familyHistory ?? medicalHistory.familyHistory))
        setPastIllnesses(toArray(info.pastIllnesses ?? medicalHistory.pastIllnesses))
        setVaccinations(toArray(info.vaccinations ?? medicalHistory.vaccinations))
        setSubstanceAbuse(toArray(info.substanceAbuse ?? medicalHistory.substanceAbuse))
      } else {
        showError(result.error || "Failed to load health information")
      }
    } catch (err) {
      console.error("Failed to load health info:", err)
      showError("Failed to load health information")
    } finally {
      setLoading(false)
    }
  }

  const loadHealthHistory = async () => {
    try {
      const result = await healthInfoService.getHealthHistory(1, 100)
      if (result.success && result.history) {
        const records: HealthRecord[] = result.history
          .map((h) => ({
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
          // 🔥 SORT MỚI NHẤT LÊN ĐẦU
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        setHealthHistory(records)
        if (result.pagination) {
          setHistoryPagination(result.pagination)
        }
      } else if (result.error) {
        showError(result.error)
      }
    } catch (err) {
      console.error("Failed to load health history:", err)
      showError("Failed to load health history")
    }
  }

  const clearForm = () => {
    setHeight("")
    setWeight("")
    setBpSys("")
    setBpDia("")
    setHeartRate("")
    setRespiratoryRate("")
    setTemperature("")
    setSpo2("")
    setBloodType("O")
    setSymptoms("")
    setDrugAllergies([])
    setFoodAllergies([])
    setOtherAllergies([])
    setChronicConditions([])
    setPastSurgeries([])
    setFamilyHistory([])
    setPastIllnesses([])
    setVaccinations([])
    setSubstanceAbuse([])
    setSelectedRecord(null)
    setCurrentHealthInfoId(null)
  }

  const handleSave = async () => {
    setSaving(true)
    dismiss()

    try {
      if (inlineEditingId && inlineEditDraft) {
        const [sysRaw, diaRaw] = inlineEditDraft.bloodPressure.split("/")
        const updateData = {
          height: inlineEditDraft.height ? parseFloat(inlineEditDraft.height) : undefined,
          weight: inlineEditDraft.weight ? parseFloat(inlineEditDraft.weight) : undefined,
          bloodPressureSys: sysRaw ? parseInt(sysRaw, 10) : undefined,
          bloodPressureDia: diaRaw ? parseInt(diaRaw, 10) : undefined,
          heartRate: inlineEditDraft.heartRate ? parseInt(inlineEditDraft.heartRate, 10) : undefined,
          respiratoryRate: inlineEditDraft.respiratoryRate ? parseInt(inlineEditDraft.respiratoryRate, 10) : undefined,
          temperature: inlineEditDraft.temperature ? parseFloat(inlineEditDraft.temperature) : undefined,
          spo2: inlineEditDraft.spo2 ? parseInt(inlineEditDraft.spo2, 10) : undefined,
          currentSymptoms: inlineEditDraft.symptoms,
          updatedBy: "Patient",
        }

        const result = await healthInfoService.updateHealthInfo(inlineEditingId, updateData as any)
        if (result.success) {
          showSuccess("Health record updated successfully!")
          cancelInlineEdit()
          await loadHealthHistory()
        } else {
          showError(result.error || "Failed to update health record")
        }
        return
      }

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
      if (isAdding || !currentHealthInfoId) {
        result = await healthInfoService.createHealthInfo(healthData)
      } else {
        result = await healthInfoService.updateHealthInfo(currentHealthInfoId, healthData)
      }

      if (result.success) {
        showSuccess("Health information saved successfully!")

        // 🔥 reset state đúng
        setIsEditing(false)
        setIsAdding(false)
        setSelectedRecord(null)
        setCurrentHealthInfoId(null)

        loadHealthHistory()
      } else {
        showError(result.error || "Failed to save health information")
      }
    } catch (err: any) {
      showError(err.message || "Failed to save health information")
    } finally {
      setSaving(false)
    }
  }

  const loadRecordToForm = (record: HealthRecord) => {
    if (inlineEditingId) return
    // If user is currently editing/adding and selects another row,
    setSelectedRecords([])

    // reset action buttons to default state.
    if (isEditing) {
      setIsEditing(false)
    }

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
    setCurrentHealthInfoId(record.id)
  }

  const [drugAllergies, setDrugAllergies] = useState<string[]>([])
  const [foodAllergies, setFoodAllergies] = useState<string[]>([])
  const [otherAllergies, setOtherAllergies] = useState<string[]>([])

  const [chronicConditions, setChronicConditions] = useState<string[]>([])
  const [pastSurgeries, setPastSurgeries] = useState<string[]>([])
  const [familyHistory, setFamilyHistory] = useState<string[]>([])
  const [pastIllnesses, setPastIllnesses] = useState<string[]>([])
  const [vaccinations, setVaccinations] = useState<string[]>([])
  const [substanceAbuse, setSubstanceAbuse] = useState<string[]>([])

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

  /* Portal to document.body: main uses z-10 vs sidebar z-40, so fixed toasts inside main stay under the sidebar. */
  const pauseableToast =
    toast &&
    typeof document !== "undefined" &&
    createPortal(
      <HealthInfoToast
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />,
      document.body
    )

  if (loading) {
    return (
      <PatientLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600 mx-auto mb-4" />
            <p className="text-slate-600">Loading health information...</p>
          </div>
        </div>
        {pauseableToast}
      </PatientLayout>
    )
  }

  return (
    <PatientLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <History className="h-5 w-5" />
              Health Information History
            </h3>
            <p className="text-sm text-muted-foreground">
              Click on any row to load that record into the form below
            </p>
          </div>
          <Button
            className="text-red-600 flex items-center gap-2"
            disabled={selectedRecords.length === 0 || !!inlineEditingId}
            onClick={handleDeleteRecords}
          >
            <X className="h-4 w-4" />
            Delete
          </Button>
        </div>

        <Tabs defaultValue="records" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="records">Health Records</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="mt-4">
            {/* Data table */}
            <Card className="flex flex-col h-fit">
              <CardContent className="flex-1 p-0 overflow-hidden">
                <div className="h-full overflow-auto">
                  <Table>
                <TableHeader
                    className="sticky top-0 z-20 text-white"
                    style={{
                      background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
                    }}
                  >
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
                    <TableHead className="w-28 text-white">Status</TableHead>
                    <TableHead className="w-12 text-center text-white">Select</TableHead>
                  </TableRow>
                  <TableRow className="border-b hover:bg-white transition-colors">
                    <TableHead /> {/* No */}
                    {/* Date */}
                    <TableHead>
                      
                      <Input
                        className="h-8 text-xs"
                        value={filters.date}
                        onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                      />
                    </TableHead>

                    {/* Height */}
                    <TableHead>
                      <div className="relative">
                        <Input
                          className="h-8 text-xs text-center pr-8"
                          value={filters.height}
                          onChange={(e) => setFilters({ ...filters, height: e.target.value })}
                        />
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      </div>
                    </TableHead>
                    {/* Weight */}
                    <TableHead>
                      <div className="relative">
                        <Input
                          className="h-8 text-xs text-center pr-8"
                          value={filters.weight}
                          onChange={(e) => setFilters({ ...filters, weight: e.target.value })}
                        />
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      </div>
                    </TableHead>

                    {/* BMI */}
                    <TableHead>
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          className="h-8 text-xs text-center"
                          value={filters.bmi}
                          onChange={(e) => setFilters({ ...filters, bmi: e.target.value })}
                        />
                      </div>
                    </TableHead>

                    {/* BP */}
                    <TableHead>
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          className="h-8 text-xs text-center"
                          value={filters.bloodPressure}
                          onChange={(e) => setFilters({ ...filters, bloodPressure: e.target.value })}
                        />
                      </div>
                    </TableHead>

                    {/* HR */}
                    <TableHead>
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          className="h-8 text-xs text-center"
                          value={filters.heartRate}
                          onChange={(e) => setFilters({ ...filters, heartRate: e.target.value })}
                        />
                      </div>
                    </TableHead>

                    {/* Respiratory */}
                    <TableHead>
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          className="h-8 text-xs text-center"
                          value={filters.respiratoryRate}
                          onChange={(e) => setFilters({ ...filters, respiratoryRate: e.target.value })}
                        />
                      </div>
                    </TableHead>

                    {/* Temp */}
                    <TableHead>
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          className="h-8 text-xs text-center"
                          value={filters.temperature}
                          onChange={(e) => setFilters({ ...filters, temperature: e.target.value })}
                        />
                      </div>
                    </TableHead>

                    {/* SpO2 */}
                    <TableHead>
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          className="h-8 text-xs text-center"
                          value={filters.spo2}
                          onChange={(e) => setFilters({ ...filters, spo2: e.target.value })}
                        />
                      </div>
                    </TableHead>

                    {/* Symptoms */}
                    <TableHead>
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          className="h-8 text-xs"
                          value={filters.symptoms}
                          onChange={(e) => setFilters({ ...filters, symptoms: e.target.value })}
                        />
                      </div>
                    </TableHead>

                    {/* Status */}
                    <TableHead>
                      <Select
                        value={filters.status}
                        onValueChange={(value) =>
                          setFilters({ ...filters, status: value })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs w-full">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectItem value="All">All</SelectItem>
                          <SelectItem value="Draft">Draft</SelectItem>
                          <SelectItem value="Confirmed">Confirmed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableHead>

                    <TableHead className="text-center w-12">
                      <input
                        type="checkbox"
                        checked={
                          selectedRecords.length > 0 &&
                          selectedRecords.length === paginated.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRecords(paginated) // chọn tất cả dòng đang hiển thị
                          } else {
                            setSelectedRecords([]) // bỏ chọn hết
                          }
                        }}
                      />
                    </TableHead>
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
                      <TableCell className="text-center">
                        {inlineEditingId === r.id && inlineEditDraft ? (
                          <Input
                            className="h-8 text-center"
                            value={inlineEditDraft.height}
                            onChange={(e) => setInlineEditDraft((prev) => prev ? { ...prev, height: e.target.value } : prev)}
                          />
                        ) : r.height}
                      </TableCell>
                      <TableCell className="text-center">
                        {inlineEditingId === r.id && inlineEditDraft ? (
                          <Input
                            className="h-8 text-center"
                            value={inlineEditDraft.weight}
                            onChange={(e) => setInlineEditDraft((prev) => prev ? { ...prev, weight: e.target.value } : prev)}
                          />
                        ) : r.weight}
                      </TableCell>
                      <TableCell className="text-center font-semibold">
                        {inlineEditingId === r.id && inlineEditDraft
                          ? (() => {
                              const h = parseFloat(inlineEditDraft.height || "0")
                              const w = parseFloat(inlineEditDraft.weight || "0")
                              if (!h || !w) return "N/A"
                              return (w / ((h / 100) ** 2)).toFixed(1)
                            })()
                          : r.bmi.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center">
                        {inlineEditingId === r.id && inlineEditDraft ? (
                          <Input
                            className="h-8 text-center"
                            value={inlineEditDraft.bloodPressure}
                            onChange={(e) => setInlineEditDraft((prev) => prev ? { ...prev, bloodPressure: e.target.value } : prev)}
                          />
                        ) : r.bloodPressure}
                      </TableCell>
                      <TableCell className="text-center">
                        {inlineEditingId === r.id && inlineEditDraft ? (
                          <Input
                            className="h-8 text-center"
                            value={inlineEditDraft.heartRate}
                            onChange={(e) => setInlineEditDraft((prev) => prev ? { ...prev, heartRate: e.target.value } : prev)}
                          />
                        ) : r.heartRate}
                      </TableCell>
                      <TableCell className="text-center">
                        {inlineEditingId === r.id && inlineEditDraft ? (
                          <Input
                            className="h-8 text-center"
                            value={inlineEditDraft.respiratoryRate}
                            onChange={(e) => setInlineEditDraft((prev) => prev ? { ...prev, respiratoryRate: e.target.value } : prev)}
                          />
                        ) : r.respiratoryRate}
                      </TableCell>
                      <TableCell className="text-center">
                        {inlineEditingId === r.id && inlineEditDraft ? (
                          <Input
                            className="h-8 text-center"
                            value={inlineEditDraft.temperature}
                            onChange={(e) => setInlineEditDraft((prev) => prev ? { ...prev, temperature: e.target.value } : prev)}
                          />
                        ) : `${r.temperature.toFixed(1)}°C`}
                      </TableCell>
                      <TableCell className="text-center">
                        {inlineEditingId === r.id && inlineEditDraft ? (
                          <Input
                            className="h-8 text-center"
                            value={inlineEditDraft.spo2}
                            onChange={(e) => setInlineEditDraft((prev) => prev ? { ...prev, spo2: e.target.value } : prev)}
                          />
                        ) : (
                          <span className={r.spo2 >= 95 ? "text-green-600" : "text-red-600"}>
                            {r.spo2}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate" title={r.symptoms}>
                        {inlineEditingId === r.id && inlineEditDraft ? (
                          <Input
                            className="h-8"
                            value={inlineEditDraft.symptoms}
                            onChange={(e) => setInlineEditDraft((prev) => prev ? { ...prev, symptoms: e.target.value } : prev)}
                          />
                        ) : (r.symptoms || "-")}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          r.updatedBy === "Patient"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-800"
                        }`}>
                          {r.updatedBy === "Patient" ? "Draft" : "Confirmed"}
                        </span>
                      </TableCell>
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={selectedRecords.some(row => row.id === r.id)}
                            disabled={inlineEditingId === r.id}
                            onChange={(e) => handleSelectRecord(r, e.target.checked)}
                            onClick={(e) => e.stopPropagation()} // ngăn không cho sự kiện click row bị kích hoạt
                          />
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
                      <Button className="btn-outline" size="sm" disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                        Previous
                      </Button>
                      {Array.from({ length: pageCount }, (_, i) => (
                        <Button
                          key={i + 1}
                          className={currentPage === i + 1 ? "btn-gradient" : "btn-outline"}
                          size="sm"
                          onClick={() => setCurrentPage(i + 1)}
                        >
                          {i + 1}
                        </Button>
                      ))}
                      <Button className="btn-outline" size="sm" disabled={currentPage === pageCount}
                        onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}>
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="charts" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  Health Trends {selectedRecords.length > 0 && `(Selected ${selectedRecords.length} records)`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-10">
                {/* ----------------- BLOOD PRESSURE ----------------- */}
                <div className="h-[350px] w-full">
                  <h3 className="font-semibold mb-2">Blood Pressure Trend (Systolic & Diastolic)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="time" />
                      <YAxis domain={[60,160]} />
                      <Tooltip content={<CustomBPTooltip />} />
                      <Legend />
                      <Line type="monotone" dataKey="systolic" stroke="#ef4444" name="Systolic BP"/>
                      <Line type="monotone" dataKey="diastolic" stroke="#3b82f6" name="Diastolic BP"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* ----------------- SPO2 ----------------- */}
                <div className="h-[350px] w-full">
                  <h3 className="font-semibold mb-2">Blood Oxygen (SpO₂)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <XAxis dataKey="time" />
                      <YAxis domain={[80, 100]} />
                      <Tooltip />
                      <Legend />
                      <ReferenceLine y={95} stroke="#ef4444" strokeDasharray="4 4" label="Normal ≥95%" />
                      <Area type="monotone" dataKey="spo2" stroke="#facc15" fill="#fde68a" name="SpO₂ (%)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* ----------------- Respiratory Rate ----------------- */}
                <div className="h-[350px] w-full">
                  <h3 className="font-semibold mb-2">Respiratory Rate</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <XAxis dataKey="time" />
                      <YAxis domain={[10,30]} />
                      <Tooltip />
                      <Legend />
                      <ReferenceArea y1={12} y2={20} fill="#d1fae5" label="Normal 12-20" />
                      <Area type="monotone" dataKey="respiratoryRate" stroke="#10b981" fill="#a7f3d0" name="Respiratory Rate (breaths/min)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* ----------------- Heart Rate ----------------- */}
                <div className="h-[350px] w-full">
                  <h3 className="font-semibold mb-2">Heart Rate</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <XAxis dataKey="time" />
                      <YAxis domain={[40,120]} />
                      <Tooltip />
                      <Legend />
                      <ReferenceArea y1={60} y2={100} fill="#dbeafe" label="Normal 60-100 bpm" />
                      <Area type="monotone" dataKey="heartRate" stroke="#2563eb" fill="#93c5fd" name="Heart Rate (bpm)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* ----------------- BMI ----------------- */}
                <div className="h-[350px] w-full">
                  <h3 className="font-semibold mb-2">BMI</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <XAxis dataKey="time" />
                      <YAxis domain={[15,40]} />
                      <Tooltip />
                      <Legend />
                      <ReferenceArea y1={0} y2={18.5} fill="#fef3c7" label="Underweight" />
                      <ReferenceArea y1={18.5} y2={24.9} fill="#d1fae5" label="Normal" />
                      <ReferenceArea y1={25} y2={29.9} fill="#fef08a" label="Overweight" />
                      <ReferenceArea y1={30} y2={40} fill="#fca5a5" label="Obese" />
                      <Area type="monotone" dataKey="bmi" stroke="#06b6d4" fill="#bae6fd" name="BMI" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* ----------------- Weight & Height ----------------- */}
                <div className="h-[350px] w-full">
                  <h3 className="font-semibold mb-2">Weight & Height</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="time" />
                      <YAxis yAxisId="left" domain={[30,120]} />
                      <YAxis yAxisId="right" orientation="right" domain={[100,210]} />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="weight" stroke="#f97316" name="Weight (kg)" />
                      <Line yAxisId="right" type="monotone" dataKey="height" stroke="#2563eb" name="Height (cm)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>



        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold">Health Information</h3>
            <p className="text-muted-foreground">Update your health data before your visit</p>
          </div>
            <div className="flex gap-3">
              {/* Add */}
              <Button
                onClick={() => {
                  if (healthHistory.length > 0) {
                    loadRecordToForm(healthHistory[0]) // record mới nhất
                    setCurrentHealthInfoId(null) // 🔥 quan trọng: để tạo mới, không phải update
                  } else {
                    clearForm()
                  }
                  setIsEditing(true)
                }}
                disabled={isEditing} // disable khi đang edit/add
                variant="outline"
                className="btn-outline text-lg px-6 py-4 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>

              {/* Edit */}
              <Button
                onClick={() => {
                  if (!selectedRecord) return
                  setIsEditing(true) // bật editing mode
                  startInlineEdit()
                }}
                disabled={isEditing || !selectedRecord || !!inlineEditingId} // disable khi đang edit/add
                variant="outline"
                className="btn-outline text-lg px-6 py-4 flex items-center gap-2"
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>

              {/* Inherit */}
              <Button
                onClick={handleCopyRecord}
                disabled={!selectedRecord}
                className="btn-outline text-lg px-6 py-4 flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Inherit
              </Button>

              {/* Save Changes */}
              <Button
                onClick={handleSave}
                disabled={!isEditing && !inlineEditingId} // chỉ enable khi đang edit/add
                className="btn-gradient text-lg px-6 py-4 flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>

              {/* Clear All */}
              <Button
                onClick={() => {
                  clearForm()
                  setIsEditing(false)
                  setIsAdding(false)
                  cancelInlineEdit()
                }}
                disabled={!isEditing && !inlineEditingId}
                variant="destructive"
                className="btn-outline text-lg px-6 py-4 flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Clear All
              </Button>
            </div>
          </div>

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
                  value={bpSys}
                  onChange={(e) => setBpSys(e.target.value)}
                  disabled={!isEditing}
                />

                <Input
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
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="O">O</SelectItem>
                  <SelectItem value="AB">AB</SelectItem>
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
      {pauseableToast}
    </PatientLayout>
  )
}

function HealthInfoToast({
  toast,
  isExiting,
  onMouseEnter,
  onMouseLeave,
}: {
  toast: PauseableToastEntry
  isExiting: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const [entered, setEntered] = useState(false)

  useLayoutEffect(() => {
    setEntered(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [toast.id])

  const visible = entered && !isExiting

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto fixed bottom-6 left-6 z-[100] max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0",
        toast.variant === "success" && "bg-[#34A853] text-white",
        toast.variant === "error" && "bg-[#EA4335] text-white"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {toast.message}
    </div>
  )
}

function CustomBPTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    // Tìm giá trị systolic và diastolic
    const diastolic = payload.find((p: any) => p.dataKey === "diastolic")?.value
    const systolic = payload.find((p: any) => p.dataKey === "systolic")?.value

    return (
      <div className="bg-white p-2 border rounded shadow-md text-sm">
        <div className="font-semibold">{label}</div>
        <div>Systolic BP: <span className="text-red-600">{systolic}</span></div>
        <div>Diastolic BP: <span className="text-blue-600">{diastolic}</span></div>
      </div>
    )
  }

  return null
}
