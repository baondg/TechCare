"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Pencil } from "lucide-react"

type Surgery = {
  id: string
  procedureCode: string
  procedureName: string
  date: string
  surgeon: string
  urgency: string
  status: string
  result: string
  note?: string
  isDraft?: boolean
}

const MOCK_SURGERIES: Surgery[] = [
  {
    id: "s-1",
    procedureCode: "OP123456789",
    procedureName: "Appendectomy",
    date: "07/10/2025",
    surgeon: "Dr. Trang Thanh Nghiep",
    urgency: "Urgent",
    status: "In progress",
    result: "Normal",
    note: "None",
  },
  {
    id: "s-2",
    procedureCode: "OP123456789",
    procedureName: "Appendectomy",
    date: "05/11/2025 14:00",
    surgeon: "Dr. Trang Thanh Nghiep",
    urgency: "Urgent",
    status: "Completed",
    result: "Successful",
    note: "",
  },
]

export default function PatientSurgery() {
  const [surgeries] = useState<Surgery[]>(MOCK_SURGERIES)
  const [selected, setSelected] = useState<Surgery>(MOCK_SURGERIES[0])
  const [isEdit, setIsEdit] = useState(false)

  const handleAdd = () => {
    setSelected({
      id: "new",
      procedureCode: "",
      procedureName: "",
      date: "",
      surgeon: "",
      urgency: "",
      status: "",
      result: "",
      note: "",
      isDraft: true,
    })
    setIsEdit(true)
  }

  const viewMode = !isEdit && !selected.isDraft

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ===== LEFT: SURGERY TABLE ===== */}
      <Card className="col-span-5">
        <CardContent className="p-4">
          <table className="w-full text-sm">
            <thead className="bg-cyan-50 text-slate-600">
              <tr>
                <th className="p-2 text-left">No.</th>
                <th className="p-2 text-left">Procedure</th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Surgeon</th>
              </tr>
            </thead>
            <tbody>
              {surgeries.map((s, i) => (
                <tr
                  key={s.id}
                  onClick={() => {
                    setSelected({ ...s, isDraft: false })
                    setIsEdit(false)
                  }}
                  className={`cursor-pointer border-t hover:bg-slate-50
                    ${
                      selected.id === s.id
                        ? "bg-cyan-50"
                        : ""
                    }`}
                >
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">{s.procedureCode}</td>
                  <td className="p-2">{s.date}</td>
                  <td className="p-2">{s.surgeon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ===== RIGHT: SURGERY DETAIL ===== */}
      <Card className="col-span-7">
        <CardContent className="p-5 space-y-4">
          <div className="flex justify-between">
            <div className="flex gap-2">
              <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4" onClick={handleAdd}>
                <Plus size={16} /> Add
              </Button>
              <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
                Clear
              </Button>
              <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
                Save
              </Button>
              <Button size="sm" className="btn-outline transition-transform duration-500 text-xl px-7 py-4">
                Cancel
              </Button>
            </div>

            {viewMode && (
              <Button
                size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4" 
                onClick={() => setIsEdit(true)}
              >
                <Pencil size={16} /> Edit Note
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Patient" value="Nguyen Van A" />
            <Field label="Surgeon" value={selected.surgeon} />

            <Field label="Procedure" value={selected.procedureName} />
            <Field label="Date" value={selected.date} />

            <Field label="Urgency" value={selected.urgency} />
            <Field label="Status" value={selected.status} />
          </div>

          <TextArea
            label="Result (Short description)"
            value={selected.result}
            editable={!viewMode}
            onChange={v =>
              setSelected({ ...selected, result: v })
            }
          />

          <TextArea
            label="Doctor’s Note"
            value={selected.note ?? ""}
            editable={!viewMode}
            onChange={v =>
              setSelected({ ...selected, note: v })
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

/* ===== SMALL COMPONENTS ===== */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <div className="border rounded px-2 py-1 text-sm bg-slate-50">
        {value || "-"}
      </div>
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
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <div className="border rounded px-2 py-2 text-sm bg-slate-50">
          {value || "-"}
        </div>
      )}
    </div>
  )
}
