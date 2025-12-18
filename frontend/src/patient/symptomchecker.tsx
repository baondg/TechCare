"use client"

import { useState } from "react"
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,} from "@/components/ui/dialog"
import { PatientLayout } from "@/components/patient-layout"
import { AlertCircle, X, Clock } from "lucide-react"

interface SelectedSymptom {
  name: string
  severity: "mild" | "moderate" | "severe"
  duration: "less24h" | "1to3days" | "3to7days" | "moreThanWeek"
}

interface SymptomResult {
  condition: string
  severity: "low" | "medium" | "high"
  recommendation: string
  details: string
}

const commonSymptoms = [
  "Headache", "Fever", "Cough", "Sore Throat", "Fatigue", "Nausea",
  "Body Aches", "Runny Nose", "Shortness of Breath", "Chest Pain",
  "Dizziness", "Loss of Taste/Smell", "Diarrhea", "Rash", "Joint Pain", "Vomiting"
]

const durationOptions = [
  { value: "less24h", label: "Less than 24 hours", short: "< 1 day" },
  { value: "1to3days", label: "1-3 days", short: "1-3 days" },
  { value: "3to7days", label: "3-7 days", short: "3-7 days" },
  { value: "moreThanWeek", label: "More than a week", short: "> 1 week" },
]

