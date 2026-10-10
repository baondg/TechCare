"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PatientSymptomEntriesEditor } from "@/components/patient-symptom-entries-editor"
import {
  createEmptySymptomEntry,
  parseHealthInfoSymptoms,
  serializeSymptomEntries,
  type SymptomEntry,
} from "@/lib/health-info-symptoms"
import { useTranslation } from "react-i18next"
import { PatientLayout } from "@/components/patient-layout"
import { Card, CardContent } from "@/components/ui/card"
import { PatientHealthChartsHeader, PatientHealthChartsPanel } from "@/components/patient-health-charts"
import { buildHealthChartData } from "@/lib/health-chart-data"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Activity, Heart, AlertCircle, FileText, Save, X, Loader2, Plus, Edit, Search, Copy, CheckCircle2, FileDown, Trash2 } from "lucide-react"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import { usePauseableToast } from "@/hooks/use-pauseable-toast"
import { CollapsibleSection } from "@/components/collapsible-section"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { useParams } from "react-router-dom"
import { doctorService } from "@/services/doctor-service"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { generateHealthInfoTrackingPdfBlob } from "@/lib/export-health-info-tracking-pdf"
import { stampPdfWithExportFooter } from "@/lib/pdf-export-stamp"
import {
  PATIENT_BLOOD_TYPES,
  PATIENT_BLOOD_TYPE_UNSET,
  bloodTypeForApiPayload,
  normalizePatientBloodTypeForSelect,
} from "@/lib/patient-blood-types"
import {
  vitalNumericError,
  vitalMainFormErrorMessages,
  formatVitalValidationErrorToast,
} from "@/lib/vital-signs-limits"

type HealthInfoPageProps = {
  mode?: "doctor" | "nurse"
}

function VitalWarning({ message }: { message: string | null }) {
  if (!message) return null
  return <span className="text-sm text-red-600 block mt-0.5">{message}</span>
}

