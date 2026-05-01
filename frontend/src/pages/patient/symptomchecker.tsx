"use client"

import { useState } from "react"
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,} from "@/components/ui/dialog"
import { PatientLayout } from "@/components/patient-layout"
import { AlertCircle, X, Clock, Stethoscope, AlertTriangle, CheckCircle } from "lucide-react"
import { appointmentService } from "@/services/appointment-service"
import type { SymptomInput, SymptomAnalysisResult } from "@/types/ai-types"
import { getReadableApiError } from "@/lib/utils"

interface SelectedSymptom {
  name: string
  severity: 'mild' | 'moderate' | 'severe'
  duration: 'less24h' | '1to3days' | '3to7days' | 'moreThanWeek'
}


const commonSymptoms = [
  "Fever",
  "Cough",
  "Sore Throat",
  "Shortness of Breath",
  "Chest Pain",
  "Headache",
  "Fatigue",
  "Nausea",
]

const durationOptions = [
  { value: "less24h", label: "Less than 24 hours", short: "< 1 day" },
  { value: "1to3days", label: "1-3 days", short: "1-3 days" },
  { value: "3to7days", label: "3-7 days", short: "3-7 days" },
  { value: "moreThanWeek", label: "More than a week", short: "> 1 week" },
]

// ==================== MAIN COMPONENT ====================

/**
 * SymptomChecker Component
 * 
 * Main symptom analysis interface. Allows patients to select symptoms,
 * specify their severity and duration, and receive AI-powered analysis.
 * 
 * STATE OVERVIEW:
 * - selectedSymptoms: Array of symptoms with severity/duration
 * - dialogOpen: Controls the severity/duration selection modal
 * - currentSymptom: Which symptom is being configured in the dialog
 * - tempSeverity/tempDuration: Temporary values during dialog editing
 * - isAnalyzing: Loading state while AI processes symptoms
 * - results: Array of possible conditions from AI analysis
 * - disclaimer: Medical disclaimer text from AI
 * - analysisError: Error message if analysis fails
 * 
 * @returns JSX.Element - Complete symptom checker page
 */
