"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, FileText, MessageSquare, Pill, Activity, Clock, TrendingUp, BotMessageSquare, HeartPlus } from "lucide-react"
import { Link } from "react-router-dom";
import { PatientLayout } from "@/components/patient-layout"
import { CollapsibleSection } from "@/components/collapsible-section"

export default function PatientDashboard() {
  return (
    <PatientLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">Welcome, Data:Name</h2>
          <p className="text-muted-foreground">Here's your health overview</p>
        </div>

        <CollapsibleSection title="Quick Actions" description="Access key features" defaultOpen={true}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to="/patient/appointments">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Upcomming Visit on</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Data:DateTime</div>
                  <p className="text-xs text-muted-foreground">Data:Doctor</p>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to="/patient/medical-record">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Current Diagnosis</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Data:ICD-10</div>
                  <p className="text-xs text-muted-foreground">Data:Doctor</p>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to="/patient/records">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recovery After</CardTitle>
                  <HeartPlus className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Data:Days</div>
                  <p className="text-xs text-muted-foreground">Days</p>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to="/patient/chatbot">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">AI Assistant</CardTitle>
                  <BotMessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">24/7</div>
                  <p className="text-xs text-muted-foreground">Always available</p>
                </CardContent>
              </Link>
            </Card>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Upcoming Appointments" description="Your scheduled visits" defaultOpen={true}>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Follow-up Visit</p>
                  <p className="text-sm text-muted-foreground">Dr. Sarah Johnson - Cardiology</p>
                  <p className="text-sm text-muted-foreground">Tomorrow, 10:00 AM</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="w-28">
                    Reschedule
                </Button>
                <Button variant="outline" size="sm" className="w-28">
                    Cancel
                </Button>
              </div>
              
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                  <Calendar className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="font-medium">General Check-up</p>
                  <p className="text-sm text-muted-foreground">Dr. Michael Chen - Internal Medicine</p>
                  <p className="text-sm text-muted-foreground">Dec 20, 2025, 2:30 PM</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-28">
               Feedback
              </Button>
            </div>
          </div>

          <Button className="w-full mt-4 bg-transparent" variant="outline" asChild>
            <Link to="/patient/appointments">View All Appointments</Link>
          </Button>
        </CollapsibleSection>

        <div className="grid gap-6 md:grid-cols-2">
          <CollapsibleSection
            title="Active Medications"
            description="Current prescriptions"
            icon={<Pill className="h-5 w-5" />}
            defaultOpen={true}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Amoxicillin 500mg</p>
                  <p className="text-sm text-muted-foreground">3 times daily - 5 days left</p>
                </div>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Vitamin D3 1000 IU</p>
                  <p className="text-sm text-muted-foreground">Once daily - Ongoing</p>
                </div>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Recovery Progress"
            description="AI-predicted recovery timeline"
            icon={<TrendingUp className="h-5 w-5" />}
            defaultOpen={true}
          >
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Overall Recovery</span>
                  <span className="text-sm text-muted-foreground">75%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: "75%" }} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Based on your current treatment, you're expected to fully recover in approximately 5-7 days.
              </p>
              <Button variant="outline" size="sm" className="w-full bg-transparent">
                View Detailed Progress
              </Button>
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </PatientLayout>
  )
}
