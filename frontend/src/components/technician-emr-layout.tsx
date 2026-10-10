import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Card } from "@/components/ui/card"
import { TechnicianLayout } from "./technician-layout"
import ViewingPatientLab from "@/pages/technician/medical-records/lab"
import { useCallback, useEffect, useMemo, useState } from "react"
import { EmrSessionProvider } from "@/contexts/emr-session-context"
import { doctorService } from "@/services/doctor-service"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { translatePatientInDepartment } from "@/lib/patient-departments"

export function TechnicianEmrLayout() {
  const { patientId } = useParams()
  const { t } = useTranslation()
  const [patientData, setPatientData] = useState<any>(null)
  const [visitLoading, setVisitLoading] = useState(true)
  const [visitActive, setVisitActive] = useState(false)

  const loadVisitState = useCallback(async () => {
    if (!patientId) {
      setVisitLoading(false)
      setVisitActive(false)
      return
    }
    setVisitLoading(true)
    try {
      const r = await doctorService.getActiveRegimen(patientId)
      setVisitActive(Boolean(r.success && r.active))
    } catch {
      setVisitActive(false)
    } finally {
      setVisitLoading(false)
    }
  }, [patientId])

  const loadPatientBanner = useCallback(async () => {
    if (!patientId) return
    try {
      const res = await doctorService.getPatient(patientId)
      if (res.success) setPatientData(res.patient)
    } catch (err) {
      console.error(err)
    }
  }, [patientId])

  useEffect(() => {
    void loadPatientBanner()
    void loadVisitState()
  }, [patientId, loadVisitState, loadPatientBanner])

  const refreshPatientBanner = useCallback(() => {
    void loadPatientBanner()
  }, [loadPatientBanner])

  const emrSessionValue = useMemo(
    () => ({
      visitLoading,
      visitActive,
      mutationsAllowed: !visitLoading && visitActive,
      refreshPatientBanner,
    }),
    [visitLoading, visitActive, refreshPatientBanner]
  )

  return (
    <EmrSessionProvider value={emrSessionValue}>
      <TechnicianLayout>
        <div className="space-y-6 w-full">
          {!visitLoading && patientId && !visitActive && patientData ? (
            <Alert variant="default" className="border-amber-200 bg-amber-50 text-amber-950">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This patient is not checked in yet. You can view lab history; creating or updating lab records is
                disabled until the nurse completes check-in.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card className="p-4 flex items-center justify-between border-r border-white/40 sticky bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
            <div>
              {patientData ? (
                <>
                  <p className="font-semibold text-lg">
                    {patientData.lastName} {patientData.firstName} | {patientData.age}{" "}
                    {patientData.gender === "M" ? "Male" : "Female"} | BMI: {patientData.bmi ?? "N/A"}
                  </p>
                  {patientData.latestDiagnosis && (
                    <p className="text-sm text-slate-600">
                      Diagnosis: {patientData.latestDiagnosis.icd10 || "—"} -{" "}
                      {patientData.latestDiagnosis.interpretation || "—"}
                    </p>
                  )}
                  <p className="text-sm text-slate-500">
                    {t("doctor.patients.department")}:{" "}
                    {translatePatientInDepartment(patientData.inDepartment || patientData.in_department, t)}
                  </p>
                </>
              ) : (
                <p className="font-semibold text-lg">Loading patient...</p>
              )}
            </div>
          </Card>

          <div>
            <ViewingPatientLab />
          </div>
        </div>
      </TechnicianLayout>
    </EmrSessionProvider>
  )
}
