"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Copy, FileDown, History, Loader2, PenLine, Plus, Printer, Save, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import { usePdfPreview } from "@/components/pdf-preview-dialog"
import { MedicationTable } from "@/components/emr-prescription/medication-table"
import { useDoctorSignature } from "@/components/emr-prescription/use-doctor-signature"
import {
  draftFrom,
  draftFromSuggestions,
  emptyMed,
  formatDiagnosisLine,
  formatDt,
  formatGenderVi,
  formatHistoryTableDate,
  isEmptyMedication,
  medicationsToExport,
  prescriptionDuration,
  resolveLocaleTag,
  toUiPrescription,
  validateDraft,
  DEFAULT_DURATION,
  type Medication,
  type UiPrescription,
} from "@/components/emr-prescription/medications"
import { EMR_PRESCRIPTION_SAVED_EVENT } from "@/components/doctor-emr/finish-examination-dialog"
import { useEmrSession } from "@/contexts/emr-session-context"
import { usePauseableToast } from "@/hooks/use-pauseable-toast"
import { buildAutoBytFields, generatePrescriptionPdfBlob, isPatientUnder72Months } from "@/lib/export-prescription-pdf"
import { doctorService } from "@/services/doctor-service"
import { profileService } from "@/services/profile-service"

const EMR_PRESCRIPTION_DRAFT_STATE_EVENT = "emr:prescription-draft-state"

