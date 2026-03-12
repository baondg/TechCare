"use client"

import { useState } from "react"
import { Calendar, Search, Plus, RefreshCcw, X, ChevronLeft, ChevronRight } from "lucide-react"
import { NurseLayout } from "@/components/nurse-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { format } from "date-fns"

export default function NurseAppointmentsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const doctors = ["Cardiology", "Orthopedics", "Dermatology", "Ophthalmology"]

  const timeSlots = [
    "11:00","11:10","11:20","11:30","11:40",
    "11:50","12:00","13:00","13:10"
  ]

  return (
    <NurseLayout>
      <div className="space-y-8">

        {/* HEADER (GIỐNG PATIENT) */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="h-12 text-3xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
              Appointment Management
            </h2>
            <p className="text-slate-600 text-lg">
              Manage hospital schedule and appointment slots
            </p>
          </div>

          <div className="flex gap-3">
            <Button className="btn-gradient h-14 px-6">
              <Plus className="w-5 h-5 mr-2" />
              Create Appointment
            </Button>

            <Button variant="outline" className="h-14 px-6">
              <RefreshCcw className="w-5 h-5 mr-2" />
              Reschedule
            </Button>

            <Button
              variant="outline"
              className="h-14 px-6 border-red-200 text-red-700 hover:bg-red-50"
            >
              <X className="w-5 h-5 mr-2" />
              Cancel
            </Button>
          </div>
        </div>

        {/* FILTER (GIỐNG PATIENT) */}
        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-xs">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-10 h-12 text-base"
                />
              </div>

              <span className="text-slate-400">to</span>

              <div className="relative flex-1 max-w-xs">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-10 h-12 text-base"
                />
              </div>

              <Button
                variant="outline"
                className="h-12 px-6 border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Search className="w-5 h-5 mr-2" />
                Filter
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* CALENDAR + TIMELINE (NEW SECTION) */}
        <div className="grid grid-cols-12 gap-6">

          {/* LEFT CALENDAR */}
          <Card className="col-span-4 card-feature border-slate-200/60">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-lg">
                  {format(selectedDate, "MMMM yyyy")}
                </h3>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {[1,2,3,4,5].map((week) => (
                  <div
                    key={week}
                    className="grid grid-cols-7 gap-2 bg-slate-50 p-3 rounded-lg text-sm"
                  >
                    {[...Array(7)].map((_, i) => (
                      <div
                        key={i}
                        className="text-center py-2 rounded-md hover:bg-cyan-100 cursor-pointer transition-all duration-200"
                      >
                        {week * 7 + i}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* RIGHT TIMELINE */}
          <Card className="col-span-8 card-feature border-slate-200/60">
            <CardContent className="p-6">

              <h3 className="font-semibold text-lg mb-6">
                {format(selectedDate, "dd, MMMM yyyy")}
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-3 text-sm font-semibold text-slate-600">
                        Time
                      </th>
                      {doctors.map((doc) => (
                        <th
                          key={doc}
                          className="text-left p-3 text-sm font-semibold text-slate-600 bg-cyan-50"
                        >
                          {doc}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {timeSlots.map((time) => (
                      <tr key={time} className="border-t">
                        <td className="p-3 text-sm text-slate-500">
                          {time}
                        </td>

                        {doctors.map((doc) => (
                          <td
                            key={doc}
                            className="p-3 text-sm hover:bg-cyan-50 cursor-pointer transition-all duration-200"
                          >
                            <div className="bg-slate-100 rounded-md p-2 text-xs">
                              Available
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </CardContent>
          </Card>

        </div>
      </div>
    </NurseLayout>
  )
}