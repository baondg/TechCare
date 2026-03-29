"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Pencil } from "lucide-react"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { doctorService, type SurgeryRecord } from "@/services/doctor-service"

type UiSurgery = {
  id: string
  procedureCode: string
  procedureName: string
  date: string
  dateIso: string
  surgeon: string
  urgency: string
  status: string
  result: string
  note?: string
  isDraft?: boolean
}

function formatDt(iso: string | null) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("vi-VN")
  } catch {
    return iso
  }
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

function mapApi(s: SurgeryRecord): UiSurgery {
  return {
    id: String(s.id),
    procedureCode: s.procedureCode || "",
    procedureName: s.procedureName,
    date: formatDt(s.surgeryDate),
    dateIso: s.surgeryDate ? new Date(s.surgeryDate).toISOString() : "",
    surgeon: s.surgeonName || "",
    urgency: s.urgency || "",
    status: s.status || "",
    result: s.outcome || "",
    note: s.note || "",
    isDraft: false,
  }
}

export default function PatientSurgery() {
  const { patientId } = useParams<{ patientId: string }>()
  const [surgeries, setSurgeries] = useState<UiSurgery[]>([])
  const [selected, setSelected] = useState<UiSurgery | null>(null)
  const [isEdit, setIsEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [patientLabel, setPatientLabel] = useState("—")

  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const [surRes, patRes] = await Promise.all([
        doctorService.getSurgeries(patientId),
        doctorService.getPatient(patientId).catch(() => null),
      ])
      if (patRes?.patient) {
        const p = patRes.patient
        const name = `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.username || "—"
        setPatientLabel(name)
      }
      const list = (surRes.surgeries || []).map(mapApi)
      setSurgeries(list)
      if (list.length > 0) {
        setSelected(list[0])
        setIsEdit(false)
      } else {
        setSelected(null)
      }
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Không tải được phẫu thuật")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    load()
  }, [load])

  const viewMode = selected ? !isEdit && !selected.isDraft : true

  const patchSelected = (patch: Partial<UiSurgery>) => {
    if (!selected) return
    setSelected({ ...selected, ...patch })
  }

  const handleAdd = () => {
    const now = new Date().toISOString()
    setSelected({
      id: "new",
      procedureCode: "",
      procedureName: "",
      date: "—",
      dateIso: now,
      surgeon: "",
      urgency: "",
      status: "",
      result: "",
      note: "",
      isDraft: true,
    })
    setIsEdit(true)
  }

  const handleClear = () => {
    if (selected?.isDraft) {
      handleAdd()
    } else if (surgeries.length > 0) {
      setSelected({ ...surgeries[0], isDraft: false })
      setIsEdit(false)
    }
  }

  const handleSave = async () => {
    if (!patientId || !selected) return
    if (selected.isDraft) {
      if (!selected.procedureName.trim()) {
        alert("Nhập tên thủ thuật / phẫu thuật")
        return
      }
      setSaving(true)
      try {
        await doctorService.createSurgery(patientId, {
          procedureCode: selected.procedureCode.trim() || undefined,
          procedureName: selected.procedureName.trim(),
          surgeryDate: selected.dateIso || null,
          surgeonName: selected.surgeon.trim() || null,
          urgency: selected.urgency.trim() || null,
          status: selected.status.trim() || null,
          outcome: selected.result.trim() || null,
          note: selected.note?.trim() || null,
        })
        await load()
        setIsEdit(false)
      } catch (e) {
        alert(e instanceof Error ? e.message : "Lưu thất bại")
      } finally {
        setSaving(false)
      }
      return
    }
    if (selected.id === "new") return
    setSaving(true)
    try {
      await doctorService.updateSurgery(patientId, Number(selected.id), {
        outcome: selected.result,
        note: selected.note ?? "",
      })
      await load()
      setIsEdit(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lưu thất bại")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    load()
    setIsEdit(false)
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-5">
        <CardContent className="p-4">
          {loading ? (
            <p className="text-sm text-slate-500">Đang tải…</p>
          ) : (
            <Table className="w-full text-sm overflow-x-auto">
              <TableHeader
                className="bg-cyan-50 text-white"
                style={{ background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}
              >
                <TableRow>
                  <TableHead className="p-2 text-left text-white">No.</TableHead>
                  <TableHead className="p-2 text-left text-white">Procedure</TableHead>
                  <TableHead className="p-2 text-left text-white">Date</TableHead>
                  <TableHead className="p-2 text-left text-white">Surgeon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {surgeries.map((s, i) => (
                  <TableRow
                    key={s.id}
                    onClick={() => {
                      setSelected({ ...s, isDraft: false })
                      setIsEdit(false)
                    }}
                    className={`cursor-pointer border-t hover:bg-slate-50 ${
                      selected?.id === s.id ? "bg-cyan-50" : ""
                    }`}
                  >
                    <TableCell className="p-2">{i + 1}</TableCell>
                    <TableCell className="p-2">{s.procedureName || s.procedureCode || "—"}</TableCell>
                    <TableCell className="p-2">{s.date}</TableCell>
                    <TableCell className="p-2">{s.surgeon || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-7">
        <CardContent className="p-5 space-y-4">
          <div className="flex justify-between flex-wrap gap-2">
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleAdd}
                disabled={loading}
              >
                <Plus size={16} /> Add
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleClear}
                disabled={loading}
              >
                Clear
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleSave}
                disabled={loading || saving || (!selected?.isDraft && !isEdit)}
              >
                Save
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleCancel}
                disabled={loading || saving}
              >
                Cancel
              </Button>
            </div>

            {selected && viewMode && (
              <Button
                size="sm"
                className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"
                onClick={() => setIsEdit(true)}
              >
                <Pencil size={16} /> Edit note / result
              </Button>
            )}
          </div>

          {!selected ? (
            <p className="text-sm text-slate-500">Click on any row to load that record into the form below or click "Add" button to create a new record</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Patient" value={patientLabel} />
                {selected.isDraft ? (
                  <div>
                    <label className="text-xs text-slate-500">Surgeon</label>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={selected.surgeon}
                      onChange={(e) => patchSelected({ surgeon: e.target.value })}
                    />
                  </div>
                ) : (
                  <Field label="Surgeon" value={selected.surgeon} />
                )}

                {selected.isDraft ? (
                  <>
                    <div>
                      <label className="text-xs text-slate-500">Procedure code</label>
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={selected.procedureCode}
                        onChange={(e) => patchSelected({ procedureCode: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Procedure name</label>
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={selected.procedureName}
                        onChange={(e) => patchSelected({ procedureName: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-slate-500">Date</label>
                      <input
                        type="datetime-local"
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={toDateInput(selected.dateIso)}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v) {
                            const iso = new Date(v).toISOString()
                            patchSelected({ dateIso: iso, date: formatDt(iso) })
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Urgency</label>
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={selected.urgency}
                        onChange={(e) => patchSelected({ urgency: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Status</label>
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={selected.status}
                        onChange={(e) => patchSelected({ status: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="Procedure" value={selected.procedureName} />
                    <Field label="Date" value={selected.date} />
                    <Field label="Urgency" value={selected.urgency} />
                    <Field label="Status" value={selected.status} />
                  </>
                )}
              </div>

              <TextArea
                label="Result (Short description)"
                value={selected.result}
                editable={selected.isDraft || isEdit}
                onChange={(v) => patchSelected({ result: v })}
              />

              <TextArea
                label="Doctor's Note"
                value={selected.note ?? ""}
                editable={selected.isDraft || isEdit}
                onChange={(v) => patchSelected({ note: v })}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <div className="border rounded px-2 py-1 text-sm bg-slate-50">{value || "—"}</div>
    </div>
  )
}

function TextArea({
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
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      {editable ? (
        <textarea
          className="w-full border rounded px-2 py-2 text-sm"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="border rounded px-2 py-2 text-sm bg-slate-50">{value || "—"}</div>
      )}
    </div>
  )
}
