"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PatientLayout } from "@/components/patient-layout"
import { FileText, Download, Calendar, User, Pill, AlertCircle, Loader2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSearchParams } from "react-router-dom"
import { appointmentService, type PatientDashboardSummary } from "@/services/appointment-service"

const visits = [
  {
    id: 1,
    date: "2025-12-10",
    doctor: "Dr. Emily Wong",
    department: "Laboratory",
    diagnosis: "Annual Health Checkup",
    icd10: "Z00.00",
    prescription: "Vitamin D3 1000 IU - Once daily",
    notes: "All lab results within normal range. Continue current lifestyle.",
  },
  {
    id: 2,
    date: "2025-11-15",
    doctor: "Dr. Michael Chen",
    department: "Internal Medicine",
    diagnosis: "Upper Respiratory Infection",
    icd10: "J06.9",
    prescription: "Amoxicillin 500mg - 3 times daily for 7 days",
    notes: "Patient presented with cough and mild fever. Prescribed antibiotics.",
  },
]

export default function RecordsPage() {
  const [searchParams] = useSearchParams()
  const tab = searchParams.get("tab")
  const [rxLoading, setRxLoading] = useState(true)
  const [rxDashboard, setRxDashboard] = useState<PatientDashboardSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await appointmentService.getPatientDashboardSummary()
        if (!cancelled) setRxDashboard(data)
      } catch (e) {
        console.error("Load prescriptions for records failed:", e)
      } finally {
        if (!cancelled) setRxLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const prescriptionGroups = rxDashboard?.activePrescriptionsList ?? []

  return (
    <PatientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">History</h2>
            <p className="text-muted-foreground">Your complete health history</p>
          </div>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Records
          </Button>
        </div>

        <Tabs defaultValue={tab || "visits"} className="space-y-4">
          <TabsList>
            <TabsTrigger value="visits">Medical records</TabsTrigger>
            <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
            <TabsTrigger value="lab-results">Lab Results</TabsTrigger>
            <TabsTrigger value="symptom-checker">Symptom checker</TabsTrigger>
          </TabsList>

          <TabsContent value="visits" className="space-y-4">
            {visits.map((visit) => (
              <Card key={visit.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {visit.diagnosis}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {visit.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {visit.doctor}
                        </span>
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm">
                      View Full Record
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Department</p>
                      <p className="text-sm">{visit.department}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">ICD-10 Code</p>
                      <p className="text-sm">{visit.icd10}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Prescription</p>
                      <p className="text-sm">{visit.prescription}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Doctor's Notes</p>
                      <p className="text-sm">{visit.notes}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="prescriptions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pill className="h-5 w-5" />
                  Prescriptions
                </CardTitle>
                <CardDescription>
                  Only prescriptions your doctor has signed appear here. Draft or unsigned orders stay in the clinic
                  portal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rxLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading…</span>
                  </div>
                ) : prescriptionGroups.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No signed prescriptions yet.</p>
                ) : (
                  <div className="space-y-4">
                    {prescriptionGroups.map((rx) => {
                      const dateLabel = (() => {
                        try {
                          const d = new Date(rx.prescribedAt)
                          return Number.isNaN(d.getTime()) ? String(rx.prescribedAt) : d.toLocaleString("vi-VN")
                        } catch {
                          return String(rx.prescribedAt)
                        }
                      })()
                      return (
                        <div key={rx.id} className="space-y-2 rounded-lg border p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Prescription · {dateLabel}
                          </p>
                          <div className="space-y-2">
                            {rx.medications.map((med) => (
                              <div
                                key={med.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium">{med.name}</p>
                                  <p className="text-sm text-muted-foreground">{med.frequency || "—"}</p>
                                </div>
                                <span className="text-xs text-muted-foreground">Qty: {med.quantity || "—"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lab-results" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Lab Results</CardTitle>
                <CardDescription>2025-12-10 - Annual Health Checkup</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Complete Blood Count (CBC)</p>
                      <p className="text-sm text-muted-foreground">All values within normal range</p>
                    </div>
                    <span className="text-sm text-green-600 font-medium">Normal</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Lipid Panel</p>
                      <p className="text-sm text-muted-foreground">Cholesterol: 180 mg/dL</p>
                    </div>
                    <span className="text-sm text-green-600 font-medium">Normal</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Blood Glucose</p>
                      <p className="text-sm text-muted-foreground">Fasting: 95 mg/dL</p>
                    </div>
                    <span className="text-sm text-green-600 font-medium">Normal</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="symptom-checker" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>History symptom check</CardTitle>
                <CardDescription>2025-12-10</CardDescription>
              </CardHeader>
              <CardContent>
                <Card
                    key="1"
                    className={`border-2 ${
                      "border-amber-300"
                    }`}
                  >
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center gap-3">
                        <AlertCircle className="h-8 w-8 text-red-600" />
                        data:condition
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-md">
                      <p>
                        <strong>Recommendation:</strong> data:recommendation
                      </p>
                      <p>data:details</p>
                    </CardContent>
                  </Card>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PatientLayout>
  )
}
