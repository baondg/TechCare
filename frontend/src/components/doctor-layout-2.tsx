import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DoctorLayout } from "./doctor-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ViewingPatientDashboard from "@/pages/doctor/medical_records/dashboard"
import ViewingPatientHealthInfo from "@/pages/doctor/medical_records/health-info"
import PatientPrescription from "@/pages/doctor/medical_records/prescription"
import PatientDiagnosis from "@/pages/doctor/medical_records/diagnosis"
import PatientSurgery from "@/pages/doctor/medical_records/surgery"
import PatientLab from "@/pages/doctor/medical_records/lab"
import { useEffect, useState } from "react"

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

  const setActiveTab = (value: string) => {
    navigate(`/doctor/medical_records/${patientId}/${value}`)
  }
  const [loading, setLoading] = useState(true)
  const [patientData, setPatientData] = useState<any>(null)

  useEffect(() => {
    const fetchPatient = async () => {
      if (!patientId) return
      try {
        setLoading(true)
        const res = await fetch(`http://localhost:3000/api/doctor/patients/${patientId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`
          }
        });
        const data = await res.json();
        if (data.success) setPatientData(data.patient)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchPatient()
  }, [patientId])

  const renderHeader = () => {
    if (!patientData) return "Loading patient..."
    const { firstName, lastName, age, gender, bmi, latestDiagnosis } = patientData;

    const dept =
      patientData.inDepartment ??
      patientData.in_department ??
      null

    return (
      <div>
        <p className="font-semibold text-lg">
          {firstName} {lastName} | {age} {gender === "M" ? "Male" : "Female"} | BMI: {bmi ?? "N/A"}
        </p>
        {latestDiagnosis && (
          <p className="text-sm text-slate-600">
            Diagnosis: {latestDiagnosis.icd10 || "—"} - {latestDiagnosis.interpretation || "—"}
          </p>
        )}
        <p className="text-sm text-slate-500">
          Department: {dept || "—"}
        </p>
      </div>
    )
  }

  return (
    <DoctorLayout>
      <div className="space-y-6 w-full">
        {/* ===== Patient Info Header ===== */}
        <Card className="p-4 flex items-center justify-between border-r border-white/40 sticky bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
          {renderHeader()}

          <div className="flex gap-2">
            <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4">+ Add Follow-up Appointment</Button>
            <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
              Finish Examination
            </Button>
          </div>
        </Card>

        {/* ===== Tabs ===== */}
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

