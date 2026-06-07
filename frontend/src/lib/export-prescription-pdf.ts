import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"
import type { PatientDetail } from "@/services/doctor-service"
import { medicationUnitLabelVi } from "@/lib/medication-units-vi"
import { stampPdfWithExportFooter } from "@/lib/pdf-export-stamp"

export interface ExportMedicationRow {
  name: string
  quantity: string
  unit: string
  /** Treatment days (PRESCRIPTION_DETAIL.duration). */
  duration?: string
  usage: string
  note?: string
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function genderVi(g: string | null): string {
  if (g === "M") return "Nam"
  if (g === "F") return "Nữ"
  return "Khác"
}

const DEFAULT_FACILITY_NAME =
  (import.meta.env.VITE_BYT_FACILITY_NAME as string | undefined)?.trim() || "TechCare"
const DEFAULT_FACILITY_ADDRESS =
  (import.meta.env.VITE_BYT_FACILITY_ADDRESS as string | undefined)?.trim() ||
  "268 Lý Thường Kiệt, phường Diên Hồng, Hồ Chí Minh"
const DEFAULT_FACILITY_PHONE =
  (import.meta.env.VITE_BYT_FACILITY_PHONE as string | undefined)?.trim() || "1900 1800"

function parseFlexibleDate(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const parsed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

/** dd/mm/yyyy — mẫu BYT */
function formatVnDateOnly(raw: string | Date | null | undefined): string {
  const d = raw instanceof Date ? raw : parseFlexibleDate(String(raw ?? ""))
  if (!d) return ""
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Ngày dd tháng mm năm yyyy — khối ký mẫu BYT */
function formatBytSignatureDate(raw: string | Date | null | undefined): string {
  const d = raw instanceof Date ? raw : parseFlexibleDate(String(raw ?? ""))
  if (!d) return "Ngày...... tháng...... năm 20...."
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `Ngày ${dd} tháng ${mm} năm ${yyyy}`
}

function patientAgeMonths(dobRaw: string | null | undefined): number | null {
  const d = parseFlexibleDate(dobRaw)
  if (!d) return null
  const now = new Date()
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()))
}

function dottedLine(value: string, minDots = 40): string {
  const v = String(value ?? "").trim()
  if (v) return escapeHtml(v)
  return ".".repeat(minDots)
}

function slugFilenamePart(s: string): string {
  const safe = String(s ?? "")
  return safe.replace(/[^\w\u00C0-\u024f]+/gi, "-").replace(/^-|-$/g, "") || "patient"
}

/** A4 inner area (mm) — same margins as previous html2pdf setup: top, left, bottom, right */
const MARGIN_MM = { top: 10, left: 10, bottom: 12, right: 10 }

/**
 * Split a tall canvas into a multi-page jsPDF document (A4, image per page).
 */
function canvasToPdfDocument(canvas: HTMLCanvasElement): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const innerWidth = pageWidth - MARGIN_MM.left - MARGIN_MM.right
  const innerHeight = pageHeight - MARGIN_MM.top - MARGIN_MM.bottom
  const innerRatio = innerHeight / innerWidth

  const pxFullHeight = canvas.height
  const pxPageHeight = Math.max(1, Math.floor(canvas.width * innerRatio))
  const nPages = Math.max(1, Math.ceil(pxFullHeight / pxPageHeight))

  const pageCanvas = document.createElement("canvas")
  const pageCtx = pageCanvas.getContext("2d")
  if (!pageCtx) throw new Error("Canvas unsupported")
  pageCanvas.width = canvas.width

  for (let page = 0; page < nPages; page++) {
    const sliceTop = page * pxPageHeight
    const slicePx = Math.min(pxPageHeight, pxFullHeight - sliceTop)
    if (slicePx <= 0) break

    pageCanvas.height = slicePx
    const w = pageCanvas.width
    const h = pageCanvas.height
    pageCtx.fillStyle = "#ffffff"
    pageCtx.fillRect(0, 0, w, h)
    pageCtx.drawImage(canvas, 0, sliceTop, w, h, 0, 0, w, h)

    if (page > 0) pdf.addPage()
    const pageHeightMm = (h * innerWidth) / canvas.width
    const imgData = pageCanvas.toDataURL("image/jpeg", 0.92)
    pdf.addImage(imgData, "JPEG", MARGIN_MM.left, MARGIN_MM.top, innerWidth, pageHeightMm)
  }

  return pdf
}

export type PrescriptionPdfResult = { blob: Blob; filename: string }

/**
 * Renders HTML in a sandboxed iframe, then captures with html2canvas inside that document only
 * (avoids Tailwind oklch on the main page).
 */
