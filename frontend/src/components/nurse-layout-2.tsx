import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { NurseLayout } from "./nurse-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEffect, useState } from "react"
import ViewingPatientDashboard from "@/pages/nurse/medical_records/dashboard"
import ViewingPatientHealthInfo from "@/pages/nurse/medical_records/health-info"

const tabs = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Health info", value: "health-info" },
  { label: "History", value: "history" },
]

export function NurseLayout2() {
  const navigate = useNavigate()
  const { tab = "dashboard", patientId } = useParams()
  const [patientData, setPatientData] = useState<any>(null)

  const setActiveTab = (value: string) => {
    navigate(`/nurse/medical_records/${patientId}/${value}`)
  }

  useEffect(() => {
    const fetchPatient = async () => {
      if (!patientId) return
      try {
        const res = await fetch(`http://localhost:3000/api/doctor/patients/${patientId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`
          }
        })
        const data = await res.json()
        if (data.success) setPatientData(data.patient)
      } catch (err) {
        console.error(err)
      }
    }
    void fetchPatient()
  }, [patientId])

  return (
    <NurseLayout>
      <div className="space-y-6 w-full">
        {/* ===== Patient Info Header ===== */}
        <Card className="p-4 flex items-center justify-between border-r border-white/40 sticky bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
          <div>
            {patientData ? (
              <>
                <p className="font-semibold text-lg">
                  {patientData.firstName} {patientData.lastName} | {patientData.age} {patientData.gender === "M" ? "Male" : "Female"} | BMI: {patientData.bmi ?? "N/A"}
                </p>
                {patientData.latestDiagnosis && (
                  <p className="text-sm text-slate-600">
                    Diagnosis: {patientData.latestDiagnosis.icd10 || "—"} - {patientData.latestDiagnosis.interpretation || "—"}
                  </p>
                )}
                <p className="text-sm text-slate-500">
                  Department: {patientData.inDepartment || patientData.in_department || "—"}
                </p>
              </>
            ) : (
              <p className="font-semibold text-lg">Loading patient...</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4">+ Add Follow-up Appointment</Button>
            <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
              Finish Examination
            </Button>
          </div>
        </Card>

        {/* ===== Tabs (GIỐNG LOGIN) ===== */}
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
        </div>
      </div>
    </NurseLayout>
  )
}
