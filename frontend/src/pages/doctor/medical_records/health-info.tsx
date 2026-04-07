"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PatientLayout } from "@/components/patient-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Activity, Heart, AlertCircle, FileText, Save, History, X, Loader2, Stethoscope, Plus, Edit, Search, Copy, CheckCircle2, FileDown, Trash2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CollapsibleSection } from "@/components/collapsible-section"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useParams } from "react-router-dom"
import { doctorService } from "@/services/doctor-service"
import type { HealthInfo } from "@/services/doctor-service"
import { useAuth } from "@/contexts/AuthContext"
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ReferenceLine, ReferenceArea } from "recharts"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { generateHealthInfoTrackingPdfBlob } from "@/lib/export-health-info-tracking-pdf"
import { useEmrSession } from "@/contexts/emr-session-context"

type HealthInfoPageProps = {
  mode?: "doctor" | "nurse"
}

export default function HealthInfoPage({ mode = "doctor" }: HealthInfoPageProps) {
  const { user } = useAuth()
  const { mutationsAllowed } = useEmrSession()
  const allowHealthWrites = mode === "nurse" || mutationsAllowed
  const params = useParams<{ patientId: string }>()
  // Strip "OP000..." prefix → numeric ID (e.g. "OP000000001" → 1)
  const patientId = Number(params.patientId?.replace(/^OP0*/, '') || '0')

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
    status: "draft" | "confirmed"

    // ✅ thêm
    bloodType?: string

    drugAllergies: string[]
    foodAllergies: string[]
    otherAllergies: string[]

    chronicConditions: string[]
    pastSurgeries: string[]
    familyHistory: string[]
    pastIllnesses: string[]
    vaccinations: string[]
    substanceAbuse: string[]
  }

  // Loading states
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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

  const mapApiHealthStatus = (s: unknown): HealthRecord["status"] => {
    const raw = String(s ?? "").toLowerCase()
    if (raw === "confirmed" || raw === "signed") return "confirmed"
    return "draft"
  }
  
  const filteredHistory = healthHistory.filter(r => {
    const status = r.status === "confirmed" ? "Confirmed" : "Draft"
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
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState<string | null>(null)
  //Thêm state để lưu các record được chọn:
  const [selectedRecords, setSelectedRecords] = useState<HealthRecord[]>([])
  const selectedStatus = selectedRecord?.status
  const canEditSelected = !!selectedRecord && selectedStatus === "draft" && !isEditing
  const canConfirmSelected = !!selectedRecord && selectedStatus === "draft" && !isEditing
  const canDeleteSelected =
    mode === "nurse" &&
    !isEditing &&
    selectedRecords.length > 0 &&
    selectedRecords.every((r) => r.status === "draft")
  const canExportSelected = mode === "nurse" && selectedRecords.length > 0 && !exportingPdf

  const toArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
    if (typeof value === "string" && value.trim()) return [value]
    return []
  }

  const chooseNonEmpty = (primary: string[], fallback: string[]) =>
    primary.length > 0 ? primary : fallback

  const [patientInfoDefaults, setPatientInfoDefaults] = useState<{
    bloodType: string
    drugAllergies: string[]
    foodAllergies: string[]
    otherAllergies: string[]
    chronicConditions: string[]
    pastSurgeries: string[]
    familyHistory: string[]
    pastIllnesses: string[]
    vaccinations: string[]
    substanceAbuse: string[]
  }>({
    bloodType: "O",
    drugAllergies: [],
    foodAllergies: [],
    otherAllergies: [],
    chronicConditions: [],
    pastSurgeries: [],
    familyHistory: [],
    pastIllnesses: [],
    vaccinations: [],
    substanceAbuse: [],
  })

  const pageCount = Math.ceil(filteredHistory.length / pageSize)

  const paginated = filteredHistory.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

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

  const releasePdfBlobUrl = (next: string | null) => {
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return next
    })
  }

  const closePdfPreview = () => {
    setPdfPreviewOpen(false)
    setPdfPreviewFilename(null)
    releasePdfBlobUrl(null)
  }

  const handleDeleteSelectedRecords = async () => {
    if (!allowHealthWrites) return
    if (!patientId || !canDeleteSelected) return
    if (!confirm(`Delete ${selectedRecords.length} selected draft record(s)?`)) return
    setSaving(true)
    try {
      await Promise.all(selectedRecords.map((r) => doctorService.deleteHealthInfo(patientId, r.id)))
      setSelectedRecords([])
      setSelectedRecord(null)
      setSuccess(`${selectedRecords.length} record(s) deleted successfully.`)
      setError(null)
      await loadHealthHistory()
    } catch (err: any) {
      setError(err?.message || "Failed to delete records")
    } finally {
      setSaving(false)
    }
  }

  const handleExportTrackingPdf = async () => {
    if (!patientId || !canExportSelected) return
    setExportingPdf(true)
    try {
      const patientRes = await doctorService.getPatient(patientId)
      if (!patientRes.success || !patientRes.patient) throw new Error("Failed to load patient information")
      const p = patientRes.patient
      const diagnosis = p.latestDiagnosis
        ? `${p.latestDiagnosis.icd10 || ""}${p.latestDiagnosis.icd10 && p.latestDiagnosis.interpretation ? " - " : ""}${p.latestDiagnosis.interpretation || ""}`
        : ""
      const rows = [...selectedRecords].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      const { blob, filename } = await generateHealthInfoTrackingPdfBlob({
        patientName: `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.username || "",
        age: p.age == null ? "" : String(p.age),
        gender: p.gender === "M" ? "Male" : p.gender === "F" ? "Female" : "",
        diagnosis,
        rows: rows.map((r) => ({
          updatedAt: r.updatedAt,
          bloodPressure: r.bloodPressure,
          pulse: r.heartRate,
          temperature: r.temperature,
          weight: r.weight,
          respiratoryRate: r.respiratoryRate,
          spo2: r.spo2,
          symptoms: r.symptoms,
        })),
      })
      const url = URL.createObjectURL(blob)
      setPdfPreviewFilename(filename)
      releasePdfBlobUrl(url)
      setPdfPreviewOpen(true)
    } catch (err: any) {
      setError(err?.message || "Failed to export PDF")
    } finally {
      setExportingPdf(false)
    }
  }

  const handleSavePdfFromPreview = () => {
    if (!pdfPreviewUrl || !pdfPreviewFilename) return
    const a = document.createElement("a")
    a.href = pdfPreviewUrl
    a.download = pdfPreviewFilename
    a.rel = "noopener"
    a.click()
  }

  // Load health info on mount
  useEffect(() => {
    if (!patientId) return

    const fetchData = async () => {
      setLoading(true)
      try {
        // Load current health info
        await loadHealthInfo()
        // Load health history
        await loadHealthHistory()
      } catch (err) {
        console.error(err)
        setError("Failed to load health information")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [patientId])

  const loadHealthInfo = async () => {
    if (!patientId) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await doctorService.getHealthInfo(patientId)
      // #region agent log
      fetch('http://127.0.0.1:7313/ingest/0fad1357-b396-4ed7-94eb-d59495bf0e42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'73987d'},body:JSON.stringify({sessionId:'73987d',runId:'doctor-healthinfo-initial',hypothesisId:'H3',location:'doctor/medical_records/health-info.tsx:loadHealthInfo',message:'loadHealthInfo result snapshot',data:{success:result?.success,hasHealthInfo:!!result?.healthInfo,keys:result?.healthInfo?Object.keys(result.healthInfo as any):[]},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (result.success && result.healthInfo) {
        const info = result.healthInfo as any
        const patientInfo = (result as any).patientInfo || {}
        const allergicInfo = (() => {
          try {
            return typeof info.allergic_info === "string"
              ? JSON.parse(info.allergic_info)
              : (info.allergic_info || info.allergicInfo || {})
          } catch {
            return {}
          }
        })()

        const medicalHistory = (() => {
          try {
            return typeof info.medical_history === "string"
              ? JSON.parse(info.medical_history)
              : (info.medical_history || info.medicalHistory || {})
          } catch {
            return {}
          }
        })()

        const patientAllergicInfo = (() => {
          try {
            return typeof patientInfo.allergic_info === "string"
              ? JSON.parse(patientInfo.allergic_info)
              : (patientInfo.allergic_info || {})
          } catch {
            return {}
          }
        })()

        const patientMedicalHistory = (() => {
          try {
            return typeof patientInfo.medical_history === "string"
              ? JSON.parse(patientInfo.medical_history)
              : (patientInfo.medical_history || {})
          } catch {
            return {}
          }
        })()

        const defaults = {
          bloodType: patientInfo.blood_type || "O",
          drugAllergies: toArray(patientAllergicInfo.drugAllergies),
          foodAllergies: toArray(patientAllergicInfo.foodAllergies),
          otherAllergies: toArray(patientAllergicInfo.otherAllergies),
          chronicConditions: toArray(patientMedicalHistory.chronicConditions),
          pastSurgeries: toArray(patientMedicalHistory.pastSurgeries),
          familyHistory: toArray(patientMedicalHistory.familyHistory),
          pastIllnesses: toArray(patientMedicalHistory.pastIllnesses),
          vaccinations: toArray(patientMedicalHistory.vaccinations),
          substanceAbuse: toArray(patientMedicalHistory.substanceAbuse),
        }
        setPatientInfoDefaults(defaults)

        setCurrentHealthInfoId(info.id)
        setHeight(info.height?.toString() || "")
        setWeight(info.weight?.toString() || "")
        const [sys, dia] = (info.blood_pressure || "0/0").split("/")
        setBpSys(sys)
        setBpDia(dia)
        setBpDia(info.blood_pressure?.toString() || "")
        setHeartRate(info.heart_rate?.toString() || "")
        setRespiratoryRate(info.respiratory_rate?.toString() || "")
        setTemperature(info.temperature?.toString() || "")
        setSpo2(info.spo2?.toString() || "")
        setSymptoms(info.condition || "")
        setSymptoms(info.currentSymptoms || "")
        
        // Set allergies (supports both flat fields and allergic_info object)
        setDrugAllergies(chooseNonEmpty(toArray(info.drugAllergies ?? allergicInfo.drugAllergies), defaults.drugAllergies))
        setFoodAllergies(chooseNonEmpty(toArray(info.foodAllergies ?? allergicInfo.foodAllergies), defaults.foodAllergies))
        setOtherAllergies(chooseNonEmpty(toArray(info.otherAllergies ?? allergicInfo.otherAllergies), defaults.otherAllergies))
        
        // Set medical history (supports both flat fields and medical_history object)
        setChronicConditions(chooseNonEmpty(toArray(info.chronicConditions ?? medicalHistory.chronicConditions), defaults.chronicConditions))
        setPastSurgeries(chooseNonEmpty(toArray(info.pastSurgeries ?? medicalHistory.pastSurgeries), defaults.pastSurgeries))
        setFamilyHistory(chooseNonEmpty(toArray(info.familyHistory ?? medicalHistory.familyHistory), defaults.familyHistory))
        setPastIllnesses(chooseNonEmpty(toArray(info.pastIllnesses ?? medicalHistory.pastIllnesses), defaults.pastIllnesses))
        setVaccinations(chooseNonEmpty(toArray(info.vaccinations ?? medicalHistory.vaccinations), defaults.vaccinations))
        setSubstanceAbuse(chooseNonEmpty(toArray(info.substanceAbuse ?? medicalHistory.substanceAbuse), defaults.substanceAbuse))
      } else {
        setError("Failed to load health information")
      }
    } catch (err) {
      console.error("Failed to load health info:", err)
    } finally {
      setLoading(false)
    }
  }

const loadHealthHistory = async () => {
  try {
    const result = await doctorService.getHealthInfoHistory(patientId, 1, 100)
    // #region agent log
    fetch('http://127.0.0.1:7313/ingest/0fad1357-b396-4ed7-94eb-d59495bf0e42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'73987d'},body:JSON.stringify({sessionId:'73987d',runId:'doctor-healthinfo-initial',hypothesisId:'H1',location:'doctor/medical_records/health-info.tsx:loadHealthHistory',message:'history API snapshot',data:{success:result?.success,count:Array.isArray(result?.history)?result.history.length:0,sampleKeys:result?.history?.[0]?Object.keys(result.history[0] as any):[]},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (result.success && result.history) {
      const records: HealthRecord[] = result.history.map((h: any) => {
          const allergicInfo = (() => {
          try {
            return typeof h.allergic_info === "string"
              ? JSON.parse(h.allergic_info)
              : (h.allergic_info || h.allergicInfo || {})
          } catch {
            return {}
          }
        })()

        const medicalHistory = (() => {
          try {
            return typeof h.medical_history === "string"
              ? JSON.parse(h.medical_history)
              : (h.medical_history || h.medicalHistory || {})
          } catch {
            return {}
          }
        })()
        const height = Number(h.height) || 0
        const weight = Number(h.weight) || 0

        const bmi = height > 0 ? weight / ((height / 100) ** 2) : 0

        // parse BP
        const [sys, dia] = (h.blood_pressure || "0/0").split("/")

        return {
          id: h.id,

          updatedAt: new Date(h.time || h.updatedAt || h.createdAt || Date.now()),

          height,
          weight,
          bmi,

          // ✅ FIX BP
          bloodPressure: `${sys}/${dia}`,

          // ✅ FIX snake_case → camelCase
          heartRate: Number(h.heart_rate) || 0,
          respiratoryRate: Number(h.respiratory_rate) || 0,
          temperature: Number(h.temperature) || 0,
          spo2: Number(h.spo2) || 0,

          // ✅ FIX condition → symptoms
          symptoms: h.condition || "",
          status: mapApiHealthStatus(h.status),

          updatedBy: "Patient",

          bloodType: h.blood_type || h.bloodType || "O",

          // Support both flat API fields and nested JSON blobs
          drugAllergies: toArray(h.drugAllergies ?? allergicInfo.drugAllergies),
          foodAllergies: toArray(h.foodAllergies ?? allergicInfo.foodAllergies),
          otherAllergies: toArray(h.otherAllergies ?? allergicInfo.otherAllergies),

          chronicConditions: toArray(h.chronicConditions ?? medicalHistory.chronicConditions),
          pastSurgeries: toArray(h.pastSurgeries ?? medicalHistory.pastSurgeries),
          familyHistory: toArray(h.familyHistory ?? medicalHistory.familyHistory),
          pastIllnesses: toArray(h.pastIllnesses ?? medicalHistory.pastIllnesses),
          vaccinations: toArray(h.vaccinations ?? medicalHistory.vaccinations),
          substanceAbuse: toArray(h.substanceAbuse ?? medicalHistory.substanceAbuse)
        }
      })
      // #region agent log
      fetch('http://127.0.0.1:7313/ingest/0fad1357-b396-4ed7-94eb-d59495bf0e42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'73987d'},body:JSON.stringify({sessionId:'73987d',runId:'doctor-healthinfo-initial',hypothesisId:'H2',location:'doctor/medical_records/health-info.tsx:loadHealthHistoryMap',message:'mapped record sample',data:{count:records.length,sample:records[0]?{id:records[0].id,bloodType:records[0].bloodType,drugAllergiesLen:records[0].drugAllergies?.length,foodAllergiesLen:records[0].foodAllergies?.length,otherAllergiesLen:records[0].otherAllergies?.length,chronicConditionsLen:records[0].chronicConditions?.length}:null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      setHealthHistory(records)
    }
  } catch (err) {
    console.error("Failed to load health history:", err)
  }
}

  const loadRecordToForm = (record: HealthRecord) => {
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

    setBloodType(record.bloodType || patientInfoDefaults.bloodType || "O")

    setDrugAllergies(chooseNonEmpty(record.drugAllergies || [], patientInfoDefaults.drugAllergies))
    setFoodAllergies(chooseNonEmpty(record.foodAllergies || [], patientInfoDefaults.foodAllergies))
    setOtherAllergies(chooseNonEmpty(record.otherAllergies || [], patientInfoDefaults.otherAllergies))

    setChronicConditions(chooseNonEmpty(record.chronicConditions || [], patientInfoDefaults.chronicConditions))
    setPastSurgeries(chooseNonEmpty(record.pastSurgeries || [], patientInfoDefaults.pastSurgeries))
    setFamilyHistory(chooseNonEmpty(record.familyHistory || [], patientInfoDefaults.familyHistory))
    setPastIllnesses(chooseNonEmpty(record.pastIllnesses || [], patientInfoDefaults.pastIllnesses))
    setVaccinations(chooseNonEmpty(record.vaccinations || [], patientInfoDefaults.vaccinations))
    setSubstanceAbuse(chooseNonEmpty(record.substanceAbuse || [], patientInfoDefaults.substanceAbuse))
    // #region agent log
    fetch('http://127.0.0.1:7313/ingest/0fad1357-b396-4ed7-94eb-d59495bf0e42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'73987d'},body:JSON.stringify({sessionId:'73987d',runId:'doctor-healthinfo-initial',hypothesisId:'H4',location:'doctor/medical_records/health-info.tsx:loadRecordToForm',message:'row selected payload',data:{id:record?.id,bloodType:record?.bloodType,drugAllergiesLen:record?.drugAllergies?.length,foodAllergiesLen:record?.foodAllergies?.length,otherAllergiesLen:record?.otherAllergies?.length,chronicConditionsLen:record?.chronicConditions?.length,pastSurgeriesLen:record?.pastSurgeries?.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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

  const handleCopyRecord = () => {
    if (!allowHealthWrites) return
    if (!selectedRecord) return
    loadRecordToForm(selectedRecord)
    setCurrentHealthInfoId(null)
    setSelectedRecord(null)
    setIsAdding(true)
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (!allowHealthWrites) return
    if (!patientId) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const payload = {
        height: height ? parseFloat(height) : undefined,
        weight: weight ? parseFloat(weight) : undefined,
        bloodPressureSys: bpSys ? parseInt(bpSys, 10) : undefined,
        bloodPressureDia: bpDia ? parseInt(bpDia, 10) : undefined,
        heartRate: heartRate ? parseInt(heartRate, 10) : undefined,
        respiratoryRate: respiratoryRate ? parseInt(respiratoryRate, 10) : undefined,
        temperature: temperature ? parseFloat(temperature) : undefined,
        spo2: spo2 ? parseInt(spo2, 10) : undefined,
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
        updatedBy: "Doctor",
      }

      if (currentHealthInfoId && !isAdding) {
        await doctorService.updateHealthInfo(patientId, currentHealthInfoId, payload)
        setSuccess("Health record updated successfully.")
      } else {
        await doctorService.createHealthInfo(patientId, payload)
        setSuccess("Health record created successfully.")
      }

      setIsEditing(false)
      setIsAdding(false)
      await loadHealthInfo()
      await loadHealthHistory()
    } catch (err: any) {
      setError(err?.message || "Failed to save health information")
    } finally {
      setSaving(false)
    }
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
      <div className="space-y-6">
        <Dialog open={pdfPreviewOpen} onOpenChange={(open) => (!open ? closePdfPreview() : setPdfPreviewOpen(open))}>
          <DialogContent className="flex max-h-[90vh] w-[min(920px,96vw)] max-w-none flex-col gap-3 p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Health Tracking Slip Preview (PDF)</DialogTitle>
            </DialogHeader>
            {pdfPreviewUrl ? (
              <iframe
                title="Health tracking PDF preview"
                src={pdfPreviewUrl}
                className="min-h-[min(520px,60vh)] w-full flex-1 rounded-md border border-slate-200 bg-slate-50"
              />
            ) : null}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" className="btn-outline" onClick={closePdfPreview}>
                Close
              </Button>
              <Button type="button" className="btn-gradient" onClick={handleSavePdfFromPreview}>
                <FileDown className="h-4 w-4 mr-2" />
                Save / Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="records" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="records">Health Records</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="mt-4">
            {mode === "nurse" ? (
              <div className="mb-3 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="btn-outline"
                  disabled={!canExportSelected}
                  onClick={() => void handleExportTrackingPdf()}
                >
                  {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  <span className="ml-2">Export</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="btn-outline text-red-600"
                  disabled={!canDeleteSelected}
                  onClick={() => void handleDeleteSelectedRecords()}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="ml-2">Delete</span>
                </Button>
              </div>
            ) : null}
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
                    <TableHead />{/* No */}
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
                          <SelectItem value="Signed">Signed</SelectItem>
                          <SelectItem value="Voided">Voided</SelectItem>
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
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          r.status === "confirmed"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}>
                          {r.status === "confirmed" ? "Confirmed" : "Draft"}
                        </span>
                      </TableCell>
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={selectedRecords.some(row => row.id === r.id)}
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


        {mode === "nurse" && (
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold">Health Information</h3>
              <p className="text-muted-foreground">Update patient health data before examination</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  if (!allowHealthWrites) return
                  if (healthHistory.length > 0) {
                    loadRecordToForm(healthHistory[0])
                    setCurrentHealthInfoId(null)
                  } else {
                    clearForm()
                  }
                  setIsAdding(true)
                  setIsEditing(true)
                }}
                disabled={isEditing || !allowHealthWrites}
                variant="outline"
                className="btn-outline text-lg px-6 py-4 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
              <Button
                onClick={() => {
                  if (!allowHealthWrites) return
                  if (!selectedRecord) return
                  setIsAdding(false)
                  setIsEditing(true)
                }}
                disabled={!canEditSelected || !allowHealthWrites}
                variant="outline"
                className="btn-outline text-lg px-6 py-4 flex items-center gap-2"
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button
                onClick={handleCopyRecord}
                disabled={!selectedRecord || !allowHealthWrites}
                className="btn-outline text-lg px-6 py-4 flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Inherit
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isEditing || saving || !allowHealthWrites}
                className="btn-gradient text-lg px-6 py-4 flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button
                onClick={async () => {
                  if (!allowHealthWrites) return
                  if (!selectedRecord) return
                  try {
                    await doctorService.confirmHealthInfo(patientId, selectedRecord.id)
                    setSuccess("Health record confirmed successfully.")
                    setError(null)
                    setSelectedRecord(null)
                    await loadHealthHistory()
                  } catch (err: any) {
                    setError(err?.message || "Failed to confirm health record")
                  }
                }}
                disabled={!canConfirmSelected || !allowHealthWrites}
                className="!bg-[#16a34a] hover:bg-green-700 text-white text-lg px-6 py-4"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm
              </Button>
              <Button
                onClick={() => {
                  clearForm()
                  setIsEditing(false)
                  setIsAdding(false)
                }}
                disabled={!isEditing}
                variant="destructive"
                className="btn-outline text-lg px-6 py-4 flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}

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
                  disabled={!isEditing || !allowHealthWrites}
                />

                <Input
                  value={bpDia}
                  onChange={(e) => setBpDia(e.target.value)}
                  disabled={!isEditing || !allowHealthWrites}
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
                disabled={!isEditing || !allowHealthWrites}
              />
            </div>

            {/* Temperature */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="temperature">Body Temperature (°C)</Label>
              <Input
                id="temperature"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={!isEditing || !allowHealthWrites}
              />
            </div>

            {/* Height */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="height">Height (cm)</Label>
              <Input 
                id="height" 
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                disabled={!isEditing || !allowHealthWrites}
                type="number" />
            </div>

            {/* Respiratory Rate */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="respiratory">Respiratory Rate (breaths/min)</Label>
              <Input
                id="respiratory"
                value={respiratoryRate}
                onChange={(e) => setRespiratoryRate(e.target.value)}
                disabled={!isEditing || !allowHealthWrites}
              />
            </div>

            {/* Weight */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input id="weight" 
                value={weight}
                disabled={!isEditing || !allowHealthWrites}
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
                disabled={!isEditing || !allowHealthWrites}
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
              <Select value={bloodType} onValueChange={setBloodType} disabled={!isEditing || !allowHealthWrites}>
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
              disabled={!isEditing || !allowHealthWrites}
            />

            <InputList
              label="Food Allergies"
              values={foodAllergies}
              setValues={setFoodAllergies}
              disabled={!isEditing || !allowHealthWrites}
            />

            <InputList
              label="Other Allergies"
              values={otherAllergies}
              setValues={setOtherAllergies}
              disabled={!isEditing || !allowHealthWrites}
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
              disabled={!isEditing || !allowHealthWrites}
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
              disabled={!isEditing || !allowHealthWrites}
            />

            <InputList
              label="Past Surgeries"
              values={pastSurgeries}
              setValues={setPastSurgeries}
              disabled={!isEditing || !allowHealthWrites}
            />

            <InputList
              label="Family Medical History"
              values={familyHistory}
              setValues={setFamilyHistory}
              disabled={!isEditing || !allowHealthWrites}
            />

            <InputList
              label="Previous Illnesses"
              values={pastIllnesses}
              setValues={setPastIllnesses}
              disabled={!isEditing || !allowHealthWrites}
            />

            <InputList
              label="Vaccinations"
              values={vaccinations}
              setValues={setVaccinations}
              disabled={!isEditing || !allowHealthWrites}
            />

            <InputList
              label="Substance Abuse"
              values={substanceAbuse}
              setValues={setSubstanceAbuse}
              disabled={!isEditing || !allowHealthWrites}
            />

          </div>
        </CollapsibleSection>

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