import { NavLink, Outlet, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const tabs = [
  { label: "Dashboard", path: "" },
  { label: "Health info", path: "health-info" },
  { label: "Laboratory", path: "laboratory" },
  { label: "Diagnosis", path: "diagnosis" },
  { label: "Surgery", path: "surgery" },
  { label: "Prescription", path: "prescription" },
  { label: "History", path: "history" },
]

export function PatientLayout() {
  const { patientId } = useParams()

  return (
    <div className="space-y-6 w-full">  {/* ← thêm bg-white & relative z-0 */}
      {/* ===== Patient Info Header ===== */}
      <Card className="p-4 flex items-center justify-between shadow-md sticky bg-white">  {/* ← thêm shadow & sticky + bg-white */}
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
          <Button size="sm">+ Add Follow-up Appointment</Button>
          <Button size="sm" variant="outline">
            Finish Examination
          </Button>
        </div>
      </Card>

      {/* ===== Tabs ===== */}
      <div className="border-b flex gap-6 bg-white sticky z-10">  {/* ← thêm bg-white & sticky */}
        {tabs.map(tab => (
          <NavLink
            key={tab.label}
            to={`/doctor/medical_records/${patientId}/${tab.path}`}
            end
            className={({ isActive }) =>
              `pb-3 text-sm font-medium ${
                isActive
                  ? "border-b-2 border-cyan-500 text-cyan-600"
                  : "text-slate-500 hover:text-slate-700"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* ===== Tab Content ===== */}
      <div className="px-6 pb-6 bg-white">  {/* ← thêm padding & bg-white cho nội dung */}
        <Outlet />
      </div>
    </div>
  )
}
