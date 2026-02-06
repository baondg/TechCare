import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { TechnicianLayout } from "./technician-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ViewingPatientLab from "@/technician/medical_records/lab"

const tabs = [
  { label: "Dashboard", value: "lab" },
]

export function TechnicianLayout2() {
  const navigate = useNavigate()
  const { tab = "lab", patientId } = useParams()

  const setActiveTab = (value: string) => {
    navigate(`/technician/medical_records/${patientId}/${value}`)
  }

  return (
    <TechnicianLayout>
      <div className="space-y-6 w-full">
        {/* ===== Patient Info Header ===== */}
        <Card className="p-4 flex items-center justify-between border-r border-white/40 sticky bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
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

          <div className="flex gap-2">
            <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4">+ Add Follow-up Appointment</Button>
            <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
              Finish Examination
            </Button>
          </div>
        </Card>

        {/* ===== Tab Content ===== */}
        <div>
          {tab === "lab" && <ViewingPatientLab />}
        </div>
      </div>
    </TechnicianLayout>
  )
}
