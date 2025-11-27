"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PatientLayout } from "@/components/patient-layout"
import { FileText, Download, Calendar, User, Pill } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  return (
    <PatientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Medical Records</h2>
            <p className="text-muted-foreground">Your complete health history</p>
          </div>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Records
          </Button>
        </div>

        <Tabs defaultValue="visits" className="space-y-4">
          <TabsList>
            <TabsTrigger value="visits">Visit History</TabsTrigger>
            <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
            <TabsTrigger value="lab-results">Lab Results</TabsTrigger>
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
                  Current Prescriptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">Amoxicillin 500mg</p>
                        <p className="text-sm text-muted-foreground mt-1">3 times daily with food</p>
                        <p className="text-sm text-muted-foreground">Prescribed: 2025-11-15</p>
                        <p className="text-sm text-muted-foreground">Duration: 7 days</p>
                      </div>
                      <Button variant="outline" size="sm">
                        Details
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">Vitamin D3 1000 IU</p>
                        <p className="text-sm text-muted-foreground mt-1">Once daily</p>
                        <p className="text-sm text-muted-foreground">Prescribed: 2025-12-10</p>
                        <p className="text-sm text-muted-foreground">Duration: Ongoing</p>
                      </div>
                      <Button variant="outline" size="sm">
                        Details
                      </Button>
                    </div>
                  </div>
                </div>
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
        </Tabs>
      </div>
    </PatientLayout>
  )
}
