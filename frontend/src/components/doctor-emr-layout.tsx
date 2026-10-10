import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowRightLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ViewingPatientDashboard from "@/pages/doctor/medical-records/dashboard"
import ViewingPatientHealthInfo from "@/pages/doctor/medical-records/health-info"
import PatientPrescription from "@/pages/doctor/medical-records/prescription"
import PatientDiagnosis from "@/pages/doctor/medical-records/diagnosis"
import PatientSurgery from "@/pages/doctor/medical-records/surgery"
import PatientLab from "@/pages/doctor/medical-records/lab"
import DoctorPatientHistoryPage from "@/pages/doctor/medical-records/history"
import { EmrSessionProvider } from "@/contexts/emr-session-context"
import { doctorService, type DepartmentOption, type PatientDetail } from "@/services/doctor-service"
import { usePauseableToast } from "@/hooks/use-pauseable-toast"
import { translatePatientInDepartment } from "@/lib/patient-departments"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import { usePdfPreview } from "@/components/pdf-preview-dialog"
import { ClinicTransferDialog } from "./doctor-emr/clinic-transfer-dialog"
import { EMR_PRESCRIPTION_SAVED_EVENT, FinishExaminationDialog } from "./doctor-emr/finish-examination-dialog"
import { DoctorLayout } from "./doctor-layout"

const tabs = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Health info", value: "health-info" },
  { label: "Laboratory", value: "lab" },
  { label: "Diagnosis", value: "diagnosis" },
  { label: "Surgery", value: "surgery" },
  { label: "Prescription", value: "prescription" },
  { label: "History", value: "history" },
]

const EMR_PRESCRIPTION_DRAFT_STATE_EVENT = "emr:prescription-draft-state"

