"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, Calendar, Clock, TrendingUp } from "lucide-react"
import { Link } from "react-router-dom";
import { TechnicianLayout } from "@/components/technician-layout"
import { CollapsibleSection } from "@/components/collapsible-section"

export default function NurseDashboard() {
  return (
    <TechnicianLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">Welcome! Here's your overview</h2>
        </div>

        <CollapsibleSection title="Overview Statistics" description="Today's performance metrics" defaultOpen={true}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Patients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">12</div>
                <p className="text-xs text-muted-foreground">3 completed, 9 remaining</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Appointments</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">8</div>
                <p className="text-xs text-muted-foreground">This week</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Wait Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">18 min</div>
                <p className="text-xs text-muted-foreground">-5 min from last week</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Patient Satisfaction</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">4.8/5</div>
                <p className="text-xs text-muted-foreground">Based on 45 reviews</p>
              </CardContent>
            </Card>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Today's Schedule"
          description="Your appointments for December 15, 2025"
          defaultOpen={true}
        >
          <div className="space-y-4">
            {[
              { time: "09:00 AM", patient: "John Doe", type: "General Checkup", status: "completed" },
              { time: "10:00 AM", patient: "Jane Smith", type: "Follow-up", status: "in-progress" },
              { time: "11:00 AM", patient: "Michael Brown", type: "New Patient", status: "waiting" },
              { time: "02:00 PM", patient: "Emily Davis", type: "Consultation", status: "scheduled" },
            ].map((apt, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="text-sm font-medium w-20">{apt.time}</div>
                  <div>
                    <p className="font-medium">{apt.patient}</p>
                    <p className="text-sm text-muted-foreground">{apt.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      apt.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : apt.status === "in-progress"
                          ? "bg-blue-100 text-blue-700"
                          : apt.status === "waiting"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {apt.status}
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/doctor/patients/${idx + 1}`}>View</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <div className="grid gap-6 md:grid-cols-2">
          <CollapsibleSection title="Recent Patients" description="Patients you've seen recently" defaultOpen={true}>
            <div className="space-y-3">
              {["John Doe", "Jane Smith", "Michael Brown"].map((name, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-sm text-muted-foreground">Last visit: Dec {15 - idx}, 2025</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/doctor/patients/${idx + 1}`}>View EMR</Link>
                  </Button>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="AI Insights" description="Intelligent recommendations" defaultOpen={true}>
            <div className="space-y-3">
              <div className="p-3 border rounded-lg bg-primary/5">
                <p className="text-sm font-medium">High Priority</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Patient Michael Brown shows symptoms requiring immediate attention
                </p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="text-sm font-medium">Schedule Optimization</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Consider adding 2 more slots on Thursday for better patient flow
                </p>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </TechnicianLayout>
  )
}
