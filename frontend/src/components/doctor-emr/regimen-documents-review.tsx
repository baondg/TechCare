import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { doctorService, type PatientDetail } from "@/services/doctor-service"
import { generateFollowUpReexamPdfBlob } from "@/lib/export-follow-up-reexam-pdf"
import { generatePrescriptionPdfBlob } from "@/lib/export-prescription-pdf"
import { fetchDoctorSignatureForPdf } from "@/lib/fetch-doctor-signature-for-pdf"
import { generateSurgeryPdfBlob } from "@/lib/export-surgery-pdf"
import { generateBloodTestPdfBlob } from "@/lib/export-blood-test-pdf"
import { generateHospitalTransferPdfBlob } from "@/lib/export-hospital-transfer-pdf"
import { generateHealthInfoTrackingPdfBlob } from "@/lib/export-health-info-tracking-pdf"
import { buildSigningTimeLine, signingLineFromIso } from "@/lib/pdf-export-stamp"
import type { usePdfPreview } from "@/components/pdf-preview-dialog"
import { formatDateTime, readSignedInDisplayName } from "./slips"

export type RegimenDocuments = NonNullable<Awaited<ReturnType<typeof doctorService.getActiveRegimenDocuments>>["regimen"]>

type Pdf = Pick<ReturnType<typeof usePdfPreview>, "preview" | "busyKey">

const SHOWN = 6

function Section<T>({ title, items, render }: { title: string; items: T[] | undefined; render: (item: T) => ReactNode }) {
  if (!items?.length) return null
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-slate-600">{title}</div>
      {items.slice(0, SHOWN).map(render)}
      {items.length > SHOWN ? (
        <div className="text-xs text-muted-foreground">…and {items.length - SHOWN} more</div>
      ) : null}
    </div>
  )
}