export default function SymptomChecker() {
  // ==================== STATE MANAGEMENT ====================
  
  // Array of symptoms selected by the patient with their details
  const [selectedSymptoms, setSelectedSymptoms] = useState<SelectedSymptom[]>([])
  
  // Dialog state for configuring symptom severity and duration
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currentSymptom, setCurrentSymptom] = useState("")
  
  // Temporary values while editing in dialog (before confirmation)
  const [tempSeverity, setTempSeverity] = useState<"mild" | "moderate" | "severe">("moderate")
  const [tempDuration, setTempDuration] = useState<SelectedSymptom["duration"]>("1to3days")
  const [otherSymptomText, setOtherSymptomText] = useState("")
  
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState<SymptomAnalysisResult[]>([])
  const [disclaimer, setDisclaimer] = useState<string>("")
  const [analysisError, setAnalysisError] = useState<string>("")

  // ==================== EVENT HANDLERS ====================

  /**
   * openDialog - Opens the symptom configuration dialog
   * If symptom was previously selected, loads its existing values.
   * Otherwise, uses default values (moderate severity, 1-3 days).
   * 
   * @param symptom - The symptom name to configure
   */
  const openDialog = (symptom: string) => {
    const existing = selectedSymptoms.find(s => s.name === symptom)
    if (existing) {
      // Load existing values for editing
      setTempSeverity(existing.severity)
      setTempDuration(existing.duration)
    } else {
      // Set default values for new symptom
      setTempSeverity("moderate")
      setTempDuration("1to3days")
    }
    setCurrentSymptom(symptom)
    setDialogOpen(true)
  }

  /**
   * confirmSelection - Saves the symptom with configured severity/duration
   * Removes any existing entry for this symptom and adds the updated one.
   */
  const confirmSelection = () => {
    setSelectedSymptoms(prev => {
      const filtered = prev.filter(s => s.name !== currentSymptom)
      return [...filtered, { name: currentSymptom, severity: tempSeverity, duration: tempDuration }]
    })
    setDialogOpen(false)
  }

  /**
   * removeSymptom - Removes a symptom from the selected list
   * @param name - The symptom name to remove
   */
  const removeSymptom = (name: string) => {
    setSelectedSymptoms(prev => prev.filter(s => s.name !== name))
  }

  /**
   * handleAnalyze - Triggers AI analysis of selected symptoms
   * 
   * FLOW:
   * 1. Validate at least one symptom is selected
   * 2. Set loading state and clear previous results
   * 3. Convert symptoms to AI service format
   * 4. Call analyzeSymptoms() from ai-service.ts
   * 5. Update results and disclaimer from AI response
   * 6. Handle errors with user-friendly message
   * 
   * @async
   */
  const handleAnalyze = async () => {
    if (selectedSymptoms.length === 0) return
    setIsAnalyzing(true)
    setAnalysisError("")
    setResults([])
    setDisclaimer("")

    try {
      // Convert selected symptoms to AI service format
      const symptomsForAnalysis: SymptomInput[] = selectedSymptoms.map(s => ({
        name: s.name,
        severity: s.severity,
        duration: s.duration
      }))

      // Call backend AI endpoint (persist into AI_RECOMMENDATION)
      const response = await appointmentService.analyzeSymptomsPersisted(symptomsForAnalysis)

      setResults(response.results ?? [])
      setDisclaimer(response.disclaimer ?? "")

      if (response.error) {
        setAnalysisError(response.error)
      } else if ((response.results?.length ?? 0) === 0) {
        setAnalysisError(
          "AI did not return symptom suggestions. Check GROQ_API_KEY / Ollama backend configuration, then try again."
        )
      }
    } catch (error) {
      console.error('Error analyzing symptoms:', error)
      setAnalysisError(getReadableApiError(error))
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case "mild": return "bg-green-100 text-green-800 border-green-300"
      case "moderate": return "bg-amber-100 text-amber-800 border-amber-300"
      case "severe": return "bg-red-100 text-red-800 border-red-300"
      default: return "bg-gray-100"
    }
  }

  const handleAddOtherSymptom = () => {
    const normalized = otherSymptomText.trim()
    if (!normalized) return
    openDialog(normalized)
    setOtherSymptomText("")
  }

  return (
    <PatientLayout>
      <div className="w-full max-w-none space-y-6 min-h-[calc(100vh-110px)]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          {/* Header Left */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Symptom checker</h2>
            <p className="text-muted-foreground mt-3 text-lg">
              Tap on any symptom you're experiencing
            </p>
          </div>

          {/* Buttons Right */}
          <div className="flex gap-3">
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={selectedSymptoms.length === 0 || isAnalyzing}
              className="min-w-56 text-lg py-5 bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white border-none hover:opacity-90 shadow-md transition-all hover:scale-105"
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

        


        <div className="grid grid-cols-1 xl:grid-cols-12 w-full gap-6 items-start">
        {/* Symptom Grid */}
          <Card className="xl:col-span-6">
            <CardHeader>
              <CardTitle>Select Your Symptoms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {commonSymptoms.map((symptom) => {
                  const isSelected = selectedSymptoms.some(s => s.name === symptom)
                  return (
                    <Button
                      key={symptom}
                      variant={isSelected ? "default" : "outline"}
                      className={`min-h-[3.25rem] h-auto px-3 py-2 text-sm md:text-base font-medium leading-tight whitespace-normal break-words text-center transition-all ${
                        isSelected 
                          ? "bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white border-none ring-4 ring-[#06b6d4]/30 shadow-md" 
                          : "hover:border-[#06b6d4] hover:text-[#06b6d4] hover:bg-[#06b6d4]/5"
                      }`}
                      onClick={() => openDialog(symptom)}
                    >
                      {symptom}
                    </Button>
                  )
                })}
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-slate-700">Other symptom</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={otherSymptomText}
                    onChange={(e) => setOtherSymptomText(e.target.value)}
                    onInput={(e) => setOtherSymptomText((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setOtherSymptomText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddOtherSymptom()
                      }
                    }}
                    placeholder="Type your symptom (e.g., loss of appetite)"
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0"
                    onClick={handleAddOtherSymptom}
                    disabled={!otherSymptomText.trim()}
                  >
                    Add Other
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 xl:col-span-6">
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
            {analysisError && (
              <Alert className="border-red-300 bg-red-50 mb-6">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <AlertDescription className="text-red-800">
                  {analysisError}
                </AlertDescription>
              </Alert>
            )}

            {results.length > 0 && (
              <>
                <Alert className="border-amber-300 bg-amber-50">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                  <AlertDescription className="text-amber-900 font-medium text-md">
                    {disclaimer || "This is not a medical diagnosis. Please consult a doctor for accurate assessment."}
                  </AlertDescription>
                </Alert>

                {analysisError && (
                  <Alert className="border-red-300 bg-red-50">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <AlertDescription className="text-red-800">
                      {analysisError}
                    </AlertDescription>
                  </Alert>
                )}

                {results.map((r, i) => (
                  <Card
                    key={i}
                    className={`border-2 ${
                      r.severity === "high"
                        ? "border-red-400 bg-red-50"
                        : r.severity === "medium"
                        ? "border-amber-300 bg-amber-50"
                        : "border-green-300 bg-green-50"
                    }`}
                  >
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center gap-3">
                        {r.severity === "high" && (
                          <AlertCircle className="h-8 w-8 text-red-600" />
                        )}
                        {r.severity === "medium" && (
                          <AlertTriangle className="h-8 w-8 text-amber-600" />
                        )}
                        {r.severity === "low" && (
                          <CheckCircle className="h-8 w-8 text-green-600" />
                        )}
                        {r.condition}
                      </CardTitle>
                      <CardDescription>
                        <Badge 
                          variant="outline" 
                          className={
                            r.severity === "high" 
                              ? "bg-red-100 text-red-800 border-red-300" 
                              : r.severity === "medium"
                              ? "bg-amber-100 text-amber-800 border-amber-300"
                              : "bg-green-100 text-green-800 border-green-300"
                          }
                        >
                          {r.severity === "high" ? "Urgent" : r.severity === "medium" ? "Moderate Priority" : "Low Priority"}
                        </Badge>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-md">
                      <div>
                        <p className="font-semibold text-gray-700 mb-1">Recommendation:</p>
                        <p className="text-gray-800">{r.recommendation}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-700 mb-1">Details:</p>
                        <p className="text-gray-600">{r.details}</p>
                      </div>
                      {r.possibleCauses && r.possibleCauses.length > 0 && (
                        <div>
                          <p className="font-semibold text-gray-700 mb-2">Possible Causes:</p>
                          <div className="flex flex-wrap gap-2">
                            {r.possibleCauses.map((cause, idx) => (
                              <Badge key={idx} variant="secondary" className="bg-gray-100">
                                {cause}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {r.whenToSeekHelp && (
                        <div className="mt-4 p-3 bg-white/50 rounded-lg border border-gray-200">
                          <p className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
                            <Stethoscope className="h-4 w-4" />
                            When to Seek Help:
                          </p>
                          <p className="text-gray-600 text-sm">{r.whenToSeekHelp}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        </div>

        

        

        {/* Dialog settings */}
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
                  {(["mild", "moderate", "severe"] as const).map((level) => (
                    <Button
                      key={level}
                      variant={tempSeverity === level ? "default" : "outline"}
                      className={`h-20 transition-all ${
                        tempSeverity === level 
                          ? "bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white border-none shadow-md" 
                          : "hover:border-[#06b6d4] hover:text-[#06b6d4] hover:bg-[#06b6d4]/5"
                      }`}
                      onClick={() => setTempSeverity(level)}
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
                      className={`h-16 justify-start transition-all ${
                        tempDuration === opt.value 
                          ? "bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white border-none shadow-md" 
                          : "hover:border-[#06b6d4] hover:text-[#06b6d4] hover:bg-[#06b6d4]/5"
                      }`}
                      onClick={() => setTempDuration(opt.value as SelectedSymptom["duration"])}
                    >
                      <Clock className="h-5 w-5 mr-3" />
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="grid grid-cols-2 gap-4 mt-6">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-12 hover:bg-gray-100 hover:text-gray-900">
                Cancel
              </Button>
              <Button onClick={confirmSelection} className="h-12 bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white border-none hover:opacity-90 shadow-md">
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PatientLayout>
  )
}
