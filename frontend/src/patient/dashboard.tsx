"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, Pill, Activity, Clock, TrendingUp, BotMessageSquare, HeartPlus, Bell,ChevronRight,User,TestTube } from "lucide-react"
import { Link } from "react-router-dom";
import { PatientLayout } from "@/components/patient-layout"
import { CollapsibleSection } from "@/components/collapsible-section"

export default function PatientDashboard() {
  return (
    <PatientLayout>
      
      <div className="relative space-y-8 pb-12">
        {/* Header Section với gradient text */}
        
        {/* <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2 bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent animate-gradient">
                Welcome, Data:user!
              </h2>
              <p className="text-slate-600 text-lg">Here's your health overview for today</p>
            </div>
          </div>
        </div> */}

        {/* Quick Stats Cards - Design mới với gradient border */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 ">
          <Link to="/patient/appointments">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="card-icon-wrapper h-12 w-12">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-slate-500 mb-1">Next Appointment</h3>
                <div className="text-lg font-bold text-slate-900 mb-1">Tomorrow</div>
                <p className="text-sm text-slate-600">10:00 AM • Dr. Sarah</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/patient/records">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="card-icon-wrapper h-12 w-12">
                    <Activity className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-slate-500 mb-1">Current Diagnosis</h3>
                <div className="text-xl font-bold text-slate-900 mb-1">Acute Upper Respiratory</div>
                <p className="text-sm text-slate-600">J06.9</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/patient/records?tab=prescriptions">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="card-icon-wrapper h-12 w-12">
                    <Pill className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500" />
                </div>

                <h3 className="text-sm font-medium text-slate-500 mb-1">
                  Active prescriptions
                </h3>

                <div className="text-xl font-bold text-slate-900 mb-1">
                  2 prescriptions
                </div>

                <p className="text-sm text-slate-600">
                  Next dose: 2:00 PM
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/patient/records?tab=lab-results">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="card-icon-wrapper h-12 w-12">
                    <TestTube className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500" />
                </div>

                <h3 className="text-sm font-medium text-slate-500 mb-1">
                  Lab Results
                </h3>

                <div className="text-xl font-bold text-slate-900 mb-1">
                  3 results
                </div>

                <p className="text-sm text-slate-600">
                  Last test: Dec 15
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

                {/* Two Column Layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Active Medications */}
          <CollapsibleSection
            title="Active Medications"
            description="Current prescriptions"
            icon={<Pill className="h-5 w-5" />}
            defaultOpen={true}
          >
            <div className="space-y-3">
              <Card className="card-feature-group">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="icon-feature-card">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-linear-to-br from-purple-50 to-purple-100">
                          <Pill className="h-6 w-6 text-purple-600" />
                        </div>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Amoxicillin 500mg</p>
                        <p className="text-sm text-slate-600">3 times daily</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        5 days left
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-feature-group">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="icon-feature-card">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-linear-to-br from-orange-50 to-orange-100">
                          <Pill className="h-6 w-6 text-orange-600" />
                        </div>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Vitamin D3 1000 IU</p>
                        <p className="text-sm text-slate-600">Once daily</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Ongoing
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Button variant="outline" size="sm" className="w-full mt-4 btn-gradient transition-transform duration-500">
              View All Medications
            </Button>
          </CollapsibleSection>

          {/* Recovery Progress */}
          <CollapsibleSection
            title="Recovery Progress"
            description="AI-predicted recovery timeline"
            icon={<TrendingUp className="h-5 w-5" />}
            defaultOpen={true}
          >
            <Card className="card-feature-group">
              <CardContent className="p-4">
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-slate-700">Overall Recovery</span>
                      <span className="text-2xl font-bold bg-linear-to-r from-[#06b6d4] to-[#0891b2] bg-clip-text text-transparent">
                        75%
                      </span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
                      <div 
                        className="h-full bg-linear-to-r from-[#06b6d4] to-[#0891b2] rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                        style={{ width: "75%" }}
                      >
                        <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-linear-to-br from-cyan-50 to-blue-50 rounded-xl border border-cyan-100">
                    <p className="text-sm text-slate-700 leading-relaxed">
                      <span className="font-semibold text-cyan-700">Great progress!</span> Based on your current treatment and recovery rate, you're expected to fully recover in approximately <span className="font-semibold text-cyan-700">5-7 days</span>.
                    </p>
                  </div>

                  <Button className="w-full btn-gradient transition-transform duration-500 flex items-center justify-center gap-2">
                    View Detailed Progress
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </CollapsibleSection>
        </div>

        {/* Upcoming Appointments Section */}
        <CollapsibleSection 
          title="Upcoming Appointments" 
          description="Your scheduled visits" 
          defaultOpen={true}
        >
          <div className="space-y-4">
            <Card className="card-feature-group transition-all duration-300 hover:shadow-lg ">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="icon-feature-card">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-cyan-50 to-cyan-100">
                        <Calendar className="h-7 w-7" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xl font-semibold mb-1">Follow-up Visit</p>
                      <p className="text-sm text-slate-600 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Dr. Sarah Johnson - Cardiology
                      </p>
                      <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                        <Clock className="h-4 w-4" />
                        Tomorrow, 10:00 AM
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="btn-outline">
                      Reschedule
                    </Button>
                    <Button variant="outline" size="sm" className="hover:bg-red-50 hover:text-red-600 hover:border-red-300">
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-feature-group transition-all duration-300 hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="icon-feature-card">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-emerald-50 to-emerald-100">
                        <Calendar className="h-7 w-7 text-emerald-600" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xl font-semibold mb-1">General Check-up</p>
                      <p className="text-sm text-slate-600 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Dr. Michael Chen - Internal Medicine
                      </p>
                      <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                        <Clock className="h-4 w-4" />
                        Dec 20, 2025, 2:30 PM
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="btn-outline">
                    Feedback
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Button className="w-full mt-6 btn-gradient transition-transform duration-500" asChild>
            <Link to="/patient/appointments" className="flex items-center justify-center gap-2">
              View All Appointments
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </CollapsibleSection>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }

        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </PatientLayout>
  )
}