export type ExportPrescriptionSignatureStatus = "draft" | "signed" | "voided"

export async function generatePrescriptionPdfBlob(opts: {
  patient: PatientDetail
  medications: ExportMedicationRow[]
  /** ISO hoặc chuỗi ngày — dùng cho khối ký và ngày kê đơn */
  prescriptionDateIso?: string | null
  prescriptionDate?: string
  doctorName: string
  byt?: {
    code?: string | null
    prescriptionType?: "N" | "H" | "C"
    facilityCode?: string
    facilityName?: string
    facilityAddress?: string
    facilityPhone?: string
    contactPhone?: string
    guardianName?: string
    advice?: string
    insuranceId?: string
    patientAddress?: string
    patientWeightKg?: string
    patientIdCard?: string
    patientPhone?: string
  }
  filename?: string
  /** Red diagonal watermark on PDF when voided */
  signatureStatus?: ExportPrescriptionSignatureStatus
  /** Base64 data URL of the doctor's signature image */
  signatureDataUrl?: string | null
  /** Phía trên tên bác sĩ ở khối ký */
  signingTimeDisplay?: string | null
}): Promise<PrescriptionPdfResult> {
  const { patient, medications, doctorName } = opts
  const rxDateRaw = opts.prescriptionDateIso || opts.prescriptionDate || new Date().toISOString()
  const signatureDateLine = formatBytSignatureDate(rxDateRaw)
  const fullName = `${patient.lastName || ""} ${patient.firstName || ""}`.trim() || patient.username
  const byt = opts.byt || {}
  const facilityName = String(byt.facilityName || DEFAULT_FACILITY_NAME).trim() || DEFAULT_FACILITY_NAME
  const facilityAddress = String(byt.facilityAddress || DEFAULT_FACILITY_ADDRESS).trim()
  const prescriptionCode = String(byt.code || "").trim()
  const idCard = String(byt.patientIdCard || patient.idCard || "").trim()
  const hasIdCard = idCard.length > 0
  const dobFormatted = formatVnDateOnly(patient.dateOfBirth)
  const ageMonths = patientAgeMonths(patient.dateOfBirth)
  const isChildUnder72 = ageMonths != null && ageMonths < 72
  const weightKg = String(byt.patientWeightKg || "").trim()
  const patientAddress = String(byt.patientAddress || DEFAULT_FACILITY_ADDRESS).trim()
  const diagnosisLine = patient.latestDiagnosis
    ? `${patient.latestDiagnosis.icd10 || "—"} — ${patient.latestDiagnosis.interpretation || "—"}`
    : "—"

  const adviceLines = String(byt.advice || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => escapeHtml(line))
    .join("<br/>")

  const rows = medications
    .map((m, i) => {
      const unitLabel = medicationUnitLabelVi(m.unit)
      const name = escapeHtml(m.name)
      const qty = escapeHtml(m.quantity || "—")
      const dur =
        m.duration != null && String(m.duration).trim() !== ""
          ? escapeHtml(String(m.duration).trim())
          : "—"
      const usage = escapeHtml(m.usage || "—")
      return `
      <tr>
        <td style="vertical-align:top;border:1px solid #222222;padding:6px;width:32px;text-align:center;font-weight:600">${i + 1}</td>
        <td style="vertical-align:top;border:1px solid #222222;padding:6px;color:#111111;background:#ffffff">
          <div style="font-weight:700;font-size:12px;color:#111111">${name}</div>
          <div style="margin-top:4px;font-size:11px;color:#111111">
            <span style="font-weight:600">Số lượng:</span> ${qty}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <span style="font-weight:600">Đơn vị:</span> ${escapeHtml(unitLabel)}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <span style="font-weight:600">Số ngày dùng:</span> ${dur}
          </div>
        </td>
      </tr>
      <tr>
        <td style="border:1px solid #222222;background:#f5f5f5"></td>
        <td style="border:1px solid #222222;padding:6px 8px 10px 14px;font-size:11px;color:#111111;background:#ffffff">
          <span style="font-style:italic">Cách dùng:</span> ${usage}
        </td>
      </tr>`
    })
    .join("")

  const css = `
    html, body { margin: 0; padding: 0; color: #111111; background: #ffffff; }
    body {
      font-family: "Times New Roman", Times, "DejaVu Serif", serif;
      font-size: 12px;
      line-height: 1.45;
      padding: 12px 16px 28px;
      box-sizing: border-box;
    }
    h1 { text-align: center; font-size: 30px; letter-spacing: 0; margin: 0 0 4px; color: #111111; }
    .section-gap { margin-top: 8px; }
    .meta div { margin: 4px 0; color: #111111; }
    .label { font-weight: 700; }
    .pdf-doc-root { position: relative; min-height: 100%; }
    table.rx { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 14px; }
    th { background: #e0e0e0; border: 1px solid #222222; padding: 8px; text-align: left; font-size: 11px; color: #111111; }
    .footer { margin-top: 18px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
    .advice { flex: 1; min-width: 0; color: #111111; }
    .sig { flex: 0 0 38%; text-align: center; color: #111111; }
    .sig-box { border: 1px dashed #888888; min-height: 72px; margin: 10px 0 8px; margin-left: auto; max-width: 200px; background: #ffffff; display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 4px; }
    .sig-box img { display: block; max-width: 100%; max-height: 64px; object-fit: contain; }
  `

  const unsignedWatermark =
    opts.signatureStatus === "voided"
      ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5;overflow:hidden">
          <span style="transform:rotate(-18deg);font-size:56px;font-weight:900;color:rgba(220,38,38,0.2);letter-spacing:0.2em;white-space:nowrap;font-family:'Times New Roman',Times,'DejaVu Serif',serif">ĐÃ HỦY KÝ SỐ</span>
        </div>`
      : ""

  const showSignatureBlockName = opts.signatureStatus !== "draft"
  const signatureDoctorLine = showSignatureBlockName ? escapeHtml(doctorName) : ""

  const sigUrlRaw = opts.signatureDataUrl?.trim() ?? ""

  const patientIdentityBlock = hasIdCard
    ? `<div><span class="label">Số định danh cá nhân/số căn cước công dân/số căn cước/số hộ chiếu của người bệnh (nếu có):</span> ${escapeHtml(idCard)}</div>`
    : `<div><span class="label">Ngày sinh:</span> ${escapeHtml(dobFormatted || "....../....../........")} &nbsp;&nbsp; <span class="label">Giới tính:</span> ${escapeHtml(genderVi(patient.gender))}</div>`

  const weightBlock =
    isChildUnder72 || weightKg
      ? `<div><span class="label">Cân nặng</span> (phải ghi đối với trẻ dưới 72 tháng tuổi): ${escapeHtml(weightKg || "........")} kg</div>`
      : ""

  const addressBlock = hasIdCard
    ? ""
    : `<div><span class="label">Nơi thường trú/nơi tạm trú/nơi ở hiện tại:</span> ${escapeHtml(patientAddress)}</div>`

  const guardianBlock =
    isChildUnder72 || String(byt.guardianName || "").trim()
      ? `<div>- Họ và tên người đưa trẻ đến khám, chữa bệnh (chỉ ghi đối với trẻ dưới 72 tháng tuổi): ${escapeHtml(String(byt.guardianName || ""))}</div>`
      : ""

  const bodyHtml = `
    <div class="pdf-doc-root" style="position:relative;min-height:100%">
    <div><b>Mã đơn thuốc</b>: ${escapeHtml(prescriptionCode || ".....-.")}</div>
    <div class="section-gap"><span class="label">Tên đơn vị:</span> ${dottedLine(facilityName, 50)}</div>
    <div><span class="label">Địa chỉ:</span> ${dottedLine(facilityAddress, 55)}</div>
    <div><span class="label">Điện thoại:</span> ${escapeHtml(String(byt.facilityPhone || DEFAULT_FACILITY_PHONE))}</div>
    <h1>ĐƠN THUỐC</h1>
    <div class="meta">
      <div><span class="label">Họ tên:</span> ${escapeHtml(fullName)}</div>
      ${patientIdentityBlock}
      ${weightBlock}
      <div><span class="label">Mã số bảo hiểm y tế (nếu có):</span> ${escapeHtml(String(byt.insuranceId || patient.healthInsuranceId || ""))}</div>
      ${addressBlock}
      <div><span class="label">Chẩn đoán:</span> ${escapeHtml(diagnosisLine)}</div>
      <div><span class="label">Thuốc điều trị:</span></div>
    </div>
    <table class="rx">
      <thead>
        <tr>
          <th style="width:32px">STT</th>
          <th>Tên thuốc, số lượng, đơn vị, số ngày dùng, cách dùng</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">
      <div class="advice">
        <div class="label" style="margin-bottom:6px">Lời dặn:</div>
        <div>${adviceLines}</div>
        <div style="margin-top:18px">- Khám bệnh lại xin mang theo đơn này.</div>
        <div>- Số điện thoại liên hệ: ${escapeHtml(String(byt.contactPhone || byt.patientPhone || ""))}</div>
        ${guardianBlock}
      </div>
      <div class="sig">
        <div style="font-weight:600">${escapeHtml(signatureDateLine)}</div>
        <div style="font-weight:600">Bác sỹ/Y sỹ khám bệnh</div>
        <div style="font-style:italic">(Ký, ghi rõ họ tên)</div>
        <div class="sig-box" aria-hidden="true"></div>
        <div>${signatureDoctorLine}</div>
      </div>
    </div>
    ${unsignedWatermark}
    </div>`

  const fullDoc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><style>${css}</style></head><body>${bodyHtml}</body></html>`

  const iframe = document.createElement("iframe")
  iframe.setAttribute("title", "prescription-pdf-export")
  iframe.setAttribute("aria-hidden", "true")
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    height: "1400px",
    border: "none",
    visibility: "hidden",
  })
  document.body.appendChild(iframe)

  const idoc = iframe.contentDocument
  if (!idoc) {
    document.body.removeChild(iframe)
    throw new Error("Cannot create export document")
  }

  idoc.open()
  idoc.write(fullDoc)
  idoc.close()

  const body = idoc.body
  if (sigUrlRaw.length > 0) {
    const sigBox = body.querySelector(".sig-box")
    if (sigBox) {
      const img = idoc.createElement("img")
      img.alt = ""
      img.style.maxWidth = "100%"
      img.style.maxHeight = "64px"
      img.style.objectFit = "contain"
      img.style.display = "block"
      img.src = sigUrlRaw
      sigBox.appendChild(img)
    }
  }

  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  await new Promise<void>((r) => setTimeout(r, 120))
  const imgs = Array.from(body.querySelectorAll("img"))
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              const done = () => resolve()
              img.addEventListener("load", done, { once: true })
              img.addEventListener("error", done, { once: true })
              setTimeout(done, 8000)
            })
    )
  )

  const defaultName = `prescription-${slugFilenamePart(fullName)}.pdf`
  const filename = opts.filename || defaultName

  try {
    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: body.scrollWidth,
      windowHeight: body.scrollHeight,
      imageTimeout: 15000,
      foreignObjectRendering: false,
      onclone: (clonedDoc) => {
        const b = clonedDoc.body
        b.style.setProperty("background-color", "#ffffff", "important")
        b.style.setProperty("color", "#111111", "important")
      },
    })
    const pdf = canvasToPdfDocument(canvas)
    const blob = pdf.output("blob")
    return { blob, filename }
  } finally {
    document.body.removeChild(iframe)
  }
}

