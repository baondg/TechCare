"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PatientLayout } from "@/components/patient-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Activity, Heart, AlertCircle, FileText, Save, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CollapsibleSection } from "@/components/collapsible-section"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { healthInfoService } from "@/services/health-info-service"
import { vitalPayloadFromHealthInfo, HEALTH_INFO_SYMPTOMS_UPDATED_EVENT } from "@/lib/symptom-checker-persist-health"
import { useAuth } from "@/contexts/auth-context"
import { usePauseableToast } from "@/hooks/use-pauseable-toast"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import {
  PATIENT_BLOOD_TYPES,
  PATIENT_BLOOD_TYPE_UNSET,
  normalizePatientBloodTypeForSelect,
} from "@/lib/patient-blood-types"
import { PatientHealthChartsHeader, PatientHealthChartsPanel } from "@/components/patient-health-charts"
import { buildHealthChartData } from "@/lib/health-chart-data"
import { PatientSymptomEntriesEditor } from "@/components/patient-symptom-entries-editor"
import {
  createEmptySymptomEntry,
  parseHealthInfoSymptoms,
  serializeSymptomEntries,
  type SymptomEntry,
} from "@/lib/health-info-symptoms"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"

function ReadOnlyList({
  label,
  values,
  emptyLabel,
}: {
  label: string
  values: string[]
  emptyLabel: string
}) {
  const items = values.filter((v) => v.trim())
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((v, i) => (
            <Badge key={`${label}-${i}`} variant="secondary" className="font-normal">
              {v}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HealthInfoPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const { user } = useAuth()
  const { toast, isExiting, showSuccess, showError, dismiss, onMouseEnter, onMouseLeave } =
    usePauseableToast(2600)

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
  }

  // Loading states
  const [loading, setLoading] = useState(true)
  const [savingSymptoms, setSavingSymptoms] = useState(false)
  const [symptomsBaseline, setSymptomsBaseline] = useState("")
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

  // Current health info ID for updates

  const bmi = useMemo(() => {
    const h = parseFloat(height)
    const w = parseFloat(weight)
    if (!h || !w || h <= 0) return "N/A"
    return (w / ((h / 100) ** 2)).toFixed(1)
  }, [height, weight])

  const [healthHistory, setHealthHistory] = useState<HealthRecord[]>([])

  const symptomsSerialized = useMemo(() => serializeSymptomEntries(symptomEntries), [symptomEntries])
  const symptomsDirty = symptomsSerialized !== symptomsBaseline

  const mapApiHealthStatus = (s: unknown): HealthRecord["status"] => {
    const raw = String(s ?? "").toLowerCase()
    if (raw === "confirmed" || raw === "signed") return "confirmed"
    return "draft"
  }
  
  const toArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
    if (typeof value === "string" && value.trim()) return [value]
    return []
  }

  const chartData = useMemo(() => buildHealthChartData(healthHistory), [healthHistory])

  // Load health info on mount / when returning to this page
  const hasLoadedOnceRef = useRef(false)

  useEffect(() => {
    if (!user?.id || location.pathname !== "/patient/health-info") return

    void loadHealthInfo({ silent: hasLoadedOnceRef.current })
    void loadHealthHistory()
    hasLoadedOnceRef.current = true
  }, [user?.id, location.pathname])

  useEffect(() => {
    const onSymptomsUpdated = () => {
      if (!user?.id) return
      void loadHealthInfo({ silent: true })
      void loadHealthHistory()
    }

    window.addEventListener(HEALTH_INFO_SYMPTOMS_UPDATED_EVENT, onSymptomsUpdated)
    return () => window.removeEventListener(HEALTH_INFO_SYMPTOMS_UPDATED_EVENT, onSymptomsUpdated)
  }, [user?.id])

  const loadHealthInfo = async (options?: { silent?: boolean }) => {
    if (!user?.id) return

    if (!options?.silent) setLoading(true)
    dismiss()

    try {
      const result = await healthInfoService.getHealthInfo()
      if (result.success && result.healthInfo) {
        const info = result.healthInfo as any
        const allergicInfo = info.allergic_info || info.allergicInfo || {}
        const medicalHistory = info.medical_history || info.medicalHistory || {}

        setHeight(info.height?.toString() || "")
        setWeight(info.weight?.toString() || "")
        setBpSys(info.bloodPressureSys?.toString() || "")
        setBpDia(info.bloodPressureDia?.toString() || "")
        setHeartRate(info.heartRate?.toString() || "")
        setRespiratoryRate(info.respiratoryRate?.toString() || "")
        setTemperature(info.temperature?.toString() || "")
        setSpo2(info.spo2?.toString() || "")
        setBloodType(normalizePatientBloodTypeForSelect(info.bloodType))
        const loadedSymptoms = info.currentSymptoms || ""
        setSymptomsBaseline(loadedSymptoms)
        setSymptomEntries(parseHealthInfoSymptoms(loadedSymptoms))
        
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
        showError(result.error || t("patient.healthInfo.loadFailed"))
      }
    } catch (err) {
      console.error("Failed to load health info:", err)
      showError(t("patient.healthInfo.loadFailed"))
    } finally {
      if (!options?.silent) setLoading(false)
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
            updatedBy: h.updatedBy || "Patient",
            status: mapApiHealthStatus(h.status),
          }))
          // 🔥 SORT MỚI NHẤT LÊN ĐẦU
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        setHealthHistory(records)
      } else if (result.error) {
        showError(result.error)
      }
    } catch (err) {
      console.error("Failed to load health history:", err)
      showError(t("patient.healthInfo.loadHistoryFailed"))
    }
  }

  const handleSaveSymptoms = async () => {
    setSavingSymptoms(true)
    dismiss()

    try {
      const info = await healthInfoService.getHealthInfo()
      if (!info.success || !info.healthInfo) {
        showError(info.error || t("patient.healthInfo.loadFailed"))
        return
      }

      const hi = info.healthInfo
      const payload = {
        ...vitalPayloadFromHealthInfo(hi, symptomsSerialized),
        updatedBy: "Patient",
      }

      const recordId = hi.id
      const isDraft = hi.status !== "confirmed"
      let result
      if (recordId != null && Number.isFinite(Number(recordId)) && isDraft) {
        result = await healthInfoService.updateHealthInfo(Number(recordId), payload)
      } else {
        result = await healthInfoService.createHealthInfo(payload)
      }

      if (result.success) {
        showSuccess(t("patient.healthInfo.saveSuccess"))
        setSymptomsBaseline(symptomsSerialized)
        await loadHealthInfo({ silent: true })
        await loadHealthHistory()
      } else {
        showError(result.error || t("patient.healthInfo.saveFailed"))
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("patient.healthInfo.saveFailed")
      showError(message)
    } finally {
      setSavingSymptoms(false)
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

  const cornerToast = (
    <PauseableCornerToastPortal
      toast={toast}
      isExiting={isExiting}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  )

  if (loading) {
    return (
      <PatientLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600 mx-auto mb-4" />
            <p className="text-slate-600">{t("patient.healthInfo.loading")}</p>
          </div>
        </div>
        {cornerToast}
      </PatientLayout>
    )
  }

  return (
    <PatientLayout>
      <div className="space-y-6 px-3 pt-2 md:px-4 md:pt-3 lg:px-6">
        <Tabs defaultValue="records" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="records">{t("patient.healthInfo.tabRecords")}</TabsTrigger>
            <TabsTrigger value="charts">{t("patient.healthInfo.tabCharts")}</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="mt-4 space-y-6">
            <div>
              <h3 className="text-2xl font-bold">{t("patient.healthInfo.title")}</h3>
            </div>

        {/* Alert */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("patient.healthInfo.alert")}</AlertDescription>
        </Alert>

        {/* ------------------- VITAL SIGNS ------------------- */}
        <CollapsibleSection
          title={t("patient.healthInfo.sections.vitalSigns.title")}
          icon={<Activity className="h-5 w-5" />}
          description={t("patient.healthInfo.sections.vitalSigns.description")}
          defaultOpen={true}
        >
          <div className="grid gap-4 md:grid-cols-2">

            {/* Blood Pressure */}
            <div className="space-y-2">
              <Label>{t("patient.healthInfo.fields.bloodPressure")}</Label>
              <div className="flex gap-2 text-sm font-normal bg-background text-muted-foreground">
                <div className="flex-1 min-w-0 space-y-0">
                  <Input id="bpSys" value={bpSys} disabled readOnly />
                </div>
                <div className="flex-1 min-w-0 space-y-0">
                  <Input id="bpDia" value={bpDia} disabled readOnly />
                </div>
              </div>
            </div>

            {/* Blood Oxygen */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="oxygen">{t("patient.healthInfo.fields.spo2")}</Label>
              <Input id="oxygen" value={spo2} disabled readOnly />
            </div>

            {/* Temperature */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="temperature">{t("patient.healthInfo.fields.temperature")}</Label>
              <Input id="temperature" value={temperature} disabled readOnly />
            </div>

            {/* Height */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="height">{t("patient.healthInfo.fields.height")}</Label>
              <Input id="height" value={height} disabled readOnly type="number" />
            </div>

            {/* Respiratory Rate */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="respiratory">{t("patient.healthInfo.fields.respiratory")}</Label>
              <Input id="respiratory" value={respiratoryRate} disabled readOnly />
            </div>

            {/* Weight */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="weight">{t("patient.healthInfo.fields.weight")}</Label>
              <Input id="weight" value={weight} disabled readOnly type="number" />
            </div>

            {/* Heart Rate */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="heart-rate">{t("patient.healthInfo.fields.heartRate")}</Label>
              <Input id="heart-rate" value={heartRate} disabled readOnly />
            </div>

            {/* BMI */}
            <div className="space-y-2 text-sm font-normal bg-background text-muted-foreground">
              <Label htmlFor="bmi">{t("patient.healthInfo.fields.bmi")}</Label>
              <Input id="bmi" value={bmi} disabled />
            </div>

            {/* Blood Type */}
            <div className="space-y-2 ">
              <Label>{t("patient.healthInfo.fields.bloodType")}</Label>
              <Select value={bloodType} disabled>
                <SelectTrigger>
                <div className="text-sm font-normal bg-background text-muted-foreground">
                    <SelectValue placeholder={t("patient.healthInfo.bloodTypePlaceholder")} />
                </div>
                </SelectTrigger>
                <SelectContent>
                  {PATIENT_BLOOD_TYPES.map((bt) => (
                    <SelectItem key={bt} value={bt}>
                      {bt}
                    </SelectItem>
                  ))}
                  <SelectItem value={PATIENT_BLOOD_TYPE_UNSET}>
                    {t("patient.healthInfo.bloodTypeNotSpecified")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
        </CollapsibleSection>

        {/* ------------------- ALLERGIC INFORMATION ------------------- */}
        <CollapsibleSection
          title={t("patient.healthInfo.sections.allergic.title")}
          icon={<AlertCircle className="h-5 w-5" />}
          description={t("patient.healthInfo.sections.allergic.description")}
          defaultOpen={true}
        >
          <div className="space-y-4 text-sm font-normal bg-background text-muted-foreground">

            <ReadOnlyList
              label={t("patient.healthInfo.fields.drugAllergies")}
              values={drugAllergies}
              emptyLabel={t("patient.healthInfo.noneRecorded")}
            />
            <ReadOnlyList
              label={t("patient.healthInfo.fields.foodAllergies")}
              values={foodAllergies}
              emptyLabel={t("patient.healthInfo.noneRecorded")}
            />
            <ReadOnlyList
              label={t("patient.healthInfo.fields.otherAllergies")}
              values={otherAllergies}
              emptyLabel={t("patient.healthInfo.noneRecorded")}
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
            <PatientSymptomEntriesEditor entries={symptomEntries} onChange={setSymptomEntries} />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSaveSymptoms}
                disabled={savingSymptoms || !symptomsDirty}
                className="btn-gradient text-sm px-6 py-2 flex items-center gap-2"
              >
                {savingSymptoms ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("patient.healthInfo.save")}
              </Button>
            </div>
          </div>
        </CollapsibleSection>

        {/* ------------------- MEDICAL HISTORY ------------------- */}
        <CollapsibleSection
          title={t("patient.healthInfo.sections.medicalHistory.title")}
          icon={<FileText className="h-5 w-5" />}
          description={t("patient.healthInfo.sections.medicalHistory.description")}
          defaultOpen={true}
        >
          <div className="space-y-4 text-sm font-normal bg-background text-muted-foreground">

            <ReadOnlyList
              label={t("patient.healthInfo.fields.chronicConditions")}
              values={chronicConditions}
              emptyLabel={t("patient.healthInfo.noneRecorded")}
            />
            <ReadOnlyList
              label={t("patient.healthInfo.fields.pastSurgeries")}
              values={pastSurgeries}
              emptyLabel={t("patient.healthInfo.noneRecorded")}
            />
            <ReadOnlyList
              label={t("patient.healthInfo.fields.familyHistory")}
              values={familyHistory}
              emptyLabel={t("patient.healthInfo.noneRecorded")}
            />
            <ReadOnlyList
              label={t("patient.healthInfo.fields.pastIllnesses")}
              values={pastIllnesses}
              emptyLabel={t("patient.healthInfo.noneRecorded")}
            />
            <ReadOnlyList
              label={t("patient.healthInfo.fields.vaccinations")}
              values={vaccinations}
              emptyLabel={t("patient.healthInfo.noneRecorded")}
            />
            <ReadOnlyList
              label={t("patient.healthInfo.fields.substanceAbuse")}
              values={substanceAbuse}
              emptyLabel={t("patient.healthInfo.noneRecorded")}
            />

          </div>
        </CollapsibleSection>
          </TabsContent>

          <TabsContent value="charts" className="mt-4">
            <Card className="border-slate-200/80 shadow-sm">
              <PatientHealthChartsHeader selectedCount={0} />
              <CardContent>
                <PatientHealthChartsPanel chartData={chartData} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {cornerToast}
    </PatientLayout>
  )
}
