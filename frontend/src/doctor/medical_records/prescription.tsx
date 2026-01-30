"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trash2, History, Pill } from "lucide-react"

type Medication = {
  name: string
  frequency: string
  quantity: string
  instruction: string
  note?: string
}

type Prescription = {
  id: string
  date: string
  doctor: string
  department: string
  medications: Medication[]
  isDraft?: boolean
}

const MOCK_PRESCRIPTIONS: Prescription[] = [
  {
    id: "rx-1",
    date: "16/10/2025 14:00",
    doctor: "Dr. Trang Thanh Nghiep",
    department: "Cardiology",
    medications: [
      {
        name: "Paracetamol",
        frequency: "3 times daily",
        quantity: "1 tablet each time",
        instruction: "After meal",
        note: "Use with caution in patients with drug allergies",
      },
      {
        name: "Vitamin C",
        frequency: "Once daily",
        quantity: "1 tablet",
        instruction: "After meal",
      },
    ],
  },
  {
    id: "rx-2",
    date: "10/10/2025 09:30",
    doctor: "Dr. Nguyen Van B",
    department: "Internal Medicine",
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
            // không cho xóa dòng cuối
            if (index === prev.length - 1) return prev
            return prev.filter((_, i) => i !== index)
        })
    }

    const handleRowBlur = (index: number) => {
        setDraftMeds(prev => {
            // không đụng dòng cuối
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
        department: "Cardiology",
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
            <div className="flex">
                <History></History>
                <h3 className="font-semibold text-lg flex items-center gap-2 ml-2">
                    History
                </h3>
            </div>
          {MOCK_PRESCRIPTIONS.map(rx => (
            <div
              key={rx.id}
              onClick={() => {
                setSelectedRx({ ...rx, isDraft: false })
                setDraftMeds([])
                }}
              className={`
                cursor-pointer rounded-lg border p-3 transition
                ${
                  selectedRx.id === rx.id
                    ? "bg-cyan-50 border-cyan-400"
                    : "hover:bg-slate-50"
                }
              `}
            >
              <p className="font-medium">{rx.date}</p>
              <p className="text-sm text-slate-600">
                {rx.doctor} - {rx.department}
              </p>
            </div>
          ))}
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
                    {/* ===== MODE: CREATE NEW PRESCRIPTION ===== */}
                    {selectedRx.isDraft ? (
                        draftMeds.map((med, index) => (
                        <tr key={index} className="border-t" onBlur={() => handleRowBlur(index)}>
                            <td className="p-2">{index + 1}</td>

                            <td className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.name}
                                placeholder="Medication name"
                                onChange={e =>
                                updateMedication(index, "name", e.target.value)
                                }
                            />
                            </td>

                            <td className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.frequency}
                                placeholder="e.g. 3 times daily"
                                onChange={e =>
                                updateMedication(index, "frequency", e.target.value)
                                }
                            />
                            </td>

                            <td className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.quantity}
                                placeholder="Quantity"
                                onChange={e =>
                                updateMedication(index, "quantity", e.target.value)
                                }
                            />
                            </td>

                            <td className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.instruction}
                                placeholder="Instruction"
                                onChange={e =>
                                updateMedication(index, "instruction", e.target.value)
                                }
                            />
                            </td>

                            <td className="p-2">
                            <input
                                className="w-full border rounded px-2 py-1"
                                value={med.note}
                                placeholder="Note"
                                onChange={e =>
                                updateMedication(index, "note", e.target.value)
                                }
                            />
                            </td>

                            <td className="p-2 text-center">
                                {index !== draftMeds.length - 1 && (
                                    <button
                                    onClick={() => removeMedication(index)}
                                    className="text-red-500 hover:bg-red-50 p-1 rounded"
                                    title="Remove medication"
                                    >
                                    <Trash2 size={16} />
                                    </button>
                                )}
                            </td>
                        </tr>
                        ))
                    ) : (
                        /* ===== MODE: VIEW EXISTING PRESCRIPTION ===== */
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
                    )}
                </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