/** Doctor EMR "Prescription" tab: history, new / inherited draft, AI suggestion, signed PDF. */
export default function PatientPrescription() {
  const { t, i18n } = useTranslation()
  const localeTag = resolveLocaleTag(i18n.language)
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const { patientId } = useParams<{ patientId: string }>()
  const { mutationsAllowed } = useEmrSession()
  const pdf = usePdfPreview(showError, () => (
    <Button type="button" variant="outline" className="btn-outline" disabled title={t("doctor.prescription.printDisabledHint")}>
      <Printer className="h-4 w-4 mr-2" />
      {t("doctor.prescription.print")}
    </Button>
  ))
  const signature = useDoctorSignature(showError, showSuccess)

  const [prescriptions, setPrescriptions] = useState<UiPrescription[]>([])
  const [selectedRx, setSelectedRx] = useState<UiPrescription | null>(null)
  /** Saved prescription shown before Add / Inherit; Cancel goes back to it. */
  const [viewRxBeforeEdit, setViewRxBeforeEdit] = useState<UiPrescription | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draftMeds, setDraftMeds] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [patientDetail, setPatientDetail] = useState<Awaited<ReturnType<typeof doctorService.getPatient>>["patient"] | null>(null)
  const [activeDiagnosis, setActiveDiagnosis] = useState<{ icd10: string; interpretation: string } | null>(null)

  const hasDraftContent = useMemo(() => draftMeds.some((med) => !isEmptyMedication(med)), [draftMeds])
  const hasUnsavedPrescriptionDraft = isEditMode && hasDraftContent

  // The EMR layout blocks "Finish examination" while a draft is unsaved.
  useEffect(() => {
    if (!patientId) return
    window.dispatchEvent(
      new CustomEvent(EMR_PRESCRIPTION_DRAFT_STATE_EVENT, {
        detail: { patientId: String(patientId), hasUnsavedChanges: hasUnsavedPrescriptionDraft, updatedAt: Date.now() },
      }),
    )
  }, [patientId, hasUnsavedPrescriptionDraft])

  /** BYT fields filled from the patient, their relative and their latest weight. */
  const resolveBytPayload = useCallback(async () => {
    if (!patientId || !patientDetail) throw new Error(t("doctor.prescription.patientLoadFail"))
    const [profile, healthRes] = await Promise.all([
      profileService.getProfile(patientDetail.id).catch(() => null),
      doctorService.getHealthInfo(Number(String(patientId).replace(/^OP0*/i, ""))).catch(() => ({ healthInfo: null })),
    ])
    return buildAutoBytFields({
      dateOfBirth: patientDetail.dateOfBirth,
      phone: patientDetail.phone,
      healthInsuranceId: patientDetail.healthInsuranceId,
      weightKg: healthRes?.healthInfo?.weight ?? null,
      relative:
        profile?.relativeName?.trim() || profile?.relativePhone?.trim()
          ? { name: profile.relativeName, phone: profile.relativePhone }
          : null,
    })
  }, [patientId, patientDetail, t])

  const load = useCallback(
    async (options?: { selectPrescriptionId?: string }) => {
      if (!patientId) return
      setLoading(true)
      try {
        const res = await doctorService.getPrescriptions(patientId)
        const rows = (res.prescriptions || []).map((p) => toUiPrescription(p, resolveLocaleTag(i18n.language)))
        setPrescriptions(rows)
        const pickId = options?.selectPrescriptionId
        if (pickId) {
          const pick = rows.find((r) => r.id === pickId)
          setSelectedRx(pick ? { ...pick, isDraft: false } : null)
        } else {
          setSelectedRx((prev) => {
            const matched = prev && rows.find((r) => r.id === prev.id)
            return matched ? { ...matched, isDraft: false } : null
          })
        }
        setDraftMeds([])
        setIsEditMode(false)
        setViewRxBeforeEdit(null)
      } catch (e) {
        console.error(e)
        showError(e instanceof Error ? e.message : t("doctor.prescription.loadFail"))
      } finally {
        setLoading(false)
      }
    },
    [patientId, showError, i18n.language, t],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Patient (for BYT fields and the PDF) and the most recent diagnosis.
  useEffect(() => {
    let alive = true
    if (!patientId) return
    void (async () => {
      try {
        const [patientRes, diagRes] = await Promise.all([
          doctorService.getPatient(patientId),
          doctorService
            .getDiagnoses(patientId)
            .catch(() => ({ success: false, diagnoses: [] as { icd10: string; interpretation: string; createdAt?: string }[] })),
        ])
        if (!alive) return
        if (patientRes.success && patientRes.patient) setPatientDetail(patientRes.patient)
        const list = diagRes.success && diagRes.diagnoses?.length ? diagRes.diagnoses : []
        const latest =
          list.length > 0
            ? [...list].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]
            : patientRes.patient?.latestDiagnosis
        setActiveDiagnosis(
          latest?.icd10 || latest?.interpretation ? { icd10: latest.icd10 || "", interpretation: latest.interpretation || "" } : null,
        )
      } catch {
        if (alive) {
          setPatientDetail(null)
          setActiveDiagnosis(null)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [patientId])

  const startDraft = (meds: Medication[], base: Partial<UiPrescription> = {}) => {
    setViewRxBeforeEdit(selectedRx && !selectedRx.isDraft ? selectedRx : null)
    setSelectedRx({
      medications: [],
      ...base,
      id: "new",
      createdAt: "",
      date: t("common.notAvailable"),
      doctor: t("common.notAvailable"),
      isDraft: true,
    })
    setDraftMeds(meds)
    setIsEditMode(true)
  }

  const handleAdd = () => {
    if (!mutationsAllowed) return
    startDraft([emptyMed()])
  }

  const handleInherit = () => {
    if (!mutationsAllowed || !selectedRx || selectedRx.isDraft) return
    startDraft(draftFrom(selectedRx.medications || []), selectedRx)
  }

  const handleSave = async () => {
    if (!mutationsAllowed || !patientId || !selectedRx || !isEditMode) return
    const checked = validateDraft(draftMeds)
    if ("error" in checked) {
      showError(checked.error)
      return
    }
    // Under 72 months the BYT fields are checked first; the save reuses them.
    let byt: Awaited<ReturnType<typeof resolveBytPayload>> | null = null
    if (isPatientUnder72Months(patientDetail?.dateOfBirth)) {
      try {
        byt = await resolveBytPayload()
        if (!byt.patientWeightKg) {
          showError("Cập nhật cân nặng bệnh nhân trong Health Info (trẻ dưới 72 tháng)")
          return
        }
        if (!byt.contactPhone) {
          showError("Thiếu SĐT bệnh nhân hoặc người thân")
          return
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : t("doctor.prescription.saveFail"))
        return
      }
    }
    setSaving(true)
    try {
      const created = await doctorService.createPrescription(patientId, {
        department: activeDiagnosis?.interpretation?.trim() || undefined,
        medications: checked.lines,
        duration: prescriptionDuration(checked.lines),
        byt: byt ?? (await resolveBytPayload()),
      })
      const newId = created.success && created.prescription?.id != null ? String(created.prescription.id) : undefined
      await load(newId ? { selectPrescriptionId: newId } : undefined)
      setIsEditMode(false)
      window.dispatchEvent(
        new CustomEvent(EMR_PRESCRIPTION_SAVED_EVENT, {
          detail: { patientId: String(patientId), prescriptionId: newId ?? null, savedAt: Date.now() },
        }),
      )
      showSuccess(t("doctor.prescription.saveSuccess"))
    } catch (e) {
      showError(e instanceof Error ? e.message : t("doctor.prescription.saveFail"))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setIsEditMode(false)
    setSelectedRx(viewRxBeforeEdit ? { ...viewRxBeforeEdit, isDraft: false } : null)
    setDraftMeds([])
    setViewRxBeforeEdit(null)
  }

  const handleAiSuggest = async () => {
    if (!patientId || !selectedRx?.isDraft) return
    setAiSuggesting(true)
    try {
      const patient = patientDetail
      const diagnosis = formatDiagnosisLine(activeDiagnosis ?? patient?.latestDiagnosis ?? null, t("doctor.prescription.generalConsultation"))
      const na = t("doctor.prescription.patientInfoNa")
      const filled = (v: unknown) => (v != null && String(v).trim() !== "" ? String(v) : na)
      const patientInfo = patient
        ? t("doctor.prescription.patientInfoLine", {
            ageLabel: t("doctor.prescription.patientInfoAge"),
            age: filled(patient.age),
            genderLabel: t("doctor.prescription.patientInfoGender"),
            gender: formatGenderVi(patient.gender) || na,
            bmiLabel: t("doctor.prescription.patientInfoBmi"),
            bmi: filled(patient.bmi),
          })
        : ""
      const res = await doctorService.getAiMedicineSuggestions({
        diagnosis,
        symptoms: diagnosis,
        patientInfo,
        language: i18n.language?.toLowerCase().startsWith("vi") ? "vi" : "en",
      })
      if (res.success && res.suggestions.length > 0) {
        setDraftMeds(draftFromSuggestions(res.suggestions))
        showSuccess(t("doctor.prescription.aiSuggestSuccess", { count: res.suggestions.length }))
      } else {
        showError(t("doctor.prescription.aiNoSuggestions"))
      }
    } catch (err) {
      showError((err instanceof Error && err.message) || t("doctor.prescription.aiSuggestFail"))
    } finally {
      setAiSuggesting(false)
    }
  }

  const exportMeds = medicationsToExport(selectedRx, draftMeds)
  const exportingPdf = pdf.busyKey === "export"
  const canExportPdf = !!patientId && exportMeds.length > 0 && !exportingPdf

  const handleExportPdf = () => {
    if (!patientId || exportMeds.length === 0) return
    void pdf.preview("export", t("doctor.prescription.dialogPdfTitle"), async () => {
      const sigDataUrl = await signature.ensureSignature()
      if (!sigDataUrl) return null
      const res = await doctorService.getPatient(patientId)
      if (!res.success || !res.patient) throw new Error(t("doctor.prescription.patientLoadFail"))
      const dx = activeDiagnosis ?? res.patient.latestDiagnosis
      const dash = t("common.notAvailable")
      const rxByt = selectedRx?.byt
      const autoByt = await resolveBytPayload()
      const made = await generatePrescriptionPdfBlob({
        patient: {
          ...res.patient,
          latestDiagnosis: dx
            ? {
                icd10: dx.icd10,
                interpretation: dx.interpretation,
                department: "department" in dx ? String(dx.department || "") : "",
              }
            : null,
        },
        medications: exportMeds.map((m) => ({
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          duration: String(m.duration ?? "").trim() || DEFAULT_DURATION,
          usage: m.usage ?? "",
          note: m.note,
        })),
        prescriptionDateIso: selectedRx?.createdAt || new Date().toISOString(),
        doctorName: selectedRx?.doctor && selectedRx.doctor !== dash ? selectedRx.doctor : dash,
        byt: {
          code: rxByt?.code || null,
          prescriptionType: rxByt?.prescriptionType || "C",
          facilityCode: rxByt?.facilityCode || "TC001",
          facilityName: rxByt?.facilityName || import.meta.env.VITE_BYT_FACILITY_NAME || "TechCare",
          facilityAddress: rxByt?.facilityAddress || import.meta.env.VITE_BYT_FACILITY_ADDRESS || "",
          facilityPhone: autoByt.facilityPhone,
          contactPhone: autoByt.contactPhone,
          guardianName: autoByt.guardianName,
          advice: rxByt?.advice?.trim() || autoByt.advice,
          insuranceId: autoByt.insuranceId || res.patient.healthInsuranceId || "",
          patientAddress: autoByt.patientAddress,
          patientWeightKg: autoByt.patientWeightKg,
          patientIdCard: res.patient.idCard || rxByt?.patientIdCard || "",
          patientPhone: res.patient.phone || rxByt?.patientPhone || "",
        },
        // Export always shows the doctor's name and signature image.
        signatureStatus: "signed",
        signatureDataUrl: sigDataUrl,
      })
      showSuccess(t("doctor.prescription.pdfPreviewSuccess"))
      return made
    })
  }

  const canAdd = !isEditMode && !loading && !saving && mutationsAllowed
  const canInherit = !isEditMode && !!selectedRx && !selectedRx.isDraft && !loading && !saving && mutationsAllowed

  return (
    <>
      {signature.dialog}
      <div className="grid grid-cols-12 gap-6">
        {pdf.dialog}

        <Card className="col-span-4">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <History size={18} />
                <h3 className="font-semibold text-lg">{t("doctor.prescription.historyTitle")}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="btn-outline shrink-0"
                  disabled={loading || signature.saving || signature.opening}
                  onClick={() => void signature.openEditor()}
                  title={t("doctor.prescription.editSignatureHint")}
                >
                  {signature.opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                  <span className="ml-2">{t("doctor.prescription.editSignature")}</span>
                </Button>
                <Button type="button" size="sm" variant="outline" className="btn-outline shrink-0" disabled={!canExportPdf} onClick={handleExportPdf}>
                  {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  <span className="ml-2">{t("doctor.prescription.exportPdf")}</span>
                </Button>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">{t("common.loading")}</p>
            ) : (
              <div className="overflow-hidden border rounded-lg">
                <Table className="w-full table-fixed text-xs">
                  <TableHeader className="text-white" style={{ background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)" }}>
                    <TableRow>
                      <TableHead className="w-[38%] p-1.5 text-left text-[13px] font-semibold text-white">{t("doctor.prescription.colDate")}</TableHead>
                      <TableHead className="p-1.5 text-left text-[13px] font-semibold text-white">{t("doctor.patients.colDoctor")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prescriptions.map((rx) => (
                      <TableRow
                        key={rx.id}
                        onClick={() => {
                          if (isEditMode) return
                          setSelectedRx({ ...rx, isDraft: false })
                          setDraftMeds([])
                        }}
                        className={`border-t cursor-pointer ${selectedRx?.id === rx.id ? "bg-cyan-50" : ""}`}
                      >
                        <TableCell className="max-w-0 p-1.5 align-top leading-snug">
                          <span className="block truncate" title={formatDt(rx.createdAt, localeTag)}>
                            {formatHistoryTableDate(rx.createdAt, localeTag, t("common.notAvailable"))}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-0 p-1.5 align-top leading-snug">
                          <span className="block truncate" title={rx.doctor}>
                            {rx.doctor}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-8">
          <CardContent className="p-4">
            <div className="flex items-center justify-end mb-4">
              <div className="flex gap-2 flex-wrap justify-end">
                <Button size="sm" className="btn-gradient transition-transform duration-500" onClick={handleAdd} disabled={!canAdd}>
                  <Plus className="h-4 w-4" />
                  {t("doctor.prescription.add")}
                </Button>
                {selectedRx?.isDraft && isEditMode && (
                  <Button
                    size="sm"
                    className="h-9 gap-2 border-0 !bg-gradient-to-r !from-violet-500 !to-purple-600 px-4 text-white shadow-sm hover:from-violet-600 hover:to-purple-700"
                    onClick={() => void handleAiSuggest()}
                    disabled={aiSuggesting}
                    title={t("doctor.prescription.aiSuggestHint")}
                  >
                    {aiSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t("doctor.prescription.aiSuggest")}
                  </Button>
                )}
                <Button size="sm" className="btn-outline transition-transform duration-500" onClick={handleInherit} disabled={!canInherit}>
                  <Copy className="h-4 w-4" />
                  {t("doctor.prescription.inherit")}
                </Button>
                <Button
                  size="sm"
                  className="btn-outline transition-transform duration-500"
                  onClick={() => void handleSave()}
                  disabled={!isEditMode || loading || !mutationsAllowed || saving}
                >
                  <Save className="h-4 w-4" />
                  {t("doctor.prescription.save")}
                </Button>
                <Button size="sm" className="btn-outline transition-transform duration-500" onClick={handleCancel} disabled={!isEditMode || loading || saving}>
                  <X className="h-4 w-4" />
                  {t("doctor.prescription.cancel")}
                </Button>
              </div>
            </div>

            {!selectedRx ? (
              <p className="text-sm text-slate-500">{t("doctor.prescription.selectRowHint")}</p>
            ) : (
              <div className="space-y-3">
                {activeDiagnosis && (activeDiagnosis.icd10 || activeDiagnosis.interpretation) ? (
                  <p className="text-sm text-slate-700 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <span className="font-semibold">{t("doctor.prescription.activeDiagnosisLabel")}: </span>
                    {formatDiagnosisLine(activeDiagnosis, t("doctor.prescription.diagnosisLineFallback"))}
                  </p>
                ) : null}
                <MedicationTable rx={selectedRx} draft={draftMeds} onDraftChange={setDraftMeds} editable={mutationsAllowed} saving={saving} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <PauseableCornerToastPortal toast={toast} isExiting={isExiting} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
    </>
  )
}
