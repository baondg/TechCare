"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircle, RefreshCw, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CollapsibleSection } from "@/components/collapsible-section"
import { RecoveryTimelineVisual } from "@/components/recovery-timeline-visual"
import { doctorService } from "@/services/doctor-service"
import type { RecoveryPrediction } from "@/types/recovery-prediction"

/**
 * Same AI recovery estimate as the patient portal, loaded via staff API for the EMR patient in context.
 */
export function EmrPatientRecoveryPanel({ patientId }: { patientId?: string }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prediction, setPrediction] = useState<RecoveryPrediction | null>(null)
  const [eligible, setEligible] = useState<boolean | null>(null)
  const [ineligibleMessage, setIneligibleMessage] = useState<string | null>(null)

  const loadRecovery = useCallback(
    async (refresh: boolean) => {
      if (!patientId) return
      setLoading(true)
      setError(null)
      try {
        const data = await doctorService.getPatientRecoveryPrediction(patientId, { refresh })
        if (data.eligible === false) {
          setEligible(false)
          setIneligibleMessage(data.message || t("patient.dashboard.recoveryAiError"))
          setPrediction(null)
          return
        }
        setEligible(true)
        setIneligibleMessage(null)
        if (data.success && data.prediction) {
          setPrediction(data.prediction)
        } else {
          setPrediction(null)
          setError(data.message || t("patient.dashboard.recoveryAiError"))
        }
      } catch (e) {
        setPrediction(null)
        setError(e instanceof Error ? e.message : t("patient.dashboard.recoveryAiError"))
      } finally {
        setLoading(false)
      }
    },
    [patientId, t]
  )

  useEffect(() => {
    if (!patientId) return
    setPrediction(null)
    setError(null)
    setEligible(null)
    setIneligibleMessage(null)
    void loadRecovery(false)
  }, [patientId, loadRecovery])

  const recoveryVisual = useMemo(() => {
    if (!prediction) return null
    const { daysMin, daysMax } = prediction
    const mid = (daysMin + daysMax) / 2
    const refCap = Math.max(42, daysMax, daysMin, 1)
    const pct = Math.min(100, Math.max(0, (mid / refCap) * 100))
    const numeratorDays = Math.max(1, Math.round(mid))
    const denominatorDays = Math.round(refCap)
    return { pct, numeratorDays, denominatorDays }
  }, [prediction])

  if (!patientId) return null

  return (
    <CollapsibleSection
      title={t("patient.dashboard.recoveryProgress")}
      icon={<TrendingUp className="h-5 w-5" />}
      defaultOpen={true}
    >
      <Card className="card-feature-group overflow-hidden rounded-xl border border-slate-200/80 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={loading || eligible === false}
              onClick={() => void loadRecovery(true)}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {t("patient.dashboard.recoveryRefresh")}
            </Button>
          </div>

          {eligible === false && ineligibleMessage && (
            <p className="text-sm text-slate-600">{ineligibleMessage}</p>
          )}

          {loading && !prediction && eligible !== false && (
            <p className="text-sm text-slate-600">{t("patient.dashboard.recoveryAiLoading")}</p>
          )}

          {error && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {prediction && recoveryVisual && (
            <RecoveryTimelineVisual
              pct={recoveryVisual.pct}
              numeratorDays={recoveryVisual.numeratorDays}
              denominatorDays={recoveryVisual.denominatorDays}
            />
          )}
        </CardContent>
      </Card>
    </CollapsibleSection>
  )
}