/** Download PDF immediately (no preview dialog). */
export async function downloadPrescriptionPdf(
  opts: Parameters<typeof generatePrescriptionPdfBlob>[0]
): Promise<void> {
  const { blob: raw, filename } = await generatePrescriptionPdfBlob(opts)
  const blob = await stampPdfWithExportFooter(raw, new Date())
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.rel = "noopener"
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Default BYT prescription facility / patient address */
export const BYT_DEFAULT_PATIENT_ADDRESS =
  "268 Lý Thường Kiệt, phường Diên Hồng, Hồ Chí Minh"

export const BYT_DEFAULT_FACILITY_PHONE = "1900 1800"

export type BytAutoFields = {
  facilityPhone: string
  contactPhone: string
  guardianName: string
  patientAddress: string
  insuranceId: string
  advice: string
  patientWeightKg: string
}

export type BytPatientContext = {
  dateOfBirth?: string | null
  phone?: string | null
  healthInsuranceId?: string | null
  weightKg?: string | number | null
  relative?: {
    name?: string | null
    phone?: string | null
  } | null
}

export function isPatientUnder72Months(dateOfBirth?: string | null): boolean {
  if (!dateOfBirth) return false
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return false
  const ageMonths = Math.max(
    0,
    (new Date().getFullYear() - dob.getFullYear()) * 12 +
      (new Date().getMonth() - dob.getMonth())
  )
  return ageMonths < 72
}

export function buildAutoBytFields(ctx: BytPatientContext): BytAutoFields {
  const relativePhone = String(ctx.relative?.phone ?? "").trim()
  const patientPhone = String(ctx.phone ?? "").trim()
  const relativeName = String(ctx.relative?.name ?? "").trim()
  const child = isPatientUnder72Months(ctx.dateOfBirth)

  return {
    facilityPhone: BYT_DEFAULT_FACILITY_PHONE,
    contactPhone: relativePhone || patientPhone,
    guardianName: child && relativeName ? relativeName : "",
    patientAddress: BYT_DEFAULT_PATIENT_ADDRESS,
    insuranceId: String(ctx.healthInsuranceId ?? "").trim(),
    advice: "",
    patientWeightKg:
      ctx.weightKg != null && String(ctx.weightKg).trim() !== ""
        ? String(ctx.weightKg).trim()
        : "",
  }
}
