"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { History, FlaskConical, Upload, Pencil } from "lucide-react"

export default function PatientLab() {
  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ===== LEFT: LAB HISTORY TABLE ===== */}
      <Card className="col-span-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-lg">
            <History size={18} />
            Laboratory History
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-[700px] w-full text-sm">
              <thead className="bg-cyan-50 text-slate-600">
                <tr>
                  <th className="p-2 text-left">No.</th>
                  <th className="p-2 text-left">Test Type</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Technician</th>
                  <th className="p-2 text-left">Result</th>
                  <th className="p-2 text-left">File</th>
                  <th className="p-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="border-t hover:bg-slate-50">
                    <td className="p-2">{i}</td>
                    <td className="p-2">Blood Test</td>
                    <td className="p-2">07/10/2025</td>
                    <td className="p-2">Dr. Trang Thanh Nghiep</td>
                    <td className="p-2">Normal</td>
                    <td className="p-2 text-cyan-600 underline cursor-pointer">
                      Nguyen_Van_A_bloodtest.pdf
                    </td>
                    <td className="p-2">None</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ===== RIGHT: LAB DETAIL / EDIT ===== */}
      <Card className="col-span-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-lg">
              <FlaskConical size={18} />
              Laboratory Result
            </div>

            <Button size="sm" className="btn-outline flex gap-2">
              <Pencil size={14} /> Edit Note
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-600">Test type</label>
              <input
                className="w-full border rounded px-3 py-2"
                value="Blood test"
                readOnly
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Date</label>
              <input
                className="w-full border rounded px-3 py-2"
                value="07/10/2025"
                readOnly
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-600">
              Result (Short description)
            </label>
            <input
              className="w-full border rounded px-3 py-2"
              value="Normal"
              readOnly
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">
              Results (image / PDF)
            </label>
            <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-slate-400">
              <Upload size={20} />
              <p className="text-sm mt-2">
                Click to upload or drag and drop
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-600">Doctor's Note</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={3}
              value="None"
              readOnly
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" className="btn-gradient">Save</Button>
            <Button size="sm" className="btn-outline">Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
