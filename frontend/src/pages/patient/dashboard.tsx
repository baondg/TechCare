"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Calendar,
  Pill,
  Activity,
  Clock,
  TrendingUp,
  ChevronRight,
  User,
  TestTube,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import { Link } from "react-router-dom"
import { PatientLayout } from "@/components/patient-layout"
import { CollapsibleSection } from "@/components/collapsible-section"
import {
  appointmentService,
  type PatientDashboardSummary,
  type RecoveryPrediction,
} from "@/services/appointment-service"
import { useTranslation } from "react-i18next"
import { getReadableApiError, cn } from "@/lib/utils"

function RecoveryTimelineVisual({ pct, caption }: { pct: number; caption: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const gradId = `recoveryGrad-${uid}`
  const r = 38
  const c = 2 * Math.PI * r
  const safePct = Math.min(100, Math.max(0, Math.round(pct)))
  const dash = (safePct / 100) * c

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative h-[108px] w-[108px] shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" className="stroke-slate-200" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
          />
          <defs>
            <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#0891b2" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xl font-bold tabular-nums text-slate-900">{safePct}%</span>
        </div>
      </div>
      <div className="flex-1 w-full min-w-0 space-y-2">
        <p className="text-xs text-slate-600 leading-snug">{caption}</p>
        <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-linear-to-r from-cyan-500 to-cyan-600 transition-all duration-700 ease-out"
            style={{ width: `${safePct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export default function PatientDashboard() {
  const { t, i18n } = useTranslation()
  const [dashboard, setDashboard] = useState<PatientDashboardSummary | null>(null)
  const recoverySectionRef = useRef<HTMLDivElement>(null)
  const recoveryAutoLoadRef = useRef(false)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [recoveryPrediction, setRecoveryPrediction] = useState<RecoveryPrediction | null>(null)
  const [recoveryCached, setRecoveryCached] = useState(false)
  const [recoveryViewed, setRecoveryViewed] = useState(false)

  const loadRecovery = useCallback(
    async (refresh: boolean) => {
      setRecoveryLoading(true)
      setRecoveryError(null)
      try {
        const data = await appointmentService.getRecoveryPrediction({ refresh })
        if (data.eligible === false) {
          setRecoveryPrediction(null)
          setRecoveryCached(false)
          setRecoveryError(null)
          return
        }
        if (data.success && data.prediction) {
          setRecoveryPrediction(data.prediction)
          setRecoveryCached(Boolean(data.cached))
        } else {
          setRecoveryError(data.message || t("patient.dashboard.recoveryAiError"))
          setRecoveryPrediction(null)
        }
      } catch (err) {
        setRecoveryError(getReadableApiError(err))
        setRecoveryPrediction(null)
      } finally {
        setRecoveryLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    const load = async () => {
      try {
        const data = await appointmentService.getPatientDashboardSummary()
        setDashboard(data)
      } catch (error) {
        console.error("Load patient dashboard failed:", error)
      }
    }
    load()
  }, [])

  const nextAppointment = dashboard?.summary?.nextAppointment || null
  const diagnosis = dashboard?.summary?.currentDiagnosis || null
  const activePrescriptionCount = dashboard?.summary?.activePrescriptions ?? 0
  const labResultsCount = dashboard?.summary?.labResults ?? 0
  const prescriptionGroups = dashboard?.activePrescriptionsList ?? []
  const upcomingAppointments = dashboard?.upcomingAppointments || []

  const recoveryEligible = useMemo(() => {
    if (!dashboard?.summary) return false
    const dx = dashboard.summary.currentDiagnosis
    if (!dx) return false
    const icd = String(dx.icd10 || "").trim().toUpperCase()
    const interp = String(dx.interpretation || "").trim()
    if (!icd && !interp) return false
    if (icd === "Z00.0") return false
    if (!icd && interp.toLowerCase() === "general examination") return false
    const hasRx =
      prescriptionGroups.length > 0 || (dashboard.summary.activePrescriptions ?? 0) > 0
    return hasRx
  }, [dashboard, prescriptionGroups])

  useEffect(() => {
    if (!recoveryEligible) {
      recoveryAutoLoadRef.current = false
      setRecoveryViewed(false)
      setRecoveryPrediction(null)
      setRecoveryCached(false)
      setRecoveryError(null)
    }
  }, [recoveryEligible])

  useEffect(() => {
    if (!recoveryEligible) return
    const el = recoverySectionRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || recoveryAutoLoadRef.current) continue
          recoveryAutoLoadRef.current = true
          setRecoveryViewed(true)
          void loadRecovery(false)
        }
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadRecovery, recoveryEligible])

  const nextApptLabel = useMemo(() => {
    if (!nextAppointment) return "—"
    return `${nextAppointment.date} ${String(nextAppointment.time).slice(0, 5)}`
  }, [nextAppointment])

  const recoveryConfidenceLabel = useMemo(() => {
    if (!recoveryPrediction) return ""
    switch (recoveryPrediction.confidence) {
      case "high":
        return t("patient.dashboard.recoveryConfidenceHigh")
      case "medium":
        return t("patient.dashboard.recoveryConfidenceMedium")
      default:
        return t("patient.dashboard.recoveryConfidenceLow")
    }
  }, [recoveryPrediction, t])

  const recoveryRangeLabel = useMemo(() => {
    if (!recoveryPrediction) return ""
    if (recoveryPrediction.daysMin === recoveryPrediction.daysMax) {
      return t("patient.dashboard.recoveryEstimateSingle", { days: recoveryPrediction.daysMin })
    }
    return t("patient.dashboard.recoveryEstimateRange", {
      min: recoveryPrediction.daysMin,
      max: recoveryPrediction.daysMax,
    })
  }, [recoveryPrediction, t])

  const recoveryVisual = useMemo(() => {
    if (!recoveryPrediction) return null
    const { daysMin, daysMax } = recoveryPrediction
    const mid = (daysMin + daysMax) / 2
    const refCap = Math.max(42, daysMax, daysMin, 1)
    const pct = Math.min(100, Math.max(0, (mid / refCap) * 100))
    return { pct, refCap: Math.round(refCap) }
  }, [recoveryPrediction])

  return (
    <PatientLayout>
      <div className="relative space-y-8 pb-12">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Link to="/patient/appointments">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="card-icon-wrapper h-12 w-12">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-slate-500 mb-1">{t("patient.dashboard.nextAppointment")}</h3>
                <div className="text-lg font-bold text-slate-900 mb-1">{nextApptLabel}</div>
                <p className="text-sm text-slate-600">
                  {nextAppointment ? t("patient.dashboard.doctorPrefix", { name: nextAppointment.doctor }) : t("patient.dashboard.noUpcomingAppointment")}
                </p>
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
                <h3 className="text-sm font-medium text-slate-500 mb-1">{t("patient.dashboard.currentDiagnosis")}</h3>
                <div className="text-xl font-bold text-slate-900 mb-1">{diagnosis?.interpretation || t("common.notAvailable")}</div>
                <p className="text-sm text-slate-600">{diagnosis?.icd10 || t("patient.dashboard.noDiagnosisYet")}</p>
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
                <h3 className="text-sm font-medium text-slate-500 mb-1">{t("patient.dashboard.prescriptions")}</h3>
                <div className="text-xl font-bold text-slate-900 mb-1">{activePrescriptionCount}</div>
                <p className="text-sm text-slate-600">{t("patient.dashboard.availablePrescriptions")}</p>
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
                <h3 className="text-sm font-medium text-slate-500 mb-1">{t("patient.dashboard.labResults")}</h3>
                <div className="text-xl font-bold text-slate-900 mb-1">{labResultsCount || t("common.notAvailable")}</div>
                <p className="text-sm text-slate-600">{t("patient.dashboard.availableResults")}</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className={cn("grid gap-6", recoveryEligible && "lg:grid-cols-2")}>
          <CollapsibleSection
            title={t("patient.dashboard.activeMedications")}
            icon={<Pill className="h-5 w-5" />}
            defaultOpen={true}
          >
            <div className="space-y-6">
              {prescriptionGroups.length === 0 && (
                <Card className="card-feature-group">
                  <CardContent className="p-4 text-sm text-slate-500">{t("patient.dashboard.noActiveMedications")}</CardContent>
                </Card>
              )}
              {prescriptionGroups.map((rx) => {
                const dateLabel = (() => {
                  try {
                    const d = new Date(rx.prescribedAt)
                    return Number.isNaN(d.getTime()) ? String(rx.prescribedAt) : d.toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN")
                  } catch {
                    return String(rx.prescribedAt)
                  }
                })()
                return (
                  <Card className="card-feature-group border border-slate-200/80" key={rx.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                        <Pill className="h-4 w-4 text-cyan-600 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t("patient.dashboard.prescription")}
                          </p>
                          <p className="text-sm font-medium text-slate-800">{dateLabel}</p>
                          {rx.doctorName?.trim() ? (
                            <p className="text-xs text-slate-500 mt-0.5">{t("patient.dashboard.prescribedBy", { name: rx.doctorName.trim() })}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {rx.medications.map((med) => (
                          <div
                            key={med.id}
                            className="flex items-center justify-between rounded-lg bg-slate-50/80 px-3 py-2.5"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-purple-50 to-purple-100">
                                <Pill className="h-5 w-5 text-purple-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate">{med.name}</p>
                                <p className="text-sm text-slate-600 line-clamp-2">
                                  {med.frequency || t("common.notAvailable")}
                                  {med.duration ? ` · ${t("patient.dashboard.days", { count: med.duration })}` : ""}
                                </p>
                              </div>
                            </div>
                            <span className="inline-flex shrink-0 items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white text-slate-700 border border-slate-200 ml-2">
                              {t("patient.dashboard.quantity", { count: med.quantity || t("common.notAvailable") })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <Button variant="outline" size="sm" className="w-full mt-4 btn-gradient transition-transform duration-500" asChild>
              <Link to="/patient/records?tab=prescriptions">{t("patient.dashboard.viewAllMedications")}</Link>
            </Button>
          </CollapsibleSection>

          {recoveryEligible ? (
            <div ref={recoverySectionRef}>
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
                        disabled={recoveryLoading}
                        onClick={() => {
                          setRecoveryViewed(true)
                          void loadRecovery(true)
                        }}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${recoveryLoading ? "animate-spin" : ""}`} />
                        {t("patient.dashboard.recoveryRefresh")}
                      </Button>
                    </div>

                    {!recoveryViewed && (
                      <p className="text-sm text-slate-500">{t("patient.dashboard.recoveryScrollHint")}</p>
                    )}

                    {recoveryViewed && recoveryLoading && !recoveryPrediction && (
                      <p className="text-sm text-slate-600">{t("patient.dashboard.recoveryAiLoading")}</p>
                    )}

                    {recoveryError && (
                      <Alert variant="destructive" className="border-red-200 bg-red-50">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{recoveryError}</AlertDescription>
                      </Alert>
                    )}

                    {recoveryPrediction && recoveryVisual && (
                      <div className="space-y-4">
                        <RecoveryTimelineVisual
                          pct={recoveryVisual.pct}
                          caption={t("patient.dashboard.recoveryVisualHint", { days: recoveryVisual.refCap })}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-slate-900">
                            {t("patient.dashboard.recoveryEstimateTitle")}:{" "}
                            <span className="text-cyan-700">{recoveryRangeLabel}</span>
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              recoveryPrediction.confidence === "high"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : recoveryPrediction.confidence === "medium"
                                  ? "border-amber-300 bg-amber-50 text-amber-900"
                                  : "border-slate-300 bg-slate-50 text-slate-800"
                            }
                          >
                            {t("patient.dashboard.recoveryConfidence")}: {recoveryConfidenceLabel}
                          </Badge>
                        </div>
                        {recoveryCached && (
                          <p className="text-xs text-slate-500">{t("patient.dashboard.recoveryCachedHint")}</p>
                        )}
                        <p className="text-sm text-slate-700 leading-relaxed">{recoveryPrediction.note}</p>
                        <Alert className="border-amber-200 bg-amber-50/80">
                          <AlertDescription className="text-amber-950 text-sm">
                            <span className="font-semibold">{t("patient.dashboard.recoveryDisclaimerTitle")}: </span>
                            {recoveryPrediction.disclaimer}
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </CollapsibleSection>
            </div>
          ) : null}
        </div>

        <CollapsibleSection
          title={t("patient.dashboard.upcomingAppointments")}
          description={t("patient.dashboard.scheduledVisits")}
          defaultOpen={true}
        >
          <div className="space-y-4">
            {upcomingAppointments.length === 0 && (
              <Card className="card-feature-group transition-all duration-300 hover:shadow-lg ">
                <CardContent className="p-6 text-sm text-slate-500">{t("patient.dashboard.noUpcomingAppointments")}</CardContent>
              </Card>
            )}
            {upcomingAppointments.map((apt) => (
              <Card key={apt.id} className="card-feature-group transition-all duration-300 hover:shadow-lg ">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="icon-feature-card">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-cyan-50 to-cyan-100">
                          <Calendar className="h-7 w-7" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-xl font-semibold mb-1">{apt.department || t("patient.dashboard.consultation")}</p>
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {t("patient.dashboard.doctorPrefix", { name: apt.doctor })}
                        </p>
                        <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                          <Clock className="h-4 w-4" />
                          {apt.date} {String(apt.time).slice(0, 5)} {apt.room ? `• ${t("patient.dashboard.room", { room: apt.room })}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-slate-600">{apt.status}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button className="w-full mt-6 btn-gradient transition-transform duration-500" asChild>
            <Link to="/patient/appointments" className="flex items-center justify-center gap-2">
              {t("patient.dashboard.viewAllAppointments")}
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
      `}</style>
    </PatientLayout>
  )
}
