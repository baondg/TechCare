"use client"

<<<<<<< HEAD
import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
=======
<<<<<<< HEAD
import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trash2, History, Pill, Loader2 } from "lucide-react"
import { doctorService, type Prescription, type Medication } from "@/services/doctor-service"

export default function PatientPrescription() {
  const { patientId } = useParams()
  const pid = Number(patientId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [selectedRx, setSelectedRx] = useState<(Prescription & { isDraft?: boolean }) | null>(null)
  const [draftMeds, setDraftMeds] = useState<Medication[]>([])
  const [draftDepartment, setDraftDepartment] = useState("")

  useEffect(() => {
    if (pid) loadPrescriptions()
  }, [pid])

  const loadPrescriptions = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await doctorService.getPrescriptions(pid)
      setPrescriptions(res.prescriptions)
      if (res.prescriptions.length > 0) {
        setSelectedRx(res.prescriptions[0])
      }
    } catch (err: any) {
      setError(err.message || "Failed to load prescriptions")
    } finally {
      setLoading(false)
    }
  }

  const handleAddPrescription = () => {
    setSelectedRx({
      id: 0,
      patientId: pid,
      doctorId: 0,
      doctorName: "Current doctor",
      department: "",
      status: "Active",
      medications: [],
      createdAt: "",
      updatedAt: "",
      isDraft: true,
    })
    setDraftMeds([{ name: "", frequency: "", quantity: "", instruction: "", note: "" }])
    setDraftDepartment("")
  }

  const updateMedication = (index: number, field: keyof Medication, value: string) => {
    const updated = [...draftMeds]
    ;(updated[index] as any)[field] = value
    setDraftMeds(updated)

    // Auto-add new row when typing in last row
    if (index === draftMeds.length - 1 && field === "name" && value.trim() !== "") {
      setDraftMeds([...updated, { name: "", frequency: "", quantity: "", instruction: "", note: "" }])
    }
  }

  const removeMedication = (index: number) => {
    if (index === draftMeds.length - 1) return
    setDraftMeds(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    const validMeds = draftMeds.filter(m => m.name.trim())
    if (validMeds.length === 0) {
      setError("At least one medication is required")
      return
    }

    try {
      setSaving(true)
      setError("")
      setSuccessMsg("")

      await doctorService.createPrescription(pid, {
        department: draftDepartment,
        medications: validMeds.map(m => ({
          name: m.name,
          frequency: m.frequency,
          quantity: m.quantity,
          instruction: m.instruction,
          note: m.note,
        })),
      })

      setSuccessMsg("Prescription created successfully")
      await loadPrescriptions()
    } catch (err: any) {
      setError(err.message || "Failed to save prescription")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setDraftMeds([])
    if (prescriptions.length > 0) {
      setSelectedRx(prescriptions[0])
    } else {
      setSelectedRx(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading prescriptions...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded">{error}</div>}
      {successMsg && <div className="bg-green-50 text-green-700 px-4 py-2 rounded">{successMsg}</div>}

      <div className="grid grid-cols-12 gap-6">
        {/* LEFT: Prescription List */}
        <Card className="col-span-4">
          <CardContent className="p-4 space-y-3">
            <div className="flex">
              <History />
              <h3 className="font-semibold text-lg flex items-center gap-2 ml-2">History</h3>
            </div>

            {prescriptions.length === 0 && (
              <p className="text-sm text-slate-500">No prescriptions yet.</p>
            )}

            {prescriptions.map(rx => (
              <div
                key={rx.id}
                onClick={() => { setSelectedRx({ ...rx, isDraft: false }); setDraftMeds([]) }}
                className={`cursor-pointer rounded-lg border p-3 transition ${
                  selectedRx?.id === rx.id && !selectedRx?.isDraft
                    ? "bg-cyan-50 border-cyan-400"
                    : "hover:bg-slate-50"
                }`}
              >
                <p className="font-medium">
                  {new Date(rx.createdAt).toLocaleDateString("en-GB")} {new Date(rx.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-sm text-slate-600">
                  {rx.doctorName} - {rx.department || "N/A"}
                </p>
                <p className="text-xs text-slate-500 mt-1">{rx.medications.length} medication(s)</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* RIGHT: Medication Table */}
        <Card className="col-span-8">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex">
                <Pill />
                <h3 className="font-semibold text-lg flex items-center gap-2 ml-2">Prescription</h3>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4" onClick={handleAddPrescription}>
                  + Add
                </Button>
                {selectedRx?.isDraft && (
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

            {/* Department input for drafts */}
            {selectedRx?.isDraft && (
              <div className="mb-4">
                <label className="text-sm font-medium text-slate-600">Department</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm mt-1"
                  value={draftDepartment}
                  onChange={e => setDraftDepartment(e.target.value)}
                  placeholder="e.g. Cardiology"
                />
              </div>
            )}

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-cyan-50 text-slate-600">
                  <tr>
                    <th className="p-2 text-left">No.</th>
                    <th className="p-2 text-left">Medication Name</th>
                    <th className="p-2 text-left">Frequency</th>
                    <th className="p-2 text-left">Quantity</th>
                    <th className="p-2 text-left">Usage Instruction</th>
                    <th className="p-2 text-left">Note</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRx?.isDraft ? (
                    draftMeds.map((med, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2">{index + 1}</td>
                        <td className="p-2"><input className="w-full border rounded px-2 py-1" value={med.name} placeholder="Medication name" onChange={e => updateMedication(index, "name", e.target.value)} /></td>
                        <td className="p-2"><input className="w-full border rounded px-2 py-1" value={med.frequency} placeholder="e.g. 3 times daily" onChange={e => updateMedication(index, "frequency", e.target.value)} /></td>
                        <td className="p-2"><input className="w-full border rounded px-2 py-1" value={med.quantity} placeholder="Quantity" onChange={e => updateMedication(index, "quantity", e.target.value)} /></td>
                        <td className="p-2"><input className="w-full border rounded px-2 py-1" value={med.instruction} placeholder="Instruction" onChange={e => updateMedication(index, "instruction", e.target.value)} /></td>
                        <td className="p-2"><input className="w-full border rounded px-2 py-1" value={med.note || ""} placeholder="Note" onChange={e => updateMedication(index, "note", e.target.value)} /></td>
                        <td className="p-2 text-center">
                          {index !== draftMeds.length - 1 && (
                            <button onClick={() => removeMedication(index)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Remove medication">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : selectedRx ? (
                    selectedRx.medications.map((med, index) => (
                      <tr key={index} className="border-t hover:bg-slate-50">
                        <td className="p-2">{index + 1}</td>
                        <td className="p-2">{med.name}</td>
                        <td className="p-2">{med.frequency}</td>
                        <td className="p-2">{med.quantity}</td>
                        <td className="p-2">{med.instruction}</td>
                        <td className="p-2">{med.note ?? "-"}</td>
                        <td className="p-2"></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        Select a prescription or click "+ Add" to create one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
=======
import { useState } from "react"
>>>>>>> backend
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trash2, History, Pill } from "lucide-react"
import {  Table,  TableHeader,  TableBody,  TableHead,  TableRow,  TableCell} from "@/components/ui/table"

type Medication = {
  name: string
  quantity: string
  frequency: string
  instruction: string
  note?: string
}

type Prescription = {
  id: string
  date: string
  doctor: string
  medications: Medication[]
  isDraft?: boolean
}

const MOCK_PRESCRIPTIONS: Prescription[] = [
  {
    id: "rx-1",
    date: "16/10/2025 14:00",
    doctor: "Dr. Trang Thanh Nghiep",
    medications: [
      {
        name: "Paracetamol",
        quantity: "14",
        frequency: "3 times daily",
        instruction: "After meal",
        note: "Use with caution in patients with drug allergies",
      },
      {
        name: "Vitamin C",
        frequency: "Once daily",
        quantity: "12",
        instruction: "After meal",
      },
    ],
  },
  {
    id: "rx-2",
    date: "10/10/2025 09:30",
    doctor: "Dr. Nguyen Van B",
    medications: [
      {
        name: "Amoxicillin",
        frequency: "3 times daily",
        quantity: "1 capsule",
        instruction: "After meal",
      },
    ],
  },
]

export default function PatientPrescription() {
  const { patientId } = useParams()
  const pid = Number(patientId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [selectedRx, setSelectedRx] = useState<(Prescription & { isDraft?: boolean }) | null>(null)
  const [draftMeds, setDraftMeds] = useState<Medication[]>([])
  const [draftDepartment, setDraftDepartment] = useState("")

  useEffect(() => {
    if (pid) loadPrescriptions()
  }, [pid])

  const loadPrescriptions = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await doctorService.getPrescriptions(pid)
      setPrescriptions(res.prescriptions)
      if (res.prescriptions.length > 0) {
        setSelectedRx(res.prescriptions[0])
      }
    } catch (err: any) {
      setError(err.message || "Failed to load prescriptions")
    } finally {
      setLoading(false)
    }
  }

  const handleAddPrescription = () => {
    const newPrescription: Prescription = {
        id: "new",
        date: "New prescription",
        doctor: "Current doctor",
        medications: [],
        isDraft: true,
    }

    setSelectedRx(newPrescription)
        setDraftMeds([
            { name: "", frequency: "", quantity: "", instruction: "", note: "" },
        ])
    }


    const [prescriptions, setPrescriptions] =
    useState<Prescription[]>(MOCK_PRESCRIPTIONS)

    const [selectedRx, setSelectedRx] = useState<Prescription>(
    MOCK_PRESCRIPTIONS[0]
    )

    const [draftMeds, setDraftMeds] = useState<Medication[]>([])

    const updateMedication = (
        index: number,
        field: keyof Medication,
        value: string
        ) => {
        const updated = [...draftMeds]
        updated[index][field] = value

        setDraftMeds(updated)

        // 👉 nếu đang sửa dòng cuối + đã nhập tên thuốc
        if (
            index === draftMeds.length - 1 &&
            field === "name" &&
            value.trim() !== ""
        ) {
            setDraftMeds([
            ...updated,
            { name: "", frequency: "", quantity: "", instruction: "", note: "" },
            ])
        }
    }


  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ===== LEFT: Prescription List ===== */}
      <Card className="col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History size={18} />
            <h3 className="font-semibold text-lg">Prescription History</h3>
<<<<<<< HEAD
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
                  <TableHead className="p-2 text-left w-[100px] text-white">Date</TableHead>
                  <TableHead className="p-2 text-left w-[200px] text-white">Doctor</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {prescriptions.map(rx => (
                  <TableRow
                    key={rx.id}
                    onClick={() => {
                      setSelectedRx({ ...rx, isDraft: false })
                      setDraftMeds([])
                    }}
                    className={`border-t cursor-pointer
                      ${
                        selectedRx.id === rx.id
                          ? "bg-cyan-50"
                          : ""
                      }`}
                  >
                    <TableCell className="p-2">{rx.date}</TableCell>
                    <TableCell className="p-2">{rx.doctor}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

        {/* RIGHT: Medication Table */}
        <Card className="col-span-8">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex">
                <Pill />
                <h3 className="font-semibold text-lg flex items-center gap-2 ml-2">Prescription</h3>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4" onClick={handleAddPrescription}>
                  + Add
                </Button>
                {selectedRx?.isDraft && (
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

            {/* Department input for drafts */}
            {selectedRx?.isDraft && (
              <div className="mb-4">
                <label className="text-sm font-medium text-slate-600">Department</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm mt-1"
                  value={draftDepartment}
                  onChange={e => setDraftDepartment(e.target.value)}
                  placeholder="e.g. Cardiology"
                />
              </div>
            )}

          <div className="overflow-x-auto border rounded-lg">
            <Table className="w-full text-sm">
              <TableHeader>
                {/* HEADER ROW 1 */}
                <TableRow
                  style={{
                    background:
                      "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                  }}
                >
                  <TableHead rowSpan={2} className="p-2 text-white">No.</TableHead>

=======
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
                  <TableHead className="p-2 text-left w-[100px] text-white">Date</TableHead>
                  <TableHead className="p-2 text-left w-[200px] text-white">Doctor</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {prescriptions.map(rx => (
                  <TableRow
                    key={rx.id}
                    onClick={() => {
                      setSelectedRx({ ...rx, isDraft: false })
                      setDraftMeds([])
                    }}
                    className={`border-t cursor-pointer
                      ${
                        selectedRx.id === rx.id
                          ? "bg-cyan-50"
                          : ""
                      }`}
                  >
                    <TableCell className="p-2">{rx.date}</TableCell>
                    <TableCell className="p-2">{rx.doctor}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ===== RIGHT: Medication Table ===== */}
      <Card className="col-span-8">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex">
                <Pill></Pill>
                <h3 className="font-semibold text-lg flex items-center gap-2 ml-2">
                    Prescription
                </h3>
            </div>
            <div className="flex gap-2">
                <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"
                    onClick={handleAddPrescription}>+ Add
                </Button>
                <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
                    Save
                </Button>
                <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
                    Cancel
                </Button>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <Table className="w-full text-sm">
              <TableHeader>
                {/* HEADER ROW 1 */}
                <TableRow
                  style={{
                    background:
                      "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                  }}
                >
                  <TableHead rowSpan={2} className="p-2 text-white">No.</TableHead>

>>>>>>> backend
                  <TableHead rowSpan={2} className="p-2 text-white whitespace-nowrap">
                    Medication Name
                  </TableHead>

                  <TableHead rowSpan={2} className="p-2 text-white">
                    Quantity
                  </TableHead>

                  <TableHead colSpan={3} className="p-2 text-center text-white">
                    Instruction
                  </TableHead>

                  <TableHead rowSpan={2}></TableHead>
                </TableRow>

                {/* HEADER ROW 2 */}
                <TableRow
                  style={{
                    background:
                      "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                  }}
                >
                  <TableHead className="p-2 text-white text-center">Frequency (per day)</TableHead>
                  <TableHead className="p-2 text-white text-center">Usage</TableHead>
                  <TableHead className="p-2 text-white text-center">Note</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                    {/* ===== MODE: CREATE NEW PRESCRIPTION ===== */}
                    {selectedRx.isDraft ? (
                        draftMeds.map((med, index) => (
                        <TableRow key={index} className="border-t" onBlur={() => handleRowBlur(index)}>
                            <TableCell className="p-2">{index + 1}</TableCell>

                            <TableCell className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.name}
                                placeholder="Medication name"
                                onChange={e =>
                                updateMedication(index, "name", e.target.value)
                                }
                            />
                            </TableCell>

                            <TableCell className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.quantity}
                                placeholder="Quantity"
                                onChange={e =>
                                updateMedication(index, "quantity", e.target.value)
                                }
                            />
                            </TableCell>

                            <TableCell className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.frequency}
                                placeholder="e.g. 3 times daily"
                                onChange={e =>
                                updateMedication(index, "frequency", e.target.value)
                                }
                            />
                            </TableCell>

                            <TableCell className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.instruction}
                                placeholder="Instruction"
                                onChange={e =>
                                updateMedication(index, "instruction", e.target.value)
                                }
                            />
                            </TableCell>

                            <TableCell className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.note}
                                placeholder="Note"
                                onChange={e =>
                                updateMedication(index, "note", e.target.value)
                                }
                            />
                            </TableCell>

                            <TableCell className="p-2 text-center">
                                {index !== draftMeds.length - 1 && (
                                    <button
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
                        /* ===== MODE: VIEW EXISTING PRESCRIPTION ===== */
                        selectedRx.medications.map((med, index) => (
                        <TableRow key={index} className="border-t hover:bg-slate-50">
                            <TableCell className="p-2">{index + 1}</TableCell>
                            <TableCell className="p-2">{med.name}</TableCell>
                            <TableCell className="p-2 text-center">{med.quantity}</TableCell>
                            <TableCell className="p-2">{med.frequency}</TableCell>
                            <TableCell className="p-2">{med.instruction}</TableCell>
                            <TableCell className="p-2">{med.note ?? "-"}</TableCell>
                            <TableCell className="p-2"></TableCell>
                        </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
<<<<<<< HEAD
=======

>>>>>>> eca8cbaa (add some page in doctor portal)
>>>>>>> backend
