import { useNavigate, useParams } from "react-router-dom"
<<<<<<< HEAD
import { useEffect, useState } from "react"
=======
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DoctorLayout } from "./doctor-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
<<<<<<< HEAD
import { Loader2 } from "lucide-react"
=======
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)
import ViewingPatientDashboard from "@/doctor/medical_records/dashboard"
import ViewingPatientHealthInfo from "@/doctor/medical_records/health-info"
import PatientPrescription from "@/doctor/medical_records/prescription"
import PatientDiagnosis from "@/doctor/medical_records/diagnosis"
import PatientSurgery from "@/doctor/medical_records/surgery"
import PatientLab from "@/doctor/medical_records/lab"
<<<<<<< HEAD
import { doctorService, type PatientDetail } from "@/services/doctor-service"
=======
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)

const tabs = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Health info", value: "health-info" },
  { label: "Laboratory", value: "lab" },
  { label: "Diagnosis", value: "diagnosis" },
  { label: "Surgery", value: "surgery" },
  { label: "Prescription", value: "prescription" },
  { label: "History", value: "history" },
]

export function DoctorLayout2() {
  const navigate = useNavigate()
  const { tab = "dashboard", patientId } = useParams()
<<<<<<< HEAD
  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!patientId) return
    setLoading(true)
    doctorService.getPatient(patientId)
      .then(res => setPatient(res.patient))
      .catch(() => setPatient(null))
      .finally(() => setLoading(false))
  }, [patientId])
=======
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)

  const setActiveTab = (value: string) => {
    navigate(`/doctor/medical_records/${patientId}/${value}`)
  }

<<<<<<< HEAD
  // Derive display values from patient data
  const fullName = patient
    ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") || patient.username
    : "—"
  const age = patient?.age ?? null
  const gender = patient?.gender || "—"
  const bmi = patient?.bmi ?? "—"
  const latestDiagnosis = patient?.latestDiagnosis
    ? `${patient.latestDiagnosis.icd10 || ""} – ${patient.latestDiagnosis.interpretation || ""}`.replace(/^ – /, "").replace(/ – $/, "") || "No diagnosis"
    : "No diagnosis"
  const department = patient?.latestDiagnosis?.department || "—"

=======
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)
  return (
    <DoctorLayout>
      <div className="space-y-6 w-full">
        {/* ===== Patient Info Header ===== */}
        <Card className="p-4 flex items-center justify-between border-r border-white/40 sticky bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
<<<<<<< HEAD
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading patient info…
            </div>
          ) : patient ? (
            <div>
              <p className="font-semibold text-lg">
                {fullName} – {patient.username} | {age !== null ? `${age} ` : ""}{gender}{bmi !== "—" ? ` | BMI: ${bmi}` : ""}
              </p>
              <p className="text-sm text-slate-600">
                Diagnosis: {latestDiagnosis}
              </p>
              <p className="text-sm text-slate-500">
                Department: {department}
              </p>
            </div>
          ) : (
            <p className="text-sm text-red-500">Patient not found</p>
          )}
=======
          <div>
            <p className="font-semibold text-lg">
              Nguyen Van An – OP123456789 | 46 Male | BMI: 25.77
            </p>
            <p className="text-sm text-slate-600">
              Diagnosis: Z59.1 – Housing & economic problems
            </p>
            <p className="text-sm text-slate-500">
              Department: Cardiology
            </p>
          </div>
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)

          <div className="flex gap-2">
            <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4">+ Add Follow-up Appointment</Button>
            <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
              Finish Examination
            </Button>
          </div>
        </Card>

<<<<<<< HEAD
        {/* ===== Tabs ===== */}
=======
        {/* ===== Tabs (GIỐNG LOGIN) ===== */}
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)
        <div className="sticky z-10 bg-white rounded-md w-fit">
          <Tabs value={tab} onValueChange={setActiveTab}>
            <TabsList className="inline-flex rounded-xl bg-tr p-1 gap-1">
              {tabs.map(t => (
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
          {tab === "prescription" && <PatientPrescription />}
          {tab === "diagnosis" && <PatientDiagnosis />}
          {tab === "surgery" && <PatientSurgery />}
          {tab === "lab" && <PatientLab />}
        </div>
      </div>
    </DoctorLayout>
  )
}
export { DoctorLayout }

