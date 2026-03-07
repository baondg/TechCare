"use client"

import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { History, Search } from "lucide-react"
import {  Table,  TableHeader,  TableBody,  TableHead,  TableRow,  TableCell} from "@/components/ui/table"

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
  const { patientId } = useParams()
  const pid = Number(patientId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([])
  const [selectedDx, setSelectedDx] = useState<Diagnosis & { isDraft?: boolean } | null>(null)

  useEffect(() => {
    if (pid) loadDiagnoses()
  }, [pid])

  const loadDiagnoses = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await doctorService.getDiagnoses(pid)
      setDiagnoses(res.diagnoses)
      if (res.diagnoses.length > 0) {
        setSelectedDx(res.diagnoses[0])
      }
    } catch (err: any) {
      setError(err.message || "Failed to load diagnoses")
    } finally {
      setLoading(false)
    }
  }

  const handleAddDiagnosis = () => {
    setSelectedDx({
      id: 0,
      patientId: pid,
      doctorId: 0,
      doctorName: "Current doctor",
      department: "",
      complaint: "",
      icd10: "",
      interpretation: "",
      note: "",
      createdAt: "",
      updatedAt: "",
      isDraft: true,
    })
  }

  const handleSave = async () => {
    if (!selectedDx?.isDraft) return
    if (!selectedDx.complaint || !selectedDx.icd10) {
      setError("Complaint and ICD-10 code are required")
      return
    }

    try {
      setSaving(true)
      setError("")
      setSuccessMsg("")

      await doctorService.createDiagnosis(pid, {
        complaint: selectedDx.complaint,
        icd10: selectedDx.icd10,
        interpretation: selectedDx.interpretation,
        note: selectedDx.note,
        department: selectedDx.department,
      })

      setSuccessMsg("Diagnosis created successfully")
      await loadDiagnoses()
    } catch (err: any) {
      setError(err.message || "Failed to save diagnosis")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (diagnoses.length > 0) {
      setSelectedDx(diagnoses[0])
    } else {
      setSelectedDx(null)
    }
  }

  const isEditMode = selectedDx?.isDraft === true

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading diagnoses...
      </div>
    )
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ===== LEFT: HISTORY TABLE ===== */}
      <Card className="col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History size={18} />
            <h3 className="font-semibold text-lg">Diagnosis History</h3>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <Table className="min-w-[500px] w-full text-sm">
              <TableHeader
                className="text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                }}
              >
                <TableRow>
                  <TableHead className="p-2 text-left w-[140px] text-white">Date</TableHead>
                  <TableHead className="p-2 text-left w-[180px] text-white">Doctor</TableHead>
                  <TableHead className="p-2 text-left w-[150px] text-white">Department</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {diagnoses.map(dx => (
                  <TableRow
                    key={dx.id}
                    onClick={() => setSelectedDx({ ...dx, isDraft: false })}
                    className={`border-t cursor-pointer transition
                    ${
                      selectedDx.id === dx.id
                        ? "bg-cyan-50"
                        : ""
                    }`}
                  >
                    <TableCell className="p-2">{dx.date}</TableCell>
                    <TableCell className="p-2">{dx.doctor}</TableCell>
                    <TableCell className="p-2">{dx.department}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

        {/* RIGHT: Diagnosis Form */}
        <Card className="col-span-8">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Search size={18} />
                <h3 className="font-semibold text-lg">Diagnosis Assessment</h3>
              </div>

              <div className="flex gap-2">
                <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4" onClick={handleAddDiagnosis}>
                  + Add
                </Button>
                {isEditMode && (
                  <>
                    <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save
                    </Button>
                    <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4" onClick={handleCancel}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>

            {selectedDx ? (
              <div className="space-y-4">
                <FormField
                  label="Department"
                  value={selectedDx.department}
                  editable={isEditMode}
                  onChange={v => setSelectedDx({ ...selectedDx, department: v })}
                />
                <FormField
                  label="Chief complaint / symptoms"
                  value={selectedDx.complaint}
                  editable={isEditMode}
                  onChange={v => setSelectedDx({ ...selectedDx, complaint: v })}
                />
                <FormField
                  label="Diagnosis (ICD-10)"
                  value={selectedDx.icd10}
                  editable={isEditMode}
                  onChange={v => setSelectedDx({ ...selectedDx, icd10: v })}
                />
                <FormField
                  label="Diagnosis (Interpretation)"
                  value={selectedDx.interpretation}
                  editable={isEditMode}
                  onChange={v => setSelectedDx({ ...selectedDx, interpretation: v })}
                />
                <FormField
                  label="Note"
                  value={selectedDx.note ?? ""}
                  editable={isEditMode}
                  onChange={v => setSelectedDx({ ...selectedDx, note: v })}
                />
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                Select a diagnosis from the history or click "+ Add" to create one.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function FormField({ label, value, editable, onChange }: {
  label: string; value: string; editable: boolean; onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-600">{label}</label>
      {editable ? (
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-400"
          rows={2}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">{value || "-"}</div>
      )}
    </div>
  )
}
