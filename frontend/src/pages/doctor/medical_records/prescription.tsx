"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Trash2, History, Pill, Plus, Edit, Copy, Save, X, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
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
  type Prescription as ApiPrescription,
  type MedicineOption,
} from "@/services/doctor-service"

type Medication = {
  name: string
  quantity: string
  unit: "tablet" | "capsule" | "syrup" | "injection" | "drop" | "cream" | "ointment" | "powder" | "spray"
  usage: string
  note?: string
}

type UiPrescription = {
  id: string
  date: string
  doctor: string
  medications: Medication[]
  isDraft?: boolean
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN")
  } catch {
    return iso
  }
}

function mapApi(p: ApiPrescription): UiPrescription {
  return {
    id: String(p.id),
    date: formatDt(p.createdAt),
    doctor: p.doctorName,
    medications: (p.medications || []).map((m) => ({
      name: m.name,
      quantity: m.quantity || "",
      unit: m.unit || "tablet",
      usage: m.usage || "",
      note: m.note || "",
    })),
    isDraft: false,
  }
}

const emptyMed = (): Medication => ({
  name: "",
  quantity: "",
  unit: "tablet",
  usage: "",
  note: "",
})

function MedicineNameCombobox({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<MedicineOption[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await doctorService.getMedicines(q.trim() || undefined)
      setItems(res.medicines || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      void load(value)
    }, 200)
    return () => window.clearTimeout(t)
  }, [open, value, load])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex w-full min-w-[10rem] items-stretch rounded-md border border-slate-200 bg-white shadow-sm",
            "focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/25",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <Input
            className="h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 py-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-sm"
            value={value}
            placeholder="Tìm hoặc chọn thuốc"
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setOpen(true)}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listId}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 rounded-none rounded-r-md border-l border-slate-200 px-2 hover:bg-slate-50"
            disabled={disabled}
            aria-label="Mở danh sách thuốc"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown
              className={cn("h-4 w-4 text-slate-600 transition-transform duration-200", open && "rotate-180")}
            />
          </Button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-anchor-width)] min-w-[12rem]"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ScrollArea className="h-[220px]">
          {loading ? (
            <div className="p-3 text-sm text-slate-500">Đang tải…</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-sm text-slate-500">Không có thuốc khớp</div>
          ) : (
            <ul id={listId} className="py-1" role="listbox">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-cyan-50 truncate"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(m.name)
                      setOpen(false)
                    }}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export default function PatientPrescription() {
  const { patientId } = useParams<{ patientId: string }>()
  const [prescriptions, setPrescriptions] = useState<UiPrescription[]>([])
  const [selectedRx, setSelectedRx] = useState<UiPrescription | null>(null)
  const [viewRxBeforeEdit, setViewRxBeforeEdit] = useState<UiPrescription | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draftMeds, setDraftMeds] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const isEmptyMedication = (med: Medication) =>
    !med.name && !med.quantity && !med.usage && !med.note

  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const res = await doctorService.getPrescriptions(patientId)
      const rows = (res.prescriptions || []).map(mapApi)
      setPrescriptions(rows)
      setSelectedRx((prev) => {
        if (!prev) return null
        const matched = rows.find((r) => r.id === prev.id)
        return matched ? { ...matched, isDraft: false } : null
      })
      setDraftMeds([])
      setIsEditMode(false)
      setViewRxBeforeEdit(null)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Không tải được đơn thuốc")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    load()
  }, [load])

  const removeMedication = (index: number) => {
    setDraftMeds((prev) => {
      if (index === prev.length - 1) return prev
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleRowBlur = (index: number) => {
    setDraftMeds((prev) => {
      if (index === prev.length - 1) return prev
      if (isEmptyMedication(prev[index])) {
        return prev.filter((_, i) => i !== index)
      }
      return prev
    })
  }

  const handleAddPrescription = () => {
    setViewRxBeforeEdit(selectedRx && !selectedRx.isDraft ? selectedRx : null)
    setSelectedRx({
      id: "new",
      date: "—",
      doctor: "—",
      medications: [],
      isDraft: true,
    })
    setDraftMeds([emptyMed()])
    setIsEditMode(true)
  }

  const handleEditPrescription = () => {
    if (!selectedRx || selectedRx.isDraft) return
    setViewRxBeforeEdit(selectedRx)
    setSelectedRx({ ...selectedRx, isDraft: true })
    setDraftMeds([
      ...(selectedRx.medications || []).map((m) => ({
        name: m.name || "",
        quantity: m.quantity || "",
        unit: m.unit || "tablet",
        usage: m.usage || "",
        note: m.note || "",
      })),
      emptyMed(),
    ])
    setIsEditMode(true)
  }

  const handleInheritPrescription = () => {
    if (!selectedRx || selectedRx.isDraft) return
    setViewRxBeforeEdit(selectedRx)
    setSelectedRx({
      ...selectedRx,
      id: "new",
      date: "—",
      doctor: "—",
      isDraft: true,
    })
    setDraftMeds([
      ...(selectedRx.medications || []).map((m) => ({
        name: m.name || "",
        quantity: m.quantity || "",
        unit: m.unit || "tablet",
        usage: m.usage || "",
        note: m.note || "",
      })),
      emptyMed(),
    ])
    setIsEditMode(true)
  }

  const updateMedication = (index: number, field: keyof Medication, value: string) => {
    setDraftMeds((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }

      if (index === prev.length - 1 && field === "name" && value.trim() !== "") {
        return [...updated, emptyMed()]
      }
      return updated
    })
  }

  const handleSave = async () => {
    if (!patientId || !selectedRx || !isEditMode) return
    const meds = draftMeds
      .filter((m) => !isEmptyMedication(m))
      .map((m) => ({
        name: m.name.trim(),
        quantity: m.quantity.trim(),
        unit: m.unit,
        usage: m.usage.trim(),
        ...(m.note?.trim() ? { note: m.note.trim() } : {}),
      }))
    if (meds.length === 0 || !meds.some((m) => m.name)) {
      alert("Thêm ít nhất một thuốc có tên")
      return
    }
    setSaving(true)
    try {
      const isUpdate =
        selectedRx.id !== "new" && Number.isFinite(Number(selectedRx.id))
      if (isUpdate) {
        await doctorService.updatePrescription(patientId, selectedRx.id, {
          medications: meds,
        })
      } else {
        await doctorService.createPrescription(patientId, { medications: meds })
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
    setSelectedRx(viewRxBeforeEdit ? { ...viewRxBeforeEdit, isDraft: false } : null)
    setDraftMeds([])
    setViewRxBeforeEdit(null)
  }

  const hasSelectedViewRow = !!selectedRx && !selectedRx.isDraft
  const canAdd = !isEditMode && !loading && !saving
  const canEditOrInherit = !isEditMode && hasSelectedViewRow && !loading && !saving
  const canSaveOrCancel = isEditMode && !loading

  return (
    <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History size={18} />
            <h3 className="font-semibold text-lg">Prescription History</h3>
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
                    <TableHead className="p-2 text-left w-[100px] text-white">Date</TableHead>
                    <TableHead className="p-2 text-left w-[200px] text-white">Doctor</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {prescriptions.map((rx) => (
                    <TableRow
                      key={rx.id}
                      onClick={() => {
                        if (isEditMode) return
                        setSelectedRx({ ...rx, isDraft: false })
                        setDraftMeds([])
                      }}
                      className={`border-t cursor-pointer ${
                        selectedRx?.id === rx.id ? "bg-cyan-50" : ""
                      }`}
                    >
                      <TableCell className="p-2">{rx.date}</TableCell>
                      <TableCell className="p-2">{rx.doctor}</TableCell>
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex">
              <Pill />
              <h3 className="font-semibold text-lg flex items-center gap-2 ml-2">Prescription</h3>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <Button
                size="sm"
                className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleAddPrescription}
                disabled={!canAdd}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleEditPrescription}
                disabled={!canEditOrInherit}
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleInheritPrescription}
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

          {!selectedRx ? (
            <p className="text-sm text-slate-500">Click on any row to load that record into the form below or click "Add" button to create a new record</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow
                    style={{
                      background:
                        "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                    }}
                  >
                    <TableHead className="p-2 text-white">No.</TableHead>
                    <TableHead className="p-2 text-white whitespace-nowrap">Medication Name</TableHead>
                    <TableHead className="p-2 text-white">Quantity</TableHead>
                    <TableHead className="p-2 text-white">Unit</TableHead>
                    <TableHead className="p-2 text-white">Usage</TableHead>
                    <TableHead className="p-2 text-white">Note</TableHead>
                    <TableHead className="p-2 text-white" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRx.isDraft ? (
                    draftMeds.map((med, index) => (
                      <TableRow
                        key={index}
                        className="border-t"
                        onBlur={() => handleRowBlur(index)}
                      >
                        <TableCell className="p-2">{index + 1}</TableCell>
                        <TableCell className="p-2">
                          <MedicineNameCombobox
                            value={med.name}
                            onChange={(v) => updateMedication(index, "name", v)}
                            disabled={saving}
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <input
                            className="w-full border rounded px-2 py-1"
                            value={med.quantity}
                            placeholder="Quantity"
                            onChange={(e) => updateMedication(index, "quantity", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <select
                            className="w-full border rounded px-2 py-1 bg-white"
                            value={med.unit}
                            onChange={(e) => updateMedication(index, "unit", e.target.value)}
                          >
                            <option value="tablet">tablet</option>
                            <option value="capsule">capsule</option>
                            <option value="syrup">syrup</option>
                            <option value="injection">injection</option>
                            <option value="drop">drop</option>
                            <option value="cream">cream</option>
                            <option value="ointment">ointment</option>
                            <option value="powder">powder</option>
                            <option value="spray">spray</option>
                          </select>
                        </TableCell>
                        <TableCell className="p-2">
                          <input
                            className="w-full border rounded px-2 py-1"
                            value={med.usage}
                            placeholder="Usage"
                            onChange={(e) => updateMedication(index, "usage", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <input
                            className="w-full border rounded px-2 py-1"
                            value={med.note}
                            placeholder="Note"
                            onChange={(e) => updateMedication(index, "note", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-2 text-center">
                          {index !== draftMeds.length - 1 && (
                            <button
                              type="button"
                              onClick={() => removeMedication(index)}
                              className="text-red-500 hover:bg-red-50 p-1 rounded"
                              title="Remove medication"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    selectedRx.medications.map((med, index) => (
                      <TableRow key={index} className="border-t hover:bg-slate-50">
                        <TableCell className="p-2">{index + 1}</TableCell>
                        <TableCell className="p-2">{med.name}</TableCell>
                        <TableCell className="p-2 text-center">{med.quantity}</TableCell>
                        <TableCell className="p-2">{med.unit}</TableCell>
                        <TableCell className="p-2">{med.usage}</TableCell>
                        <TableCell className="p-2">{med.note ?? "—"}</TableCell>
                        <TableCell className="p-2"></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
