import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"
import type { PatientDetail } from "@/services/doctor-service"

export interface ExportMedicationRow {
  name: string
  quantity: string
  unit: string
  /** Treatment days (PRESCRIPTION_DETAIL.duration). */
  duration?: string
  usage: string
  note?: string
}

const unitLabelsVi: Record<string, string> = {
  tablet: "viên nén",
  capsule: "viên nang",
  syrup: "chai (siro)",
  injection: "ống tiêm / lọ",
  drop: "giọt",
  cream: "tuýp kem",
  ointment: "tuýp thuốc mỡ",
  powder: "gói bột",
  spray: "chai xịt",
}

function escapeHtml(s: string): string {
  return s
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

function slugFilenamePart(s: string): string {
  return s.replace(/[^\w\u00C0-\u024f]+/gi, "-").replace(/^-|-$/g, "") || "patient"
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
  prescriptionDate: string
  doctorName: string
  filename?: string
  /** Red diagonal watermark on PDF when voided */
  signatureStatus?: ExportPrescriptionSignatureStatus
  /** Base64 data URL of the doctor's signature image */
  signatureDataUrl?: string | null
}): Promise<PrescriptionPdfResult> {
  const { patient, medications, prescriptionDate, doctorName } = opts
  const fullName = `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.username
  const bmi = patient.bmi != null ? String(patient.bmi) : "—"
  const age = patient.age != null ? String(patient.age) : "—"
  const diagnosisLine = patient.latestDiagnosis
    ? `${patient.latestDiagnosis.icd10 || "—"} — ${patient.latestDiagnosis.interpretation || "—"}`
    : "—"

  const adviceLines = medications
    .map((m) => {
      const n = (m.note || "").trim()
      if (!n) return ""
      return `${escapeHtml(m.name.trim())}: ${escapeHtml(n)}`
    })
    .filter(Boolean)
    .join("<br/>")

  const rows = medications
    .map((m, i) => {
      const unitLabel = unitLabelsVi[m.unit] ?? m.unit
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
    h1 { text-align: center; font-size: 18px; letter-spacing: 3px; margin: 0 0 4px; color: #111111; }
    .sub { text-align: center; font-size: 11px; color: #444444; margin-bottom: 14px; }
    .meta div { margin: 4px 0; color: #111111; }
    .label { font-weight: 700; }
    .pdf-doc-root { position: relative; min-height: 100%; }
    table.rx { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 14px; }
    th { background: #e0e0e0; border: 1px solid #222222; padding: 8px; text-align: left; font-size: 11px; color: #111111; }
    .footer { margin-top: 18px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
    .advice { flex: 1; min-width: 0; color: #111111; }
    .sig { flex: 0 0 38%; text-align: right; color: #111111; }
    .sig-box { border: 1px dashed #888888; min-height: 72px; margin: 10px 0 8px; margin-left: auto; max-width: 200px; background: #ffffff; }
  `

  const unsignedWatermark =
    opts.signatureStatus === "voided"
      ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5;overflow:hidden">
          <span style="transform:rotate(-18deg);font-size:56px;font-weight:900;color:rgba(220,38,38,0.2);letter-spacing:0.2em;white-space:nowrap;font-family:'Times New Roman',Times,'DejaVu Serif',serif">ĐÃ HỦY KÝ SỐ</span>
        </div>`
      : ""

  /** Draft: empty under signature box; Signed & Voided: show doctor name */
  const showSignatureBlockName = opts.signatureStatus !== "draft"
  const signatureDoctorLine = showSignatureBlockName ? escapeHtml(doctorName) : ""

  const bodyHtml = `
    <div class="pdf-doc-root" style="position:relative;min-height:100%">
    <h1>ĐƠN THUỐC</h1>
    <div class="sub">TechCare</div>
    <div class="meta">
      <div><span class="label">Họ và tên:</span> ${escapeHtml(fullName)}</div>
      <div>
        <span class="label">Tuổi:</span> ${escapeHtml(age)}
        &nbsp;|&nbsp; <span class="label">Giới tính:</span> ${escapeHtml(genderVi(patient.gender))}
        &nbsp;|&nbsp; <span class="label">BMI:</span> ${escapeHtml(bmi)}
      </div>
      <div><span class="label">Chẩn đoán:</span> ${escapeHtml(diagnosisLine)}</div>
      <div>
        <span class="label">Ngày kê đơn:</span> ${escapeHtml(prescriptionDate)}
        &nbsp;|&nbsp; <span class="label">Bác sĩ:</span> ${escapeHtml(doctorName)}
      </div>
    </div>
    <table class="rx">
      <thead>
        <tr>
          <th style="width:32px">No.</th>
          <th>Thuốc (dòng 1: tên, số lượng, đơn vị - dòng 2: cách dùng)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">
      <div class="advice">
        <div class="label" style="text-decoration:underline;margin-bottom:6px">Lời dặn / ghi chú</div>
        <div>${adviceLines}</div>
      </div>
      <div class="sig">
        <div style="font-weight:600">Bác sĩ</div>
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
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  await new Promise<void>((r) => setTimeout(r, 80))

  const defaultName = `prescription-${slugFilenamePart(fullName)}.pdf`
  const filename = opts.filename || defaultName

  try {
    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: body.scrollWidth,
      windowHeight: body.scrollHeight,
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
  const { blob, filename } = await generatePrescriptionPdfBlob(opts)
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
