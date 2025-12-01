"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PatientLayout } from "@/components/patient-layout"
import { AlertCircle, CheckCircle2, Activity, Clock, AlertTriangle } from "lucide-react"

interface SymptomResult {
  condition: string
  severity: "low" | "medium" | "high"
  recommendation: string
  details: string
}

export default function SymptomChecker() {
  const [step, setStep] = useState(1)
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [duration, setDuration] = useState("")
  const [severity, setSeverity] = useState("")
  const [results, setResults] = useState<SymptomResult[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const commonSymptoms = [
    "Headache",
    "Fever",
    "Cough",
    "Sore Throat",
    "Fatigue",
    "Nausea",
    "Body Aches",
    "Congestion",
    "Dizziness",
    "Chest Pain",
  ]

  const toggleSymptom = (symptom: string) => {
    setSymptoms((prev) => (prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]))
  }

  const handleAnalyze = async () => {
    setIsAnalyzing(true)

    setTimeout(() => {
      const mockResults: SymptomResult[] = [
        {
          condition: "Common Cold",
          severity: "low",
          recommendation: "Rest and self-care at home",
          details:
            "Your symptoms suggest a common cold. Drink fluids, get plenty of rest, and monitor your condition. Contact a doctor if symptoms worsen.",
        },
        {
          condition: "Viral Infection",
          severity: "medium",
          recommendation: "Monitor symptoms closely",
          details:
            "Your symptom combination may indicate a viral infection. Continue monitoring and consider visiting urgent care if symptoms persist beyond 5-7 days.",
        },
      ]
      setResults(mockResults)
      setIsAnalyzing(false)
      setStep(3)
    }, 1500)
  }

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case "low":
        return "text-green-600 bg-green-50 border-green-200"
      case "medium":
        return "text-amber-600 bg-amber-50 border-amber-200"
      case "high":
        return "text-red-600 bg-red-50 border-red-200"
      default:
        return "text-slate-600 bg-slate-50"
    }
  }

  const getSeverityIcon = (sev: string) => {
    switch (sev) {
      case "low":
        return <CheckCircle2 className="h-5 w-5" />
      case "medium":
        return <AlertTriangle className="h-5 w-5" />
      case "high":
        return <AlertCircle className="h-5 w-5" />
      default:
        return null
    }
  }

  return (
    <PatientLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8 text-primary" />
            AI Symptom Checker
          </h2>
          <p className="text-muted-foreground mt-2">
            Describe your symptoms to get preliminary health insights. This is not a diagnosis - always consult a
            healthcare professional.
          </p>
        </div>

        {/* Step 1: Select Symptoms */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Select Your Symptoms</CardTitle>
              <CardDescription>Choose all symptoms you're experiencing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {commonSymptoms.map((symptom) => (
                  <Button
                    key={symptom}
                    variant={symptoms.includes(symptom) ? "default" : "outline"}
                    className="justify-start h-auto py-3 px-4"
                    onClick={() => toggleSymptom(symptom)}
                  >
                    <span className="text-left">{symptom}</span>
                  </Button>
                ))}
              </div>

              <div className="mt-6 p-4 border rounded-lg bg-muted/50">
                <Label className="text-base font-semibold">Other symptoms?</Label>
                <Input
                  placeholder="Type additional symptoms..."
                  className="mt-2"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && e.currentTarget.value) {
                      const newSymptom = e.currentTarget.value
                      setSymptoms((prev) => [...prev, newSymptom])
                      e.currentTarget.value = ""
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-2">Press Enter to add</p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button onClick={() => setStep(2)} disabled={symptoms.length === 0} className="flex-1">
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Duration and Severity */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Symptom Details</CardTitle>
              <CardDescription>Provide more information about your symptoms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-base font-semibold">How long have you had these symptoms?</Label>
                <div className="grid grid-cols-2 gap-3">
                  {["Less than 24 hours", "1-3 days", "3-7 days", "More than a week"].map((opt) => (
                    <Button
                      key={opt}
                      variant={duration === opt ? "default" : "outline"}
                      className="justify-start h-auto py-3 px-4"
                      onClick={() => setDuration(opt)}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">How severe are your symptoms?</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Mild", value: "mild" },
                    { label: "Moderate", value: "moderate" },
                    { label: "Severe", value: "severe" },
                  ].map((opt) => (
                    <Button
                      key={opt.value}
                      variant={severity === opt.value ? "default" : "outline"}
                      className="h-auto py-3"
                      onClick={() => setSeverity(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button onClick={handleAnalyze} disabled={!duration || !severity} className="flex-1">
                  Analyze
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div className="space-y-4">
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">Disclaimer</p>
                    <p className="text-sm text-amber-800 mt-1">
                      This is an AI-powered preliminary assessment only and not a medical diagnosis. Please consult a
                      healthcare professional for accurate diagnosis and treatment.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-4">Analysis Results</h2>
                {results.map((result, idx) => (
                  <Card key={idx} className={`border-2 mb-4 ${getSeverityColor(result.severity)}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {getSeverityIcon(result.severity)}
                          <div>
                            <CardTitle className="text-lg">{result.condition}</CardTitle>
                            <CardDescription className="mt-1">
                              Severity: <span className="font-semibold capitalize">{result.severity}</span>
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="font-medium mb-1">Recommendation:</p>
                        <p className="text-sm">{result.recommendation}</p>
                      </div>
                      <div>
                        <p className="font-medium mb-1">Details:</p>
                        <p className="text-sm">{result.details}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => window.print()} className="flex-1">
                  Print Results
                </Button>
                <Button
                  onClick={() => {
                    setStep(1)
                    setSymptoms([])
                    setDuration("")
                    setSeverity("")
                    setResults([])
                  }}
                  className="flex-1"
                >
                  Start Over
                </Button>
              </div>
            </div>
          </div>
        )}

        {isAnalyzing && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center gap-3">
                <div className="h-4 w-4 bg-primary rounded-full animate-bounce" />
                <p className="text-muted-foreground">Analyzing your symptoms...</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PatientLayout>
  )
}