export function DoctorEmrLayout() {
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const navigate = useNavigate()
  const { tab = "dashboard", patientId = "" } = useParams()
  const { t } = useTranslation()
  const pdf = usePdfPreview(showError)

  const setActiveTab = (value: string) => {
    navigate(`/doctor/medical_records/${patientId}/${value}`)
  }
  const [loading, setLoading] = useState(true)
  const [patientData, setPatientData] = useState<PatientDetail | null>(null)
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([])
  const [visitLoading, setVisitLoading] = useState(true)
  const [visitActive, setVisitActive] = useState(false)
  const [checkInRoom, setCheckInRoom] = useState<{ id: number; name: string } | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  /** New key per open: the finish wizard starts from a fresh form. */
  const [finishRun, setFinishRun] = useState(0)
  const [hasUnsavedPrescriptionDraft, setHasUnsavedPrescriptionDraft] = useState(false)

  const loadVisitState = useCallback(async () => {
    if (!patientId) {
      setVisitLoading(false)
      setVisitActive(false)
      setCheckInRoom(null)
      return
    }
    setVisitLoading(true)
    try {
      const r = await doctorService.getActiveRegimen(patientId)
      setVisitActive(Boolean(r.success && r.active))
      const roomId = r.success && r.checkInRoom ? Number(r.checkInRoom.id) : NaN
      setCheckInRoom(
        Number.isFinite(roomId) && roomId > 0
          ? { id: roomId, name: String(r.checkInRoom?.name || "").trim() || `Room #${roomId}` }
          : null,
      )
    } catch {
      setVisitActive(false)
      setCheckInRoom(null)
    } finally {
      setVisitLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    void loadVisitState()
  }, [loadVisitState])

  const loadPatient = useCallback(async () => {
    if (!patientId) return
    try {
      setLoading(true)
      const res = await doctorService.getPatient(patientId)
      setPatientData(res.success && res.patient ? res.patient : null)
    } catch (err) {
      console.error(err)
      setPatientData(null)
    } finally {
      setLoading(false)
    }
  }, [patientId])

  const refreshPatientBanner = useCallback(() => {
    void loadPatient()
  }, [loadPatient])

  const emrSessionValue = useMemo(
    () => ({
      visitLoading,
      visitActive,
      mutationsAllowed: !visitLoading && visitActive,
      refreshPatientBanner,
    }),
    [visitLoading, visitActive, refreshPatientBanner]
  )

  useEffect(() => {
    void loadPatient()
  }, [loadPatient])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await doctorService.getDepartments()
        if (!cancelled) setDepartmentOptions(Array.isArray(r.departments) ? r.departments : [])
      } catch (e) {
        if (!cancelled) {
          setDepartmentOptions([])
          console.error(e)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setHasUnsavedPrescriptionDraft(false)
    if (!patientId) return
    const forThisPatient = (evt: Event) => {
      const detail = (evt as CustomEvent<{ patientId?: string; hasUnsavedChanges?: boolean }>).detail
      return detail && String(detail.patientId || "") === String(patientId) ? detail : null
    }
    const onDraftState = (evt: Event) => {
      const detail = forThisPatient(evt)
      if (detail) setHasUnsavedPrescriptionDraft(Boolean(detail.hasUnsavedChanges))
    }
    const onPrescriptionSaved = (evt: Event) => {
      if (forThisPatient(evt)) setHasUnsavedPrescriptionDraft(false)
    }
    window.addEventListener(EMR_PRESCRIPTION_DRAFT_STATE_EVENT, onDraftState)
    window.addEventListener(EMR_PRESCRIPTION_SAVED_EVENT, onPrescriptionSaved)
    return () => {
      window.removeEventListener(EMR_PRESCRIPTION_DRAFT_STATE_EVENT, onDraftState)
      window.removeEventListener(EMR_PRESCRIPTION_SAVED_EVENT, onPrescriptionSaved)
    }
  }, [patientId])

  const afterDocumentSaved = useCallback(async () => {
    refreshPatientBanner()
    await loadVisitState()
  }, [refreshPatientBanner, loadVisitState])

  const openFinishExamination = () => {
    if (!patientId) return
    if (hasUnsavedPrescriptionDraft) {
      showError("Đơn thuốc đang có thay đổi chưa lưu. Vui lòng Save hoặc hủy draft trước khi Finish examination.")
      return
    }
    setFinishRun((n) => n + 1)
    setFinishOpen(true)
  }

  const renderHeader = () => {
    if (loading) return "Loading patient..."
    if (!patientData) return "Patient not found"
    const { firstName, lastName, age, gender, bmi, latestDiagnosis } = patientData

    const deptLabel =
      patientData.inDepartment?.trim() ||
      latestDiagnosis?.department?.trim() ||
      null

    return (
      <div>
        <p className="font-semibold text-lg">
          {lastName} {firstName} | {age} {gender === "M" ? "Male" : "Female"} | BMI: {bmi ?? "N/A"}
        </p>
        {latestDiagnosis && (
          <p className="text-sm text-slate-600">
            Diagnosis: {latestDiagnosis.icd10 || "—"} - {latestDiagnosis.interpretation || "—"}
          </p>
        )}
        <p className="text-sm text-slate-500">
          {t("doctor.patients.department")}: {translatePatientInDepartment(deptLabel, t)}
        </p>
      </div>
    )
  }

  return (
    <EmrSessionProvider value={emrSessionValue}>
    <DoctorLayout>
      {pdf.dialog}

      <FinishExaminationDialog
        key={finishRun}
        open={finishOpen}
        onOpenChange={setFinishOpen}
        patientId={patientId}
        patient={patientData}
        departments={departmentOptions}
        pdf={pdf}
        onDocumentSaved={afterDocumentSaved}
        onVisitClosed={loadVisitState}
        showError={showError}
        showSuccess={showSuccess}
      />

      <ClinicTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        patientId={patientId}
        checkInRoom={checkInRoom}
        visitLoading={visitLoading}
        onTransferred={afterDocumentSaved}
        showError={showError}
        showSuccess={showSuccess}
      />

      <div className="space-y-6 w-full">
        {!visitLoading && patientId && !visitActive && patientData ? (
          <Alert variant="default" className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This patient is not checked in yet (no active visit). You can review records; saving diagnosis, labs,
              prescriptions, and other clinical data is disabled until the nurse completes check-in.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* ===== Patient Info Header ===== */}
        <Card className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-r border-white/40 sticky bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
          {renderHeader()}

          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="btn-outline transition-transform duration-500 text-base px-5 py-3 gap-1"
              onClick={() => void loadVisitState().finally(() => setTransferOpen(true))}
              disabled={!emrSessionValue.mutationsAllowed}
              title={!emrSessionValue.mutationsAllowed ? "Available after nurse check-in" : undefined}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Transfer clinic
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="btn-outline transition-transform duration-500 text-base px-5 py-3"
              disabled={!patientId || loading || !patientData || !visitActive || hasUnsavedPrescriptionDraft}
              title={
                hasUnsavedPrescriptionDraft
                  ? "Save hoặc hủy draft đơn thuốc trước khi Finish examination"
                  : !visitActive
                  ? "No active visit to close"
                  : "Closes the open encounter (regimen) for this patient"
              }
              onClick={openFinishExamination}
            >
              Finish examination
            </Button>
          </div>
        </Card>

        {/* ===== Tabs ===== */}
        <div className="sticky z-10 bg-white rounded-md w-fit">
          <Tabs value={tab} onValueChange={setActiveTab}>
            <TabsList className="inline-flex rounded-xl bg-tr p-1 gap-1">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="tabs-trigger gap-2 h-7 transition duration-500"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* ===== Tab Content ===== */}
        <div>
          {tab === "dashboard" && <ViewingPatientDashboard />}
          {tab === "health-info" && <ViewingPatientHealthInfo />}
          {tab === "prescription" && <PatientPrescription />}
          {tab === "diagnosis" && <PatientDiagnosis />}
          {tab === "surgery" && <PatientSurgery />}
          {tab === "lab" && <PatientLab />}
          {tab === "history" && <DoctorPatientHistoryPage />}
        </div>
      </div>
      <PauseableCornerToastPortal
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </DoctorLayout>
    </EmrSessionProvider>
  )
}
