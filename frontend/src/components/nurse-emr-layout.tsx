import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { NurseLayout } from "./nurse-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEffect, useState } from "react"
import { LogIn } from "lucide-react"
import ViewingPatientDashboard from "@/pages/nurse/medical_records/dashboard"
import ViewingPatientHealthInfo from "@/pages/nurse/medical_records/health-info"
import { NurseCheckInDialog } from "@/components/nurse-check-in-dialog"
import { doctorService } from "@/services/doctor-service"
import { NursePatientProfilePanel } from "@/pages/nurse/medical_records/patient-profile"
import { translatePatientInDepartment } from "@/lib/patient-departments"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
const VISIT_STORAGE_PREFIX = "nurseExamVisit:"

type StoredVisit = { startedAt: string; appointmentId?: number; regimenId?: number }

function readStoredVisit(patientKey: string | undefined): StoredVisit | null {
  if (!patientKey) return null
  try {
    const raw = sessionStorage.getItem(VISIT_STORAGE_PREFIX + patientKey)
    if (!raw) return null
    const p = JSON.parse(raw) as StoredVisit
    if (p?.startedAt && typeof p.startedAt === "string") {
      return {
        startedAt: p.startedAt,
        appointmentId: typeof p.appointmentId === "number" ? p.appointmentId : undefined,
        regimenId: typeof p.regimenId === "number" ? p.regimenId : undefined,
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeStoredVisit(patientKey: string, visit: StoredVisit | null) {
  if (!visit) sessionStorage.removeItem(VISIT_STORAGE_PREFIX + patientKey)
  else sessionStorage.setItem(VISIT_STORAGE_PREFIX + patientKey, JSON.stringify(visit))
}

const tabs = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Health info", value: "health-info" },
  { label: "Profile", value: "profile" },
]

type TodayAppointment = {
  appointmentId: number
  timeDisplay: string
  checkedIn: boolean
  roomId: number | null
  roomName: string
}

type PatientHeader = {
  patientPk?: number | null
  todayAppointment?: TodayAppointment | null
  lastName?: string
  firstName?: string
  age?: number | string
  gender?: string
  bmi?: number | string | null
  latestDiagnosis?: { icd10?: string; interpretation?: string } | null
  inDepartment?: string | null
  in_department?: string | null
}

export function NurseEmrLayout() {
  const navigate = useNavigate()
  const { tab = "dashboard", patientId } = useParams()
  const { t } = useTranslation()
  const [patientData, setPatientData] = useState<PatientHeader | null>(null)
  const [visitSession, setVisitSession] = useState<StoredVisit | null>(() => readStoredVisit(patientId))
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false)
  const [checkInPatientPk, setCheckInPatientPk] = useState<number | null>(null)
  const [checkInAppointmentId, setCheckInAppointmentId] = useState<number | null>(null)
  const [checkInAppointmentTime, setCheckInAppointmentTime] = useState<string | null>(null)
  const [checkInRoomName, setCheckInRoomName] = useState<string | null>(null)

  const openCheckInDialog = () => {
    const appt = patientData?.todayAppointment
    setCheckInPatientPk(patientData?.patientPk ?? null)
    setCheckInAppointmentId(appt?.appointmentId ?? null)
    setCheckInAppointmentTime(appt?.timeDisplay ?? null)
    setCheckInRoomName(appt?.roomName ?? null)
    setCheckInDialogOpen(true)
  }

  const closeCheckInDialog = () => {
    setCheckInDialogOpen(false)
    setCheckInPatientPk(null)
    setCheckInAppointmentId(null)
    setCheckInAppointmentTime(null)
    setCheckInRoomName(null)
  }

  const setActiveTab = (value: string) => {
    if (!patientId) return
    navigate(`/nurse/medical_records/${patientId}/${value}`)
  }

  /** Legacy URL /nurse/medical_records/:id/history → patient profile */
  useEffect(() => {
    if (tab === "history" && patientId) {
      navigate(`/nurse/medical_records/${patientId}/profile`, { replace: true })
    }
  }, [tab, patientId, navigate])

  useEffect(() => {
    setVisitSession(readStoredVisit(patientId))
  }, [patientId])

  /** Doctor closes visit via Finish examination — clear local session when regimen is no longer open. */
  useEffect(() => {
    if (!patientId || visitSession?.regimenId == null) return

    const sync = async () => {
      try {
        const r = await doctorService.getActiveRegimen(patientId)
        if (!r.success || r.active == null) {
          writeStoredVisit(patientId, null)
          setVisitSession(null)
          return
        }
        if (r.active.regimenId !== visitSession.regimenId) {
          writeStoredVisit(patientId, null)
          setVisitSession(null)
        }
      } catch {
        /* ignore transient errors */
      }
    }

    void sync()
    const id = window.setInterval(() => void sync(), 15000)
    return () => window.clearInterval(id)
  }, [patientId, visitSession?.regimenId])

  useEffect(() => {
    const fetchPatient = async () => {
      if (!patientId) return
      try {
        const res = await fetch(`${API_BASE_URL}/api/doctor/patients/${patientId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          },
        })
        const data = await res.json()
        if (data.success) {
          const p = data.patient as PatientHeader
          setPatientData(p)
        }
      } catch (err) {
        console.error(err)
      }
    }
    void fetchPatient()
  }, [patientId])

  return (
    <NurseLayout>
      <NurseCheckInDialog
        open={checkInDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCheckInDialog()
          else setCheckInDialogOpen(true)
        }}
        patientIdParam={patientId}
        hintPatientPk={checkInPatientPk}
        hintAppointmentId={checkInAppointmentId}
        hintTimeDisplay={checkInAppointmentTime}
        hintRoomName={checkInRoomName}
        onSuccess={({ appointmentId, startedAt, regimenId }) => {
          if (!patientId) return
          const next: StoredVisit = { startedAt, appointmentId, regimenId }
          writeStoredVisit(patientId, next)
          setVisitSession(next)
          setPatientData((prev) =>
            prev?.todayAppointment
              ? { ...prev, todayAppointment: { ...prev.todayAppointment, checkedIn: true } }
              : prev
          )
        }}
      />

      <div className="space-y-6 w-full">
        {/* ===== Patient Info Header ===== */}
        <Card className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-r border-white/40 sticky bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
          <div>
            {patientData ? (
              <>
                <p className="font-semibold text-lg">
                  {patientData.lastName} {patientData.firstName} | {patientData.age}{" "}
                  {patientData.gender === "M" ? "Male" : "Female"} | BMI: {patientData.bmi ?? "N/A"}
                </p>
                {patientData.latestDiagnosis && (
                  <p className="text-sm text-slate-600">
                    Diagnosis: {patientData.latestDiagnosis.icd10 || "—"} -{" "}
                    {patientData.latestDiagnosis.interpretation || "—"}
                  </p>
                )}
                <p className="text-sm text-slate-500">
                  {t("doctor.patients.department")}:{" "}
                  {translatePatientInDepartment(patientData.inDepartment || patientData.in_department, t)}
                </p>
              </>
            ) : (
              <p className="font-semibold text-lg">Loading patient...</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={
                  !patientId ||
                  !!visitSession ||
                  Boolean(patientData?.todayAppointment?.checkedIn)
                }
                onClick={openCheckInDialog}
                className="!bg-emerald-600 hover:!bg-emerald-700 text-white transition-transform duration-500 text-lg px-6 py-4 flex items-center gap-2"
              >
                <LogIn className="h-4 w-4 shrink-0" />
                Check-in
              </Button>
            </div>
            {visitSession && (
              <p className="text-xs text-slate-500 max-w-md text-right">
                Visit in progress · started {new Date(visitSession.startedAt).toLocaleString("vi-VN")}
              </p>
            )}
          </div>
        </Card>

        {/* ===== Tabs (same pattern as doctor-emr-layout: tabs then child page below) ===== */}
        <div className="sticky z-10 bg-white rounded-md w-fit">
          <Tabs value={tab} onValueChange={setActiveTab}>
            <TabsList className="inline-flex rounded-xl bg-tr p-1 gap-1">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="
                    tabs-trigger gap-2 h-7 transition duration-500
                  "
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
          {tab === "profile" && <NursePatientProfilePanel />}
        </div>
      </div>
    </NurseLayout>
  )
}