export default function SymptomChecker() {
  const [selectedSymptoms, setSelectedSymptoms] = useState<SelectedSymptom[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currentSymptom, setCurrentSymptom] = useState("")
  const [tempSeverity, setTempSeverity] = useState<"mild" | "moderate" | "severe">("moderate")
  const [tempDuration, setTempDuration] = useState<SelectedSymptom["duration"]>("1to3days")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState<SymptomResult[]>([])

  const openDialog = (symptom: string) => {
    const existing = selectedSymptoms.find(s => s.name === symptom)
    if (existing) {
      setTempSeverity(existing.severity)
      setTempDuration(existing.duration)
    } else {
      setTempSeverity("moderate")
      setTempDuration("1to3days")
    }
    setCurrentSymptom(symptom)
    setDialogOpen(true)
  }

  const confirmSelection = () => {
    setSelectedSymptoms(prev => {
      const filtered = prev.filter(s => s.name !== currentSymptom)
      return [...filtered, { name: currentSymptom, severity: tempSeverity, duration: tempDuration }]
    })
    setDialogOpen(false)
  }

  const removeSymptom = (name: string) => {
    setSelectedSymptoms(prev => prev.filter(s => s.name !== name))
  }

  const handleAnalyze = () => {
    if (selectedSymptoms.length === 0) return
    setIsAnalyzing(true)

    setTimeout(() => {
      const hasSevere = selectedSymptoms.some(s => s.severity === "severe")
      const hasChestPainSevere = selectedSymptoms.some(s => s.name === "Chest Pain" && s.severity === "severe")
      const hasSOBSevere = selectedSymptoms.some(s => s.name === "Shortness of Breath" && s.severity === "severe")

      const mockResults: SymptomResult[] = []

      if (hasChestPainSevere || hasSOBSevere) {
        mockResults.push({
          condition: "Emergency Symptoms Detected",
          severity: "high",
          recommendation: "Go to emergency room immediately",
          details: "Severe chest pain or shortness of breath requires urgent evaluation. Do not delay."
        })
      } else if (hasSevere) {
        mockResults.push({
          condition: "Significant Symptoms",
          severity: "medium",
          recommendation: "See a doctor within 24-48 hours",
          details: "Your symptoms are concerning and should be evaluated soon."
        })
      } else {
        mockResults.push({
          condition: "Likely Mild Condition",
          severity: "low",
          recommendation: "Monitor at home",
          details: "Continue rest and hydration. Seek care if symptoms worsen."
        })
      }

      setResults(mockResults)
      setIsAnalyzing(false)
    }, 2000)
  }

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case "mild": return "bg-green-100 text-green-800 border-green-300"
      case "moderate": return "bg-amber-100 text-amber-800 border-amber-300"
      case "severe": return "bg-red-100 text-red-800 border-red-300"
      default: return "bg-gray-100"
    }
  }

  return (
    <PatientLayout>
      <div className="space-y-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between w-full">
          {/* Header Left */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Symptom checker</h2>
            <p className="text-muted-foreground mt-3 text-lg">
              Tap on any symptom you're experiencing
            </p>
          </div>

          {/* Buttons Right */}
          <div className="flex gap-4">
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={selectedSymptoms.length === 0 || isAnalyzing}
              className="min-w-56 text-lg py-5"
            >
              {isAnalyzing ? "Analyzing..." : `Analyze (${selectedSymptoms.length} symptoms)`}
            </Button>

            {selectedSymptoms.length > 0 && (
              <Button size="lg" variant="outline" onClick={() => setSelectedSymptoms([])}>
                Clear All
              </Button>
            )}
          </div>
        </div>

        


        <div className="grid grid-cols-2 max-w-full gap-6">
        {/* Symptom Grid */}
          <Card>
            <CardHeader>
              <CardTitle>Select Your Symptoms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {commonSymptoms.map((symptom) => {
                  const isSelected = selectedSymptoms.some(s => s.name === symptom)
                  return (
                    <Button
                      key={symptom}
                      variant={isSelected ? "default" : "outline"}
                      className={`h-12 text-lg font-medium transition-all ${isSelected ? "ring-4 ring-primary/30" : ""}`}
                      onClick={() => openDialog(symptom)}
                    >
                      {symptom}
                    </Button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {/* Selected Symptoms */}
            <Card className="border-2 border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Your Symptoms ({selectedSymptoms.length})
                  </CardTitle>
                </CardHeader>
              {selectedSymptoms.length > 0 && (
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {selectedSymptoms.map((s) => {
                      const durationLabel = durationOptions.find(d => d.value === s.duration)?.short
                      return (
                        <Badge
                          key={s.name}
                          variant="secondary"
                          className={`text-sm py-2 px-4 font-medium ${getSeverityColor(s.severity)}`}
                        >
                          <span className="font-semibold">{s.name}</span>
                          <span className="mx-1">•</span>
                          <span className="uppercase">{s.severity}</span>
                          <span className="mx-1">•</span>
                          <span className="text-xs">{durationLabel}</span>
                          <button onClick={() => removeSymptom(s.name)} className="ml-2 hover:opacity-70">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </Badge>
                      )
                    })}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Results */}
            {results.length > 0 && (
              <>
                <Alert className="border-red-300 bg-red-50">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                  <AlertDescription className="text-red-900 font-medium text-md">
                    This is not a medical diagnosis. Please consult a doctor for accurate assessment.
                  </AlertDescription>
                </Alert>

                {results.map((r, i) => (
                  <Card
                    key={i}
                    className={`border-2 ${
                      r.severity === "high"
                        ? "border-red-400 bg-red-50"
                        : "border-amber-300"
                    }`}
                  >
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center gap-3">
                        {r.severity === "high" && (
                          <AlertCircle className="h-8 w-8 text-red-600" />
                        )}
                        {r.condition}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-md">
                      <p>
                        <strong>Recommendation:</strong> {r.recommendation}
                      </p>
                      <p>{r.details}</p>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        </div>

        

        

        {/* Dialog chọn mức độ + thời gian */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl">Tell us more about</DialogTitle>
              <DialogDescription className="text-2xl font-bold text-primary">
                {currentSymptom}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-8 py-4">
              {/* Severity */}
              <div>
                <p className="font-semibold text-lg mb-4">How severe is it?</p>
                <div className="grid grid-cols-3 gap-3">
                  {["mild", "moderate", "severe"].map((level) => (
                    <Button
                      key={level}
                      variant={tempSeverity === level ? "default" : "outline"}
                      className={"h-20"}
                      onClick={() => setTempSeverity(level as any)}
                    >
                      <div>
                        <div className="font-bold text-lg capitalize">{level}</div>
                        <div className="text-xs opacity-90">
                          {level === "mild" ? "Noticeable" : level === "moderate" ? "Affects daily life" : "Very intense"}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <p className="font-semibold text-lg mb-4">How long have you had it?</p>
                <div className="grid grid-cols-2 gap-3">
                  {durationOptions.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={tempDuration === opt.value ? "default" : "outline"}
                      className="h-16 justify-start"
                      onClick={() => setTempDuration(opt.value as any)}
                    >
                      <Clock className="h-5 w-5 mr-3" />
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="grid grid-cols-2 gap-4 mt-6">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-12">
                Cancel
              </Button>
              <Button onClick={confirmSelection} className="h-12">
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PatientLayout>
  )
}