function DocumentRow({
  title,
  subtitle,
  extra,
  pdf,
  pdfKey,
  disabled,
  onPreview,
}: {
  title: ReactNode
  subtitle: ReactNode
  extra?: ReactNode
  pdf: Pdf
  pdfKey: string
  disabled?: boolean
  onPreview: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <div className="text-slate-800 font-medium truncate">{title}</div>
        <div className="text-xs text-slate-600">{subtitle}</div>
        {extra}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={disabled || pdf.busyKey === pdfKey} onClick={onPreview}>
        {pdf.busyKey === pdfKey ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Preview PDF
      </Button>
    </div>
  )
}

const COUNTS: { label: string; of: (d: RegimenDocuments) => unknown[] | undefined }[] = [
  { label: "Prescriptions", of: (d) => d.prescriptions },
  { label: "Diagnoses", of: (d) => d.diagnoses },
  { label: "Lab tests", of: (d) => d.labTests },
  { label: "Surgeries", of: (d) => d.surgeries },
  { label: "Hospital transfers", of: (d) => d.hospitalTransfers },
  { label: "Follow-up reexam slips", of: (d) => d.followUpReexamSlips },
  { label: "Health tracking slips", of: (d) => d.healthTrackingSlips },
]

/** Finish wizard step 2: the papers of the open regimen, each with a PDF preview. */
export function RegimenDocumentsReview({
  docs,
  patient,
  patientId,
  pdf,
}: {
  docs: RegimenDocuments
  patient: PatientDetail | null
  patientId: string
  pdf: Pdf
}) {
  const patientName = patient ? `${patient.lastName || ""} ${patient.firstName || ""}`.trim() || patient.username : "—"
  const diagnosisLine = patient?.latestDiagnosis
    ? `${patient.latestDiagnosis.icd10 || "—"} — ${patient.latestDiagnosis.interpretation || "—"}`
    : "—"

  return (
    <div className="rounded-md border bg-white">
      <div className="border-b bg-slate-50 px-3 py-2 text-sm font-medium">Regimen documents</div>
      <div className="grid gap-2 p-3 text-sm">
        {COUNTS.map(({ label, of }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-slate-700">{label}</span>
            <span className="font-medium">{of(docs)?.length || 0}</span>
          </div>
        ))}
      </div>
      <div className="border-t p-3 space-y-3">
        <Section
          title="Prescriptions"
          items={docs.prescriptions}
          render={(rx) => {
            const rxCode = String(rx.byt?.code || "").trim()
            return (
              <DocumentRow
                key={rx.id}
                title="Prescription"
                subtitle={rx.prescribedAt ? formatDateTime(rx.prescribedAt) : "—"}
                extra={rxCode ? <div className="text-xs text-slate-600 truncate">Mã đơn: {rxCode}</div> : null}
                pdf={pdf}
                pdfKey={`rx-${rx.id}`}
                disabled={!patient}
                onPreview={() => {
                  if (!patient) return
                  void pdf.preview(`rx-${rx.id}`, "Prescription (PDF)", async () =>
                    generatePrescriptionPdfBlob({
                      patient,
                      medications: (rx.medications || []).map((m) => ({
                        name: m.name,
                        quantity: m.quantity || "—",
                        unit: m.unit || "tablet",
                        duration: m.duration,
                        usage: m.usage || "—",
                        note: m.note || "",
                      })),
                      byt: rx.byt,
                      prescriptionDate: rx.prescribedAt || undefined,
                      doctorName: readSignedInDisplayName() || "—",
                      signatureStatus: "signed",
                      signatureDataUrl: await fetchDoctorSignatureForPdf(),
                      filename: `prescription-${rx.id}.pdf`,
                      signingTimeDisplay: signingLineFromIso(rx.prescribedAt),
                    }),
                  )
                }}
              />
            )
          }}
        />

        <Section
          title="Diagnoses"
          items={docs.diagnoses}
          render={(dx) => (
            <div key={dx.id} className="rounded-md border bg-slate-50 px-3 py-2">
              <div className="text-slate-800 font-medium truncate">
                {dx.icd10 || "—"}{dx.interpretation ? ` - ${dx.interpretation}` : ""}
              </div>
              <div className="text-xs text-slate-600">
                {formatDateTime(dx.diagnosedAt)}{dx.complaint ? ` · ${dx.complaint}` : ""}
              </div>
            </div>
          )}
        />

        <Section
          title="Surgeries"
          items={docs.surgeries}
          render={(s) => (
            <DocumentRow
              key={s.id}
              title={s.surgeryType || "Surgery"}
              subtitle={formatDateTime(s.start)}
              pdf={pdf}
              pdfKey={`surgery-${s.id}`}
              disabled={!patient}
              onPreview={() => {
                if (!patient) return
                void pdf.preview(`surgery-${s.id}`, "Surgery (PDF)", () =>
                  generateSurgeryPdfBlob({
                    patientLabel: patientName,
                    patientAge: patient.age,
                    patientGender: patient.gender,
                    healthInsuranceId: patient.healthInsuranceId ?? null,
                    latestDiagnosisText: diagnosisLine,
                    surgeon: s.surgeon || "—",
                    type: s.surgeryType || "—",
                    urgency: s.urgency || "—",
                    start: s.start,
                    end: s.end,
                    result: s.result || "—",
                    note: s.note || "",
                    filename: `surgery-${s.id}.pdf`,
                    signingTimeDisplay: signingLineFromIso(s.start),
                  }),
                )
              }}
            />
          )}
        />

        <Section
          title="Lab tests"
          items={docs.labTests}
          render={(t) => (
            <DocumentRow
              key={t.id}
              title={t.testType || "Test"}
              subtitle={formatDateTime(t.testAt)}
              pdf={pdf}
              pdfKey={`lab-${t.id}`}
              disabled={!patient}
              onPreview={() => {
                if (!patient) return
                void pdf.preview(`lab-${t.id}`, "Lab (PDF)", async () => {
                  const detailRes = await doctorService.getLabTestDetails(patientId, t.id)
                  return generateBloodTestPdfBlob({
                    patientName,
                    age: patient.age != null ? String(patient.age) : "—",
                    gender: patient.gender,
                    department: docs.treatments?.[0]?.department || "Laboratory",
                    diagnosis: diagnosisLine,
                    testDateLabel: formatDateTime(t.testAt),
                    details: detailRes.details ?? [],
                    filename: `lab-${t.id}.pdf`,
                    signingTimeDisplay: signingLineFromIso(t.testAt),
                  })
                })
              }}
            />
          )}
        />

        <Section
          title="Hospital transfers"
          items={docs.hospitalTransfers}
          render={(ht) => (
            <DocumentRow
              key={ht.orderId}
              title={ht.toHospitalName || "—"}
              subtitle={formatDateTime(ht.transferAt)}
              pdf={pdf}
              pdfKey={`ht-${ht.orderId}`}
              disabled={!patient}
              onPreview={() => {
                if (!patient) return
                void pdf.preview(`ht-${ht.orderId}`, "Hospital transfer (PDF)", () =>
                  generateHospitalTransferPdfBlob({
                    patientName,
                    patientDob: "—",
                    patientSex: patient.gender === "M" ? "M" : patient.gender === "F" ? "F" : patient.gender || undefined,
                    insuranceId: patient.healthInsuranceId || undefined,
                    insuranceExpiry: "—",
                    destinationHospital: ht.toHospitalName,
                    destinationRefId: ht.toHospitalId,
                    reason: ht.reason,
                    note: ht.note,
                    transport: ht.transport,
                    transferAt: formatDateTime(ht.transferAt),
                    doctorName: readSignedInDisplayName() || "—",
                    facilityName: "TechCare",
                    icd10: patient.latestDiagnosis?.icd10,
                    diagnosis: patient.latestDiagnosis?.interpretation,
                    formPayload: ht.formPayload,
                    filename: `hospital-transfer-${ht.orderId}.pdf`,
                    signingTimeDisplay: signingLineFromIso(ht.transferAt),
                  }),
                )
              }}
            />
          )}
        />

        <Section
          title="Follow-up reexam slips"
          items={docs.followUpReexamSlips}
          render={(slipRow) => (
            <DocumentRow
              key={slipRow.orderId}
              title="Follow-up Slip"
              subtitle={formatDateTime(slipRow.createdAt)}
              pdf={pdf}
              pdfKey={`fup-${slipRow.orderId}`}
              onPreview={() =>
                void pdf.preview(`fup-${slipRow.orderId}`, "Follow-up slip (PDF)", () =>
                  generateFollowUpReexamPdfBlob({
                    ...((slipRow.slip || {}) as Parameters<typeof generateFollowUpReexamPdfBlob>[0]),
                    signingTimeDisplay: buildSigningTimeLine(new Date(slipRow.createdAt)),
                    filename: `follow-up-${slipRow.orderId}.pdf`,
                  }),
                )
              }
            />
          )}
        />

        <Section
          title="Health tracking slips"
          items={docs.healthTrackingSlips}
          render={(slip) => (
            <DocumentRow
              key={slip.orderId}
              title="Health Tracking Slip"
              subtitle={`${formatDateTime(slip.createdAt)} · ${slip.rows?.length || 0} row(s)`}
              pdf={pdf}
              pdfKey={`hts-${slip.orderId}`}
              disabled={!patient}
              onPreview={() => {
                if (!patient) return
                const dx = patient.latestDiagnosis
                void pdf.preview(`hts-${slip.orderId}`, "Health tracking slip (PDF)", () =>
                  generateHealthInfoTrackingPdfBlob({
                    patientName: `${patient.lastName || ""} ${patient.firstName || ""}`.trim() || patient.username || "",
                    age: patient.age == null ? "" : String(patient.age),
                    gender: patient.gender === "M" ? "Male" : patient.gender === "F" ? "Female" : "",
                    diagnosis: dx
                      ? `${dx.icd10 || ""}${dx.icd10 && dx.interpretation ? " - " : ""}${dx.interpretation || ""}`
                      : "",
                    rows: (Array.isArray(slip.rows) ? slip.rows : []).map((r) => ({
                      updatedAt: new Date(r.updatedAt),
                      bloodPressure: r.bloodPressure || "",
                      pulse: Number(r.pulse) || 0,
                      temperature: Number(r.temperature) || 0,
                      weight: Number(r.weight) || 0,
                      respiratoryRate: Number(r.respiratoryRate) || 0,
                      spo2: Number(r.spo2) || 0,
                      symptoms: r.symptoms || "",
                    })),
                    filename: `health-tracking-${slip.orderId}.pdf`,
                    signingTimeDisplay: signingLineFromIso(slip.createdAt),
                  }),
                )
              }}
            />
          )}
        />
      </div>
    </div>
  )
}