function InputList({
  label,
  values,
  setValues,
  disabled,
}: {
  label: string
  values: string[]
  setValues: (v: string[]) => void
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

export default function HealthInfoPage({ mode = "doctor" }: HealthInfoPageProps) {
  const { t } = useTranslation()
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  /** Doctors and nurses can edit patient health info on this page (same controls). */
  const allowHealthWrites = mode === "nurse" || mode === "doctor"
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
  const [bloodType, setBloodType] = useState<string>(PATIENT_BLOOD_TYPE_UNSET)
  const [symptomEntries, setSymptomEntries] = useState<SymptomEntry[]>([createEmptySymptomEntry()])
  const symptomsSerialized = useMemo(() => serializeSymptomEntries(symptomEntries), [symptomEntries])

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

  const [selectedRecord, setSelectedRecord] = useState<HealthRecord | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [addingTrackingSlip, setAddingTrackingSlip] = useState(false)
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState<string | null>(null)
  //Thêm state để lưu các record được chọn:
  const [selectedRecords, setSelectedRecords] = useState<HealthRecord[]>([])
  const selectedStatus = selectedRecord?.status
  const canEditSelected = !!selectedRecord && selectedStatus === "draft" && !isEditing
  const canConfirmSelected = !!selectedRecord && selectedStatus === "draft" && !isEditing
  const canDeleteSelected =
    (mode === "nurse" || mode === "doctor") &&
    !isEditing &&
    selectedRecords.length > 0 &&
    selectedRecords.every((r) => r.status === "draft")
  const canExportSelected = selectedRecords.length > 0 && !exportingPdf
  const canAddToMedicalRecord = mode === "doctor" && selectedRecords.length > 0 && !exportingPdf && !addingTrackingSlip

  const toArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((s) => s.trim()).filter(Boolean)
    if (typeof value === "string" && value.trim()) {
      const raw = value.trim()
      // Support JSON-array strings stored in DB blobs, e.g. '["A","B"]'
      if (raw.startsWith("[") && raw.endsWith("]")) {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            return parsed
              .filter((item): item is string => typeof item === "string")
              .map((s) => s.trim())
              .filter(Boolean)
          }
        } catch {
          // fallback below
        }
      }
      return [raw]
    }
    return []
  }

  const pickArrayField = (obj: Record<string, unknown>, ...keys: string[]): string[] => {
    for (const key of keys) {
      const list = toArray(obj[key])
      if (list.length) return list
    }
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
    bloodType: PATIENT_BLOOD_TYPE_UNSET,
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
    const source = selectedRecords.length > 0 ? selectedRecords : healthHistory
    return buildHealthChartData(source)
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
    const deleteCount = selectedRecords.length
    if (!confirm(`Delete ${deleteCount} selected draft record(s)?`)) return
    setSaving(true)
    try {
      await Promise.all(selectedRecords.map((r) => doctorService.deleteHealthInfo(patientId, r.id)))
      setSelectedRecords([])
      setSelectedRecord(null)
      showSuccess(`${deleteCount} record(s) deleted successfully.`)
      await loadHealthHistory()
    } catch (err: any) {
      showError(err?.message || "Failed to delete records")
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
        patientName: `${p.lastName || ""} ${p.firstName || ""}`.trim() || p.username || "",
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
      showError(err?.message || "Failed to export PDF")
    } finally {
      setExportingPdf(false)
    }
  }

  const handleSavePdfFromPreview = async () => {
    if (!pdfPreviewUrl || !pdfPreviewFilename) return
    try {
      const res = await fetch(pdfPreviewUrl)
      const raw = await res.blob()
      const stamped = await stampPdfWithExportFooter(raw, new Date())
      const url = URL.createObjectURL(stamped)
      const a = document.createElement("a")
      a.href = url
      a.download = pdfPreviewFilename
      a.rel = "noopener"
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      console.error(err)
      showError(err instanceof Error ? err.message : "Download failed")
    }
  }

  const handleAddTrackingSlipToMedicalRecord = async () => {
    if (!patientId || !canAddToMedicalRecord) return
    setAddingTrackingSlip(true)
    try {
      await doctorService.addHealthTrackingSlipToMedicalRecord(patientId, {
        recordIds: selectedRecords.map((r) => r.id),
      })
      showSuccess("Health tracking slip added to active medical record.")
      closePdfPreview()
    } catch (err: any) {
      showError(err?.message || "Failed to add slip to medical record")
    } finally {
      setAddingTrackingSlip(false)
    }
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
        showError("Failed to load health information")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [patientId])

  const loadHealthInfo = async () => {
    if (!patientId) return
    
    setLoading(true)
    
    try {
      const result = await doctorService.getHealthInfo(patientId)

      if (!result.success) {
        showError((result as { message?: string }).message || "Failed to load health information")
        return
      }

      const patientInfo = (result as { patientInfo?: Record<string, unknown> }).patientInfo || {}

      const patientAllergicInfo = (() => {
        try {
          return typeof patientInfo.allergic_info === "string"
            ? JSON.parse(patientInfo.allergic_info)
            : ((patientInfo.allergic_info as Record<string, unknown>) || {})
        } catch {
          return {}
        }
      })()

      const patientMedicalHistory = (() => {
        try {
          return typeof patientInfo.medical_history === "string"
            ? JSON.parse(patientInfo.medical_history)
            : ((patientInfo.medical_history as Record<string, unknown>) || {})
        } catch {
          return {}
        }
      })()

      const defaults = {
        bloodType: normalizePatientBloodTypeForSelect(String(patientInfo.blood_type ?? "")),
        drugAllergies: pickArrayField(patientAllergicInfo, "drugAllergies", "drug_allergies"),
        foodAllergies: pickArrayField(patientAllergicInfo, "foodAllergies", "food_allergies"),
        otherAllergies: pickArrayField(patientAllergicInfo, "otherAllergies", "other_allergies"),
        chronicConditions: pickArrayField(patientMedicalHistory, "chronicConditions", "chronic_conditions"),
        pastSurgeries: pickArrayField(patientMedicalHistory, "pastSurgeries", "past_surgeries"),
        familyHistory: pickArrayField(patientMedicalHistory, "familyHistory", "family_history"),
        pastIllnesses: pickArrayField(patientMedicalHistory, "pastIllnesses", "past_illnesses"),
        vaccinations: pickArrayField(patientMedicalHistory, "vaccinations"),
        substanceAbuse: pickArrayField(patientMedicalHistory, "substanceAbuse", "substance_abuse"),
      }
      setPatientInfoDefaults(defaults)

      if (!result.healthInfo) {
        setCurrentHealthInfoId(null)
        setSelectedRecord(null)
        setHeight("")
        setWeight("")
        setBpSys("")
        setBpDia("")
        setHeartRate("")
        setRespiratoryRate("")
        setTemperature("")
        setSpo2("")
        setSymptomEntries([createEmptySymptomEntry()])
        setBloodType(defaults.bloodType || PATIENT_BLOOD_TYPE_UNSET)
        setDrugAllergies(defaults.drugAllergies)
        setFoodAllergies(defaults.foodAllergies)
        setOtherAllergies(defaults.otherAllergies)
        setChronicConditions(defaults.chronicConditions)
        setPastSurgeries(defaults.pastSurgeries)
        setFamilyHistory(defaults.familyHistory)
        setPastIllnesses(defaults.pastIllnesses)
        setVaccinations(defaults.vaccinations)
        setSubstanceAbuse(defaults.substanceAbuse)
        return
      }

      {
        const info = result.healthInfo as Record<string, unknown>
        const allergicInfo = (() => {
          try {
            return typeof info.allergic_info === "string"
              ? JSON.parse(info.allergic_info)
              : ((info.allergic_info as Record<string, unknown>) || (info.allergicInfo as Record<string, unknown>) || {})
          } catch {
            return {}
          }
        })()

        const medicalHistory = (() => {
          try {
            return typeof info.medical_history === "string"
              ? JSON.parse(info.medical_history)
              : ((info.medical_history as Record<string, unknown>) || (info.medicalHistory as Record<string, unknown>) || {})
          } catch {
            return {}
          }
        })()

        setCurrentHealthInfoId(Number(info.id))
        setHeight(info.height?.toString() || "")
        setWeight(info.weight?.toString() || "")
        const [sys, dia] = (info.blood_pressure || "0/0").split("/")
        setBpSys(sys)
        setBpDia(dia)
        setHeartRate(info.heart_rate?.toString() || "")
        setRespiratoryRate(info.respiratory_rate?.toString() || "")
        setTemperature(info.temperature?.toString() || "")
        setSpo2(info.spo2?.toString() || "")
        setSymptomEntries(parseHealthInfoSymptoms(String(info.currentSymptoms ?? info.condition ?? "")))
        
        // Set allergies (supports both flat fields and allergic_info object)
        setDrugAllergies(
          chooseNonEmpty(
            pickArrayField(info as Record<string, unknown>, "drugAllergies", "drug_allergies").length
              ? pickArrayField(info as Record<string, unknown>, "drugAllergies", "drug_allergies")
              : pickArrayField(allergicInfo, "drugAllergies", "drug_allergies"),
            defaults.drugAllergies,
          ),
        )
        setFoodAllergies(
          chooseNonEmpty(
            pickArrayField(info as Record<string, unknown>, "foodAllergies", "food_allergies").length
              ? pickArrayField(info as Record<string, unknown>, "foodAllergies", "food_allergies")
              : pickArrayField(allergicInfo, "foodAllergies", "food_allergies"),
            defaults.foodAllergies,
          ),
        )
        setOtherAllergies(
          chooseNonEmpty(
            pickArrayField(info as Record<string, unknown>, "otherAllergies", "other_allergies").length
              ? pickArrayField(info as Record<string, unknown>, "otherAllergies", "other_allergies")
              : pickArrayField(allergicInfo, "otherAllergies", "other_allergies"),
            defaults.otherAllergies,
          ),
        )
        
        // Set medical history (supports both flat fields and medical_history object)
        setChronicConditions(
          chooseNonEmpty(
            pickArrayField(info as Record<string, unknown>, "chronicConditions", "chronic_conditions").length
              ? pickArrayField(info as Record<string, unknown>, "chronicConditions", "chronic_conditions")
              : pickArrayField(medicalHistory, "chronicConditions", "chronic_conditions"),
            defaults.chronicConditions,
          ),
        )
        setPastSurgeries(
          chooseNonEmpty(
            pickArrayField(info as Record<string, unknown>, "pastSurgeries", "past_surgeries").length
              ? pickArrayField(info as Record<string, unknown>, "pastSurgeries", "past_surgeries")
              : pickArrayField(medicalHistory, "pastSurgeries", "past_surgeries"),
            defaults.pastSurgeries,
          ),
        )
        setFamilyHistory(
          chooseNonEmpty(
            pickArrayField(info as Record<string, unknown>, "familyHistory", "family_history").length
              ? pickArrayField(info as Record<string, unknown>, "familyHistory", "family_history")
              : pickArrayField(medicalHistory, "familyHistory", "family_history"),
            defaults.familyHistory,
          ),
        )
        setPastIllnesses(
          chooseNonEmpty(
            pickArrayField(info as Record<string, unknown>, "pastIllnesses", "past_illnesses").length
              ? pickArrayField(info as Record<string, unknown>, "pastIllnesses", "past_illnesses")
              : pickArrayField(medicalHistory, "pastIllnesses", "past_illnesses"),
            defaults.pastIllnesses,
          ),
        )
        setVaccinations(
          chooseNonEmpty(
            pickArrayField(info as Record<string, unknown>, "vaccinations").length
              ? pickArrayField(info as Record<string, unknown>, "vaccinations")
              : pickArrayField(medicalHistory, "vaccinations"),
            defaults.vaccinations,
          ),
        )
        setSubstanceAbuse(
          chooseNonEmpty(
            pickArrayField(info as Record<string, unknown>, "substanceAbuse", "substance_abuse").length
              ? pickArrayField(info as Record<string, unknown>, "substanceAbuse", "substance_abuse")
              : pickArrayField(medicalHistory, "substanceAbuse", "substance_abuse"),
            defaults.substanceAbuse,
          ),
        )

        setBloodType(
          normalizePatientBloodTypeForSelect(
            String(info.blood_type ?? info.bloodType ?? patientInfo.blood_type ?? ""),
          ),
        )
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
    const result = await doctorService.getHealthInfoHistory(patientId, 1, 100)

    if (!result.success) {
      showError((result as { message?: string }).message || "Failed to load health history")
      return
    }

    const rows = Array.isArray(result.history) ? result.history : []
    const records: HealthRecord[] = rows.map((h: any) => {
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

          bloodType: normalizePatientBloodTypeForSelect(h.blood_type || h.bloodType || ""),

          // Support both flat API fields and nested JSON blobs
          drugAllergies: pickArrayField(h as Record<string, unknown>, "drugAllergies", "drug_allergies").length
            ? pickArrayField(h as Record<string, unknown>, "drugAllergies", "drug_allergies")
            : pickArrayField(allergicInfo, "drugAllergies", "drug_allergies"),
          foodAllergies: pickArrayField(h as Record<string, unknown>, "foodAllergies", "food_allergies").length
            ? pickArrayField(h as Record<string, unknown>, "foodAllergies", "food_allergies")
            : pickArrayField(allergicInfo, "foodAllergies", "food_allergies"),
          otherAllergies: pickArrayField(h as Record<string, unknown>, "otherAllergies", "other_allergies").length
            ? pickArrayField(h as Record<string, unknown>, "otherAllergies", "other_allergies")
            : pickArrayField(allergicInfo, "otherAllergies", "other_allergies"),

          chronicConditions: pickArrayField(h as Record<string, unknown>, "chronicConditions", "chronic_conditions").length
            ? pickArrayField(h as Record<string, unknown>, "chronicConditions", "chronic_conditions")
            : pickArrayField(medicalHistory, "chronicConditions", "chronic_conditions"),
          pastSurgeries: pickArrayField(h as Record<string, unknown>, "pastSurgeries", "past_surgeries").length
            ? pickArrayField(h as Record<string, unknown>, "pastSurgeries", "past_surgeries")
            : pickArrayField(medicalHistory, "pastSurgeries", "past_surgeries"),
          familyHistory: pickArrayField(h as Record<string, unknown>, "familyHistory", "family_history").length
            ? pickArrayField(h as Record<string, unknown>, "familyHistory", "family_history")
            : pickArrayField(medicalHistory, "familyHistory", "family_history"),
          pastIllnesses: pickArrayField(h as Record<string, unknown>, "pastIllnesses", "past_illnesses").length
            ? pickArrayField(h as Record<string, unknown>, "pastIllnesses", "past_illnesses")
            : pickArrayField(medicalHistory, "pastIllnesses", "past_illnesses"),
          vaccinations: pickArrayField(h as Record<string, unknown>, "vaccinations").length
            ? pickArrayField(h as Record<string, unknown>, "vaccinations")
            : pickArrayField(medicalHistory, "vaccinations"),
          substanceAbuse: pickArrayField(h as Record<string, unknown>, "substanceAbuse", "substance_abuse").length
            ? pickArrayField(h as Record<string, unknown>, "substanceAbuse", "substance_abuse")
            : pickArrayField(medicalHistory, "substanceAbuse", "substance_abuse")
        }
      })

    setHealthHistory(records)
  } catch (err) {
    console.error("Failed to load health history:", err)
    showError("Failed to load health history")
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
    setSymptomEntries(parseHealthInfoSymptoms(record.symptoms))

    setSelectedRecord(record)
    setCurrentHealthInfoId(record.id)

    setBloodType(normalizePatientBloodTypeForSelect(record.bloodType || patientInfoDefaults.bloodType || ""))

    setDrugAllergies(chooseNonEmpty(record.drugAllergies || [], patientInfoDefaults.drugAllergies))
    setFoodAllergies(chooseNonEmpty(record.foodAllergies || [], patientInfoDefaults.foodAllergies))
    setOtherAllergies(chooseNonEmpty(record.otherAllergies || [], patientInfoDefaults.otherAllergies))

    setChronicConditions(chooseNonEmpty(record.chronicConditions || [], patientInfoDefaults.chronicConditions))
    setPastSurgeries(chooseNonEmpty(record.pastSurgeries || [], patientInfoDefaults.pastSurgeries))
    setFamilyHistory(chooseNonEmpty(record.familyHistory || [], patientInfoDefaults.familyHistory))
    setPastIllnesses(chooseNonEmpty(record.pastIllnesses || [], patientInfoDefaults.pastIllnesses))
    setVaccinations(chooseNonEmpty(record.vaccinations || [], patientInfoDefaults.vaccinations))
    setSubstanceAbuse(chooseNonEmpty(record.substanceAbuse || [], patientInfoDefaults.substanceAbuse))
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
    setBloodType(PATIENT_BLOOD_TYPE_UNSET)
    setSymptomEntries([createEmptySymptomEntry()])
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

    try {
      const mainVitalErrs = vitalMainFormErrorMessages({
        height,
        weight,
        bpSys,
        bpDia,
        heartRate,
        respiratoryRate,
        temperature,
        spo2,
      })
      if (mainVitalErrs.length) {
        showError(formatVitalValidationErrorToast(mainVitalErrs))
        return
      }

      const bloodTypePayload = bloodTypeForApiPayload(bloodType)
      const payload = {
        height: height ? parseFloat(height) : undefined,
        weight: weight ? parseFloat(weight) : undefined,
        bloodPressureSys: bpSys ? parseInt(bpSys, 10) : undefined,
        bloodPressureDia: bpDia ? parseInt(bpDia, 10) : undefined,
        heartRate: heartRate ? parseInt(heartRate, 10) : undefined,
        respiratoryRate: respiratoryRate ? parseInt(respiratoryRate, 10) : undefined,
        temperature: temperature ? parseFloat(temperature) : undefined,
        spo2: spo2 ? parseInt(spo2, 10) : undefined,
        ...(bloodTypePayload !== undefined ? { bloodType: bloodTypePayload } : {}),
        currentSymptoms: symptomsSerialized,
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
        showSuccess("Health record updated successfully.")
      } else {
        await doctorService.createHealthInfo(patientId, payload)
        showSuccess("Health record created successfully.")
      }

      setIsEditing(false)
      setIsAdding(false)
      await loadHealthInfo()
      await loadHealthHistory()
    } catch (err: any) {
      showError(err?.message || "Failed to save health information")
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
    <>
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
              {mode === "doctor" ? (
                <Button
                  type="button"
                  className="btn-outline"
                  disabled={!canAddToMedicalRecord}
                  onClick={() => void handleAddTrackingSlipToMedicalRecord()}
                >
                  {addingTrackingSlip ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add to Medical record
                </Button>
              ) : null}
              <Button type="button" className="btn-gradient" onClick={handleSavePdfFromPreview}>
                <FileDown className="h-4 w-4 mr-2" />
                Save / Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="records" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="records">{t("patient.healthInfo.tabRecords")}</TabsTrigger>
            <TabsTrigger value="charts">{t("patient.healthInfo.tabCharts")}</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="mt-4">
            {(mode === "nurse" || mode === "doctor") ? (
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
                {(mode === "nurse" || mode === "doctor") ? (
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
                ) : null}
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
                        onInput={(e) => setFilters({ ...filters, date: (e.target as HTMLInputElement).value })}
                      />
                    </TableHead>

                    {/* Height */}
                    <TableHead>
                      <div className="relative">
                        <Input
                          className="h-8 text-xs text-center pr-8"
                          value={filters.height}
                          onChange={(e) => setFilters({ ...filters, height: e.target.value })}
                          onInput={(e) => setFilters({ ...filters, height: (e.target as HTMLInputElement).value })}
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
                          onInput={(e) => setFilters({ ...filters, weight: (e.target as HTMLInputElement).value })}
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
                          onInput={(e) => setFilters({ ...filters, bmi: (e.target as HTMLInputElement).value })}
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
                          onInput={(e) => setFilters({ ...filters, bloodPressure: (e.target as HTMLInputElement).value })}
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
                          onInput={(e) => setFilters({ ...filters, heartRate: (e.target as HTMLInputElement).value })}
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
                          onInput={(e) => setFilters({ ...filters, respiratoryRate: (e.target as HTMLInputElement).value })}
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
                          onInput={(e) => setFilters({ ...filters, temperature: (e.target as HTMLInputElement).value })}
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
                          onInput={(e) => setFilters({ ...filters, spo2: (e.target as HTMLInputElement).value })}
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
                          onInput={(e) => setFilters({ ...filters, symptoms: (e.target as HTMLInputElement).value })}
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

            {(mode === "nurse" || mode === "doctor") && (
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
                    className="btn-outline flex items-center gap-2"
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
                    className="btn-outline flex items-center gap-2"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    onClick={handleCopyRecord}
                    disabled={!selectedRecord || !allowHealthWrites}
                    className="btn-outline flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Inherit
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!isEditing || saving || !allowHealthWrites}
                    className="btn-gradient flex items-center gap-2"
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
                        showSuccess("Health record confirmed successfully.")
                        setSelectedRecord(null)
                        await loadHealthHistory()
                      } catch (err: any) {
                        showError(err?.message || "Failed to confirm health record")
                      }
                    }}
                    disabled={!canConfirmSelected || !allowHealthWrites}
                    className="!bg-[#16a34a] hover:bg-green-700 text-white"
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
                    className="btn-outline flex items-center gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
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
                    <div className="flex-1 min-w-0 space-y-0">
                      <Input
                        id="bpSys"
                        value={bpSys}
                        onChange={(e) => setBpSys(e.target.value)}
                        onInput={(e) => setBpSys((e.target as HTMLInputElement).value)}
                        onBlur={(e) => setBpSys(e.target.value)}
                        disabled={!isEditing || !allowHealthWrites}
                      />
                      <VitalWarning message={vitalNumericError("bpSys", bpSys)} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0">
                      <Input
                        id="bpDia"
                        value={bpDia}
                        onChange={(e) => setBpDia(e.target.value)}
                        onInput={(e) => setBpDia((e.target as HTMLInputElement).value)}
                        onBlur={(e) => setBpDia(e.target.value)}
                        disabled={!isEditing || !allowHealthWrites}
                      />
                      <VitalWarning message={vitalNumericError("bpDia", bpDia)} />
                    </div>
                  </div>
                </div>

                {/* Blood Oxygen */}
                <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
                  <Label htmlFor="oxygen">Blood Oxygen (SpO2 %)</Label>
                  <Input
                    id="oxygen"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    onInput={(e) => setSpo2((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setSpo2(e.target.value)}
                    disabled={!isEditing || !allowHealthWrites}
                  />
                  <VitalWarning message={vitalNumericError("spo2", spo2)} />
                </div>

                {/* Temperature */}
                <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
                  <Label htmlFor="temperature">Body Temperature (°C)</Label>
                  <Input
                    id="temperature"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    onInput={(e) => setTemperature((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setTemperature(e.target.value)}
                    disabled={!isEditing || !allowHealthWrites}
                  />
                  <VitalWarning message={vitalNumericError("temperature", temperature)} />
                </div>

                {/* Height */}
                <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    onInput={(e) => setHeight((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setHeight(e.target.value)}
                    disabled={!isEditing || !allowHealthWrites}
                    type="number"
                  />
                  <VitalWarning message={vitalNumericError("height", height)} />
                </div>

                {/* Respiratory Rate */}
                <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
                  <Label htmlFor="respiratory">Respiratory Rate (breaths/min)</Label>
                  <Input
                    id="respiratory"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    onInput={(e) => setRespiratoryRate((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setRespiratoryRate(e.target.value)}
                    disabled={!isEditing || !allowHealthWrites}
                  />
                  <VitalWarning message={vitalNumericError("respiratoryRate", respiratoryRate)} />
                </div>

                {/* Weight */}
                <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input
                    id="weight"
                    value={weight}
                    disabled={!isEditing || !allowHealthWrites}
                    onChange={(e) => setWeight(e.target.value)}
                    onInput={(e) => setWeight((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setWeight(e.target.value)}
                    type="number"
                  />
                  <VitalWarning message={vitalNumericError("weight", weight)} />
                </div>

                {/* Heart Rate */}
                <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
                  <Label htmlFor="heart-rate">Heart Rate (bpm)</Label>
                  <Input
                    id="heart-rate"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    onInput={(e) => setHeartRate((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setHeartRate(e.target.value)}
                    disabled={!isEditing || !allowHealthWrites}
                  />
                  <VitalWarning message={vitalNumericError("heartRate", heartRate)} />
                </div>

                {/* BMI */}
                <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
                  <Label htmlFor="bmi">BMI</Label>
                  <Input id="bmi" value={bmi} disabled />
                </div>

                {/* Blood Type */}
                <div className="space-y-2">
                  <Label>Blood Type</Label>
                  <Select value={bloodType} onValueChange={setBloodType} disabled={!isEditing || !allowHealthWrites}>
                    <SelectTrigger>
                      <div className="text-sm font-normal bg-background text-muted-foreground">
                        <SelectValue placeholder="Select blood type" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {PATIENT_BLOOD_TYPES.map((bt) => (
                        <SelectItem key={bt} value={bt}>
                          {bt}
                        </SelectItem>
                      ))}
                      <SelectItem value={PATIENT_BLOOD_TYPE_UNSET}>Not specified</SelectItem>
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
              title={t("patient.healthInfo.sections.symptoms.title")}
              icon={<Heart className="h-5 w-5" />}
              description={t("patient.healthInfo.sections.symptoms.description")}
              defaultOpen={true}
            >
              <div className="space-y-3">
                <PatientSymptomEntriesEditor
                  entries={symptomEntries}
                  onChange={setSymptomEntries}
                  disabled={!isEditing || !allowHealthWrites}
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
          </TabsContent>

          <TabsContent value="charts" className="mt-4">
            <Card className="border-slate-200/80 shadow-sm">
              <PatientHealthChartsHeader selectedCount={selectedRecords.length} />
              <CardContent>
                <PatientHealthChartsPanel chartData={chartData} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>
      <PauseableCornerToastPortal
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </>
  )
}