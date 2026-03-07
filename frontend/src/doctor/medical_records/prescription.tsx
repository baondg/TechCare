"use client"

import { useState } from "react"
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
    const isEmptyMedication = (med: Medication) =>
        !med.name &&
        !med.frequency &&
        !med.quantity &&
        !med.instruction &&
        !med.note

    const removeMedication = (index: number) => {
        setDraftMeds(prev => {
            // kh├┤ng cho x├│a d├▓ng cuß╗æi
            if (index === prev.length - 1) return prev
            return prev.filter((_, i) => i !== index)
        })
    }

    const handleRowBlur = (index: number) => {
        setDraftMeds(prev => {
            // kh├┤ng ─æß╗Ñng d├▓ng cuß╗æi
            if (index === prev.length - 1) return prev

            if (isEmptyMedication(prev[index])) {
                return prev.filter((_, i) => i !== index)
            }

            return prev
        })
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

        // ≡ƒæë nß║┐u ─æang sß╗¡a d├▓ng cuß╗æi + ─æ├ú nhß║¡p t├¬n thuß╗æc
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

