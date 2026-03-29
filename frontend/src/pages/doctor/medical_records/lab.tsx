"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { History, FlaskConical, Upload, Pencil, Plus } from "lucide-react"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { doctorService, type LabTest as ApiLabTest } from "@/services/doctor-service"

type Row = {
  id: number | "new"
  testType: string
  testDateIso: string
  technicianName: string
  resultSummary: string
  fileUrl: string
  note: string
}

function toDateInput(iso: string) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

function formatDisplayDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN")
  } catch {
    return iso
  }
}

function apiToRow(t: ApiLabTest): Row {
  return {
    id: t.id,
    testType: t.testType,
    testDateIso: t.testDate,
    technicianName: t.technicianName || "",
    resultSummary: t.resultSummary || "",
    fileUrl: t.fileUrl || "",
    note: t.note || "",
  }
}

export default function PatientLab() {
  const { patientId } = useParams<{ patientId: string }>()
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const res = await doctorService.getLabTests(patientId)
      const list = (res.labTests || []).map(apiToRow)
      setRows(list)
      if (list.length > 0) {
        setSelected(list[0])
        setEditMode(false)
      } else {
        setSelected(null)
      }
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Không tải được xét nghiệm")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    load()
  }, [load])

  const updateField = <K extends keyof Row>(key: K, value: Row[K]) => {
    if (!selected) return
    setSelected({ ...selected, [key]: value })
  }

  const handleAdd = () => {
    const now = new Date()
    setSelected({
      id: "new",
      testType: "",
      testDateIso: now.toISOString(),
      technicianName: "",
      resultSummary: "",
      fileUrl: "",
      note: "",
    })
    setEditMode(true)
  }

  const handleSave = async () => {
    if (!patientId || !selected) return
    const iso = selected.testDateIso
    if (!selected.testType.trim()) {
      alert("Nhập loại xét nghiệm")
      return
    }
    setSaving(true)
    try {
      if (selected.id === "new") {
        await doctorService.createLabTest(patientId, {
          testType: selected.testType.trim(),
          testDate: iso,
          technicianName: selected.technicianName.trim() || undefined,
          resultSummary: selected.resultSummary.trim() || undefined,
          fileUrl: selected.fileUrl.trim() || undefined,
          note: selected.note.trim() || undefined,
        })
      } else {
        await doctorService.updateLabTest(patientId, selected.id, {
          testType: selected.testType.trim(),
          testDate: iso,
          technicianName: selected.technicianName.trim() || null,
          resultSummary: selected.resultSummary.trim() || null,
          fileUrl: selected.fileUrl.trim() || null,
          note: selected.note.trim() || null,
        })
      }
      await load()
      setEditMode(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lưu thất bại")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    load()
    setEditMode(false)
  }

  const fileLabel = selected?.fileUrl?.trim() || ""

  return (
    <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-lg">
              <History size={18} />
              Laboratory History
            </div>
            <Button size="sm" className="btn-gradient gap-1" onClick={handleAdd} disabled={loading}>
              <Plus size={14} /> Add
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Đang tải…</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table className="min-w-[700px] w-full text-sm">
                <TableHeader
                  className="bg-cyan-50 text-white"
                  style={{ background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}
                >
                  <TableRow>
                    <TableHead className="p-2 text-left text-white">No.</TableHead>
                    <TableHead className="p-2 text-left text-white">Test Type</TableHead>
                    <TableHead className="p-2 text-left text-white">Date</TableHead>
                    <TableHead className="p-2 text-left text-white">Technician</TableHead>
                    <TableHead className="p-2 text-left text-white">Result</TableHead>
                    <TableHead className="p-2 text-left text-white">File</TableHead>
                    <TableHead className="p-2 text-left text-white">Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow
                      key={r.id}
                      onClick={() => {
                        setSelected(r)
                        setEditMode(false)
                      }}
                      className={`border-t hover:bg-slate-50 cursor-pointer ${
                        selected?.id === r.id ? "bg-cyan-50" : ""
                      }`}
                    >
                      <TableCell className="p-2">{i + 1}</TableCell>
                      <TableCell className="p-2">{r.testType}</TableCell>
                      <TableCell className="p-2">{formatDisplayDate(r.testDateIso)}</TableCell>
                      <TableCell className="p-2">{r.technicianName || "—"}</TableCell>
                      <TableCell className="p-2">{r.resultSummary || "—"}</TableCell>
                      <TableCell className="p-2 text-cyan-600 underline break-all max-w-[140px]">
                        {r.fileUrl ? (
                          <a href={r.fileUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            Link
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="p-2">{r.note || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-lg">
              <FlaskConical size={18} />
              Laboratory Result
            </div>

            <Button
              size="sm"
              className="btn-outline flex gap-2"
              onClick={() => setEditMode(true)}
              disabled={!selected || selected.id === "new" || loading}
            >
              <Pencil size={14} /> Edit
            </Button>
          </div>

          {!selected ? (
            <p className="text-sm text-slate-500">Click on any row to load that record into the form below or click "Add" button to create a new record</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-600">Test type</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={selected.testType}
                    onChange={(e) => updateField("testType", e.target.value)}
                    readOnly={!editMode && selected.id !== "new"}
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-600">Date</label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded px-3 py-2"
                    value={toDateInput(selected.testDateIso)}
                    readOnly={!editMode && selected.id !== "new"}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v) updateField("testDateIso", new Date(v).toISOString())
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-600">Technician</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={selected.technicianName}
                  onChange={(e) => updateField("technicianName", e.target.value)}
                  readOnly={!editMode && selected.id !== "new"}
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">Result (Short description)</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={selected.resultSummary}
                  onChange={(e) => updateField("resultSummary", e.target.value)}
                  readOnly={!editMode && selected.id !== "new"}
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">File URL (PDF / ảnh)</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={selected.fileUrl}
                  onChange={(e) => updateField("fileUrl", e.target.value)}
                  placeholder="https://..."
                  readOnly={!editMode && selected.id !== "new"}
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">Results (image / PDF)</label>
                <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-slate-400">
                  <Upload size={20} />
                  <p className="text-sm mt-2 text-center">
                    Tải file lên hệ thống lưu trữ rồi dán URL vào ô phía trên
                  </p>
                  {fileLabel ? (
                    <a href={fileLabel} className="text-cyan-600 text-sm mt-2 break-all" target="_blank" rel="noreferrer">
                      Mở file
                    </a>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-600">Doctor&apos;s Note</label>
                <textarea
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  value={selected.note}
                  onChange={(e) => updateField("note", e.target.value)}
                  readOnly={!editMode && selected.id !== "new"}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  className="btn-gradient"
                  onClick={handleSave}
                  disabled={saving || (!editMode && selected.id !== "new")}
                >
                  Save
                </Button>
                <Button size="sm" className="btn-outline" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
