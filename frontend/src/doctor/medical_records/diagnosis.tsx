"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { History, Search } from "lucide-react"

type Diagnosis = {
  id: string
  date: string
  doctor: string
  department: string
  complaint: string
  icd10: string
  interpretation: string
  note?: string
  isDraft?: boolean
}

const MOCK_DIAGNOSES: Diagnosis[] = [
  {
    id: "dx-1",
    date: "16/10/2025 14:00",
    doctor: "Dr. Trang Thanh Nghiep",
    department: "Cardiology",
    complaint: "Mild headache, occasional dizziness",
    icd10: "Z59.1",
    interpretation:
      "Other problems related to housing and economic circumstances",
    note: "Need rest",
  },
  {
    id: "dx-2",
    date: "10/10/2025 09:30",
    doctor: "Dr. Nguyen Van B",
    department: "Internal Medicine",
    complaint: "Chest discomfort",
    icd10: "R07.9",
    interpretation: "Chest pain, unspecified",
    note: "",
  },
]

export default function PatientDiagnosis() {
  const [diagnoses] = useState<Diagnosis[]>(MOCK_DIAGNOSES)
  const [selectedDx, setSelectedDx] = useState<Diagnosis>(MOCK_DIAGNOSES[0])

  const handleAddDiagnosis = () => {
    setSelectedDx({
      id: "new",
      date: "New diagnosis",
      doctor: "Current doctor",
      department: "Cardiology",
      complaint: "",
      icd10: "",
      interpretation: "",
      note: "",
      isDraft: true,
    })
  }

  const isEditMode = selectedDx.isDraft === true

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ===== LEFT: HISTORY ===== */}
      <Card className="col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History size={18} />
            <h3 className="font-semibold text-lg">History</h3>
          </div>

          {diagnoses.map(dx => (
            <div
              key={dx.id}
              onClick={() =>
                setSelectedDx({ ...dx, isDraft: false })
              }
              className={`cursor-pointer rounded-lg border p-3 transition
                ${
                  selectedDx.id === dx.id
                    ? "bg-cyan-50 border-cyan-400"
                    : "hover:bg-slate-50"
                }`}
            >
              <p className="font-medium">{dx.date}</p>
              <p className="text-sm text-slate-600">
                {dx.doctor} – {dx.department}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ===== RIGHT: DIAGNOSIS FORM ===== */}
      <Card className="col-span-8">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={18} />
              <h3 className="font-semibold text-lg">
                Diagnosis Assessment
              </h3>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleAddDiagnosis}
              >
                + Add
              </Button>
              <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
                Save
              </Button>
              <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
                Cancel
              </Button>
              <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
                Transfer
              </Button>
            </div>
          </div>

          {/* ===== FORM ===== */}
          <div className="space-y-4">
            <FormField
              label="Chief complaint / symptoms"
              value={selectedDx.complaint}
              editable={isEditMode}
              onChange={v =>
                setSelectedDx({ ...selectedDx, complaint: v })
              }
            />

            <FormField
              label="Diagnosis (ICD-10)"
              value={selectedDx.icd10}
              editable={isEditMode}
              onChange={v =>
                setSelectedDx({ ...selectedDx, icd10: v })
              }
            />

            <FormField
              label="Diagnosis (Interpretation)"
              value={selectedDx.interpretation}
              editable={isEditMode}
              onChange={v =>
                setSelectedDx({ ...selectedDx, interpretation: v })
              }
            />

            <FormField
              label="Note"
              value={selectedDx.note ?? ""}
              editable={isEditMode}
              onChange={v =>
                setSelectedDx({ ...selectedDx, note: v })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ===== REUSABLE FIELD ===== */
function FormField({
  label,
  value,
  editable,
  onChange,
}: {
  label: string
  value: string
  editable: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-600">
        {label}
      </label>

      {editable ? (
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-400"
          rows={2}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">
          {value || "-"}
        </div>
      )}
    </div>
  )
}
