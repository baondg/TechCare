"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Edit, History, Plus, Save, Search, X } from "lucide-react"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  doctorService,
  type Diagnosis as ApiDiagnosis,
  type DiseaseCode,
} from "@/services/doctor-service"

type UiDiagnosis = {
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

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN")
  } catch {
    return iso
  }
}

function mapApiToUi(d: ApiDiagnosis): UiDiagnosis {
  return {
    id: String(d.id),
    date: formatDt(d.createdAt),
    doctor: d.doctorName,
    department: d.department || "",
    complaint: d.complaint,
    icd10: d.icd10,
    interpretation: d.interpretation || "",
    note: d.note || "",
    isDraft: false,
  }
}

export default function PatientDiagnosis() {
  const { patientId } = useParams<{ patientId: string }>()
  const [diagnoses, setDiagnoses] = useState<UiDiagnosis[]>([])
  const [selectedDx, setSelectedDx] = useState<UiDiagnosis | null>(null)
  const [viewDxBeforeEdit, setViewDxBeforeEdit] = useState<UiDiagnosis | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [diseaseCodes, setDiseaseCodes] = useState<DiseaseCode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const res = await doctorService.getDiagnoses(patientId)
      const rows = (res.diagnoses || []).map(mapApiToUi)
      setDiagnoses(rows)
      setSelectedDx((prev) => {
        if (!prev) return null
        const matched = rows.find((r) => r.id === prev.id)
        return matched ? { ...matched, isDraft: false } : null
      })
      setIsEditMode(false)
      setViewDxBeforeEdit(null)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Không tải được chẩn đoán")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const loadDiseaseCodes = async () => {
      try {
        const res = await doctorService.getDiseaseCodes()
        setDiseaseCodes(res.diseases || [])
      } catch (e) {
        console.error(e)
      }
    }
    loadDiseaseCodes()
  }, [])

  const handleAddDiagnosis = () => {
    setViewDxBeforeEdit(selectedDx && !selectedDx.isDraft ? selectedDx : null)
    const createDraft = (complaint = "") => {
      setSelectedDx({
        id: "new",
        date: "—",
        doctor: "—",
        department: "",
        complaint,
        icd10: "",
        interpretation: "",
        note: "",
        isDraft: true,
      })
      setIsEditMode(true)
    }
    if (!patientId) {
      createDraft("")
      return
    }
    doctorService
      .getHealthInfo(Number(String(patientId).replace(/^OP0*/i, "")))
      .then((res) => {
        const h = res.healthInfo as any
        const autoComplaint = h?.currentSymptoms || h?.condition || ""
        createDraft(autoComplaint)
      })
      .catch(() => createDraft(""))
  }

  const handleEditDiagnosis = () => {
    if (!selectedDx || selectedDx.isDraft) return
    setViewDxBeforeEdit(selectedDx)
    setSelectedDx({ ...selectedDx, isDraft: true })
    setIsEditMode(true)
  }

  const handleInheritDiagnosis = () => {
    if (!selectedDx || selectedDx.isDraft) return
    setViewDxBeforeEdit(selectedDx)
    setSelectedDx({
      ...selectedDx,
      id: "new",
      date: "—",
      doctor: "—",
      isDraft: true,
    })
    setIsEditMode(true)
  }

  const handleSave = async () => {
    if (!patientId || !selectedDx || !isEditMode) return
    if (!selectedDx.complaint.trim() || !selectedDx.icd10.trim()) {
      alert("Vui lòng nhập triệu chứng và mã ICD-10")
      return
    }
    setSaving(true)
    try {
      const payload = {
        complaint: selectedDx.complaint.trim(),
        icd10: selectedDx.icd10.trim(),
        interpretation: selectedDx.interpretation.trim() || undefined,
        note: selectedDx.note?.trim() || undefined,
        department: selectedDx.department.trim() || undefined,
      }
      const isUpdate =
        selectedDx.id !== "new" && Number.isFinite(Number(selectedDx.id))
      if (isUpdate) {
        await doctorService.updateDiagnosis(patientId, selectedDx.id, payload)
      } else {
        await doctorService.createDiagnosis(patientId, payload)
      }
      await load()
      setIsEditMode(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lưu thất bại")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setIsEditMode(false)
    setSelectedDx(viewDxBeforeEdit ? { ...viewDxBeforeEdit, isDraft: false } : null)
    setViewDxBeforeEdit(null)
  }

  const hasSelectedViewRow = !!selectedDx && !selectedDx.isDraft
  const canAdd = !isEditMode && !loading && !saving
  const canEditOrInherit = !isEditMode && hasSelectedViewRow && !loading && !saving
  const canSaveOrCancel = isEditMode && !loading
  const diseaseMap = new Map(diseaseCodes.map((d) => [d.code, d.description]))

  return (
    <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History size={18} />
            <h3 className="font-semibold text-lg">Diagnosis History</h3>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Đang tải…</p>
          ) : (
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
                  {diagnoses.map((dx) => (
                    <TableRow
                      key={dx.id}
                      onClick={() => {
                        if (isEditMode) return
                        setSelectedDx({ ...dx, isDraft: false })
                      }}
                      className={`border-t cursor-pointer transition ${
                        selectedDx?.id === dx.id ? "bg-cyan-50" : ""
                      }`}
                    >
                      <TableCell className="p-2">{dx.date}</TableCell>
                      <TableCell className="p-2">{dx.doctor}</TableCell>
                      <TableCell className="p-2">{dx.department || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-8">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={18} />
              <h3 className="font-semibold text-lg">Diagnosis Assessment</h3>
            </div>

            <div className="flex gap-2 flex-wrap justify-end">
              <Button
                size="sm"
                className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleAddDiagnosis}
                disabled={!canAdd}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleEditDiagnosis}
                disabled={!canEditOrInherit}
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleInheritDiagnosis}
                disabled={!canEditOrInherit}
              >
                <Copy className="h-4 w-4" />
                Inherit
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleSave}
                disabled={!canSaveOrCancel || saving}
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleCancel}
                disabled={!canSaveOrCancel || saving}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>

          {!selectedDx ? (
            <p className="text-sm text-slate-500 mt-6">
              Click on any row to load that record into the form or click "Add" to create a new diagnosis.
            </p>
          ) : (
            <div className="space-y-4 mt-4">
              <FormField
                label="Chief complaint / symptoms"
                value={selectedDx.complaint}
                editable={isEditMode}
                onChange={(v) => setSelectedDx({ ...selectedDx, complaint: v })}
              />

              <DiagnosisCodeField
                label="Diagnosis (ICD-10)"
                value={selectedDx.icd10}
                editable={isEditMode}
                options={diseaseCodes}
                onChange={(v) => {
                  const autoDescription = diseaseMap.get(v.trim())
                  setSelectedDx({
                    ...selectedDx,
                    icd10: v,
                    interpretation: autoDescription ?? "",
                  })
                }}
              />

              <FormField
                label="Diagnosis (Interpretation)"
                value={selectedDx.interpretation}
                editable={false}
                onChange={(v) => setSelectedDx({ ...selectedDx, interpretation: v })}
              />

              <FormField
                label="Note"
                value={selectedDx.note ?? ""}
                editable={isEditMode}
                onChange={(v) => setSelectedDx({ ...selectedDx, note: v })}
              />

              {!isEditMode && (
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                  <div>
                    <span className="font-medium">Date:</span> {selectedDx.date}
                  </div>
                  <div>
                    <span className="font-medium">Doctor:</span> {selectedDx.doctor}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DiagnosisCodeField({
  label,
  value,
  editable,
  onChange,
  options,
}: {
  label: string
  value: string
  editable: boolean
  onChange: (v: string) => void
  options: DiseaseCode[]
}) {
  const listId = "diagnosis-icd10-options"
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-600">{label}</label>
      {editable ? (
        <>
          <input
            list={listId}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-400"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Chọn hoặc nhập mã ICD-10"
          />
          <datalist id={listId}>
            {options.map((d) => (
              <option key={d.code} value={d.code}>
                {d.description}
              </option>
            ))}
          </datalist>
        </>
      ) : (
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">{value || "—"}</div>
      )}
    </div>
  )
}

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
      <label className="text-sm font-medium text-slate-600">{label}</label>

      {editable ? (
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-400"
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">{value || "—"}</div>
      )}
    </div>
  )
}
