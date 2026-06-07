"use client"

import { useState } from "react"
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,} from "@/components/ui/dialog"
import { PatientLayout } from "@/components/patient-layout"
import { AlertCircle, X, Clock, Stethoscope, AlertTriangle, CheckCircle } from "lucide-react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { appointmentService } from "@/services/appointment-service"
import type { SymptomInput, SymptomAnalysisResult } from "@/types/ai-types"
import { getReadableApiError } from "@/lib/utils"
import { persistSymptomCheckerToHealthInfo } from "@/lib/symptom-checker-persist-health"
import {
  COMMON_SYMPTOM_KEYS,
  isCommonSymptomKey,
  MIN_CUSTOM_SYMPTOM_LENGTH,
  normalizeSymptomsForAi,
  resolveSymptomText,
  type CommonSymptomKey,
  type SelectedSymptomInput,
} from "@/lib/symptom-normalize"

type SelectedSymptom = SelectedSymptomInput

const durationOptions = [
  { value: "less24h" as const, short: "< 1 day" },
  { value: "1to3days" as const, short: "1-3 days" },
  { value: "3to7days" as const, short: "3-7 days" },
  { value: "moreThanWeek" as const, short: "> 1 week" },
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
  const { t } = useTranslation()
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
  const [healthInfoSyncMessage, setHealthInfoSyncMessage] = useState<"ok" | "err" | null>(null)
  const [healthInfoSyncDetail, setHealthInfoSyncDetail] = useState<string>("")
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [pendingSuggestion, setPendingSuggestion] = useState<{
    entered: string
    key: CommonSymptomKey
  } | null>(null)
  const [otherSymptomError, setOtherSymptomError] = useState("")

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
   * 4. Call appointmentService.analyzeSymptomsPersisted(...)
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
    setHealthInfoSyncMessage(null)
    setHealthInfoSyncDetail("")

    try {
      // Convert selected symptoms to AI service format
      const symptomsForAnalysis = normalizeSymptomsForAi(selectedSymptoms)
      if (symptomsForAnalysis.length === 0) {
        setAnalysisError(t("patient.symptomChecker.validation.tooShort"))
        return
      }

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

      const sync = await persistSymptomCheckerToHealthInfo(
        selectedSymptoms.map((s) => ({
          ...s,
          name: symptomDisplayName(s.name),
        }))
      )
      if (sync.ok) {
        setHealthInfoSyncMessage("ok")
        setHealthInfoSyncDetail("")
      } else {
        setHealthInfoSyncMessage("err")
        setHealthInfoSyncDetail(sync.error || t("patient.symptomChecker.healthInfoSaveFailed"))
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

  const durationLabel = (value: SelectedSymptom["duration"]) =>
    t(`patient.symptomChecker.duration.${value}`)

  const severityLabel = (value: SelectedSymptom["severity"]) =>
    t(`patient.symptomChecker.selectedCard.severityLevels.${value}`)

  const symptomDisplayName = (id: string) =>
    isCommonSymptomKey(id) ? t(`patient.symptomChecker.commonSymptoms.${id}`) : id

  const handleAddOtherSymptom = () => {
    const resolved = resolveSymptomText(otherSymptomText)
    setOtherSymptomError("")

    if (!resolved.cleaned) return

    if (resolved.kind === "preset") {
      openDialog(resolved.key)
      setOtherSymptomText("")
      return
    }

    if (resolved.kind === "suggest") {
      setPendingSuggestion({ entered: resolved.cleaned, key: resolved.key })
      setSuggestOpen(true)
      return
    }

    if (resolved.cleaned.length < MIN_CUSTOM_SYMPTOM_LENGTH) {
      setOtherSymptomError(t("patient.symptomChecker.validation.tooShort"))
      return
    }

    openDialog(resolved.cleaned)
    setOtherSymptomText("")
  }

  const acceptSuggestion = () => {
    if (!pendingSuggestion) return
    openDialog(pendingSuggestion.key)
    setOtherSymptomText("")
    setOtherSymptomError("")
    setPendingSuggestion(null)
    setSuggestOpen(false)
  }

  const keepOriginalSuggestion = () => {
    if (!pendingSuggestion) return
    if (pendingSuggestion.entered.length < MIN_CUSTOM_SYMPTOM_LENGTH) {
      setOtherSymptomError(t("patient.symptomChecker.validation.tooShort"))
      setPendingSuggestion(null)
      setSuggestOpen(false)
      return
    }
    openDialog(pendingSuggestion.entered)
    setOtherSymptomText("")
    setOtherSymptomError("")
    setPendingSuggestion(null)
    setSuggestOpen(false)
  }

  return (
    <PatientLayout>
      <div className="w-full max-w-none space-y-6 min-h-[calc(100vh-110px)]">
        <Alert className="border-cyan-200 bg-cyan-50/80">
          <Stethoscope className="h-5 w-5 text-cyan-700" />
          <AlertDescription className="text-slate-800">
            {t("patient.symptomChecker.profileHint")}
          </AlertDescription>
        </Alert>

        {healthInfoSyncMessage === "ok" && (
          <Alert className="border-green-200 bg-green-50/90">
            <CheckCircle className="h-5 w-5 text-green-700" />
            <AlertDescription className="text-slate-800">
              {t("patient.symptomChecker.healthInfoSaved")}{" "}
              <Link to="/patient/health-info" className="font-semibold text-cyan-700 underline">
                Health Info
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}
        {healthInfoSyncMessage === "err" && healthInfoSyncDetail && (
          <Alert className="border-amber-200 bg-amber-50/90">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <AlertDescription className="text-amber-950">{healthInfoSyncDetail}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 w-full">
          <div className="flex gap-3">
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={selectedSymptoms.length === 0 || isAnalyzing}
              className="min-w-56 text-lg py-5 bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white border-none hover:opacity-90 shadow-md transition-all hover:scale-105"
            >
              {isAnalyzing
                ? t("patient.symptomChecker.analyzing")
                : t("patient.symptomChecker.analyze", { count: selectedSymptoms.length })}
            </Button>

            {selectedSymptoms.length > 0 && (
              <Button size="lg" variant="outline" onClick={() => setSelectedSymptoms([])}>
                {t("patient.symptomChecker.clearAll")}
              </Button>
            )}
          </div>
        </div>

        


        <div className="grid grid-cols-1 xl:grid-cols-12 w-full gap-6 items-start">
        {/* Symptom Grid */}
          <Card className="xl:col-span-6">
            <CardHeader>
              <CardTitle>{t("patient.symptomChecker.selectSymptomsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {COMMON_SYMPTOM_KEYS.map((symptomKey) => {
                  const isSelected = selectedSymptoms.some((s) => s.name === symptomKey)
                  return (
                    <Button
                      key={symptomKey}
                      variant={isSelected ? "default" : "outline"}
                      className={`min-h-[3.25rem] h-auto px-3 py-2 text-sm md:text-base font-medium leading-tight whitespace-normal break-words text-center transition-all ${
                        isSelected 
                          ? "bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white border-none ring-4 ring-[#06b6d4]/30 shadow-md" 
                          : "hover:border-[#06b6d4] hover:text-[#06b6d4] hover:bg-[#06b6d4]/5"
                      }`}
                      onClick={() => openDialog(symptomKey)}
                    >
                      {t(`patient.symptomChecker.commonSymptoms.${symptomKey}`)}
                    </Button>
                  )
                })}
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-slate-700">{t("patient.symptomChecker.otherSymptom")}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={otherSymptomText}
                    onChange={(e) => {
                      setOtherSymptomText(e.target.value)
                      if (otherSymptomError) setOtherSymptomError("")
                    }}
                    onInput={(e) => setOtherSymptomText((e.target as HTMLInputElement).value)}
                    onBlur={(e) => setOtherSymptomText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddOtherSymptom()
                      }
                    }}
                    placeholder={t("patient.symptomChecker.otherSymptomPlaceholder")}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0"
                    onClick={handleAddOtherSymptom}
                    disabled={!otherSymptomText.trim()}
                  >
                    {t("patient.symptomChecker.addOther")}
                  </Button>
                </div>
                {otherSymptomError ? (
                  <p className="text-sm text-red-600">{otherSymptomError}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 xl:col-span-6">
            {/* Selected Symptoms */}
            <Card className="border-2 border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t("patient.symptomChecker.selectedCard.title")} ({selectedSymptoms.length})
                  </CardTitle>
                </CardHeader>
              {selectedSymptoms.length > 0 && (
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {selectedSymptoms.map((s) => {
                      const durationShort = durationOptions.find(d => d.value === s.duration)?.short
                      return (
                        <Badge
                          key={s.name}
                          variant="secondary"
                          className={`text-sm py-2 px-4 font-medium ${getSeverityColor(s.severity)}`}
                        >
                          <span className="font-semibold">{symptomDisplayName(s.name)}</span>
                          <span className="mx-1">•</span>
                          <span className="uppercase">{severityLabel(s.severity)}</span>
                          <span className="mx-1">•</span>
                          <span className="text-xs">{durationShort}</span>
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

        

        

        <Dialog
          open={suggestOpen}
          onOpenChange={(open) => {
            setSuggestOpen(open)
            if (!open) setPendingSuggestion(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("patient.symptomChecker.suggest.title")}</DialogTitle>
              <DialogDescription className="text-base text-slate-700 pt-2">
                {pendingSuggestion ? (
                  <>
                    {t("patient.symptomChecker.suggest.messagePrefix")}{" "}
                    <strong className="font-semibold text-slate-900">
                      {t(`patient.symptomChecker.commonSymptoms.${pendingSuggestion.key}`)}
                    </strong>{" "}
                    {t("patient.symptomChecker.suggest.messageMid")}{" "}
                    <strong className="font-semibold text-slate-900">
                      {pendingSuggestion.entered}
                    </strong>
                    ?
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="grid grid-cols-2 gap-3 sm:gap-4">
              <Button variant="outline" onClick={keepOriginalSuggestion}>
                {t("patient.symptomChecker.suggest.keepOriginal")}
              </Button>
              <Button
                onClick={acceptSuggestion}
                className="bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white border-none hover:opacity-90"
              >
                {t("patient.symptomChecker.suggest.useSuggested")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog settings */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl">{t("patient.symptomChecker.dialog.title")}</DialogTitle>
              <DialogDescription className="text-2xl font-bold text-primary">
                {symptomDisplayName(currentSymptom)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-8 py-4">
              {/* Severity */}
              <div>
                <p className="font-semibold text-lg mb-4">{t("patient.symptomChecker.dialog.severityQuestion")}</p>
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
                        <div className="font-bold text-lg">{severityLabel(level)}</div>
                        <div className="text-xs opacity-90">
                          {t(`patient.symptomChecker.dialog.severityHint.${level}`)}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <p className="font-semibold text-lg mb-4">{t("patient.symptomChecker.dialog.durationQuestion")}</p>
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
                      {durationLabel(opt.value)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="grid grid-cols-2 gap-4 mt-6">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-12 hover:bg-gray-100 hover:text-gray-900">
                {t("patient.symptomChecker.dialog.cancel")}
              </Button>
              <Button onClick={confirmSelection} className="h-12 bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white border-none hover:opacity-90 shadow-md">
                {t("patient.symptomChecker.dialog.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PatientLayout>
  )
}
