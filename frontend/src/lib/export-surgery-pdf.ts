import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"

export type SurgeryPdfResult = { blob: Blob; filename: string }

type ExportSurgeryPdfInput = {
  patientLabel: string
  patientAge: number | null
  patientGender: string | null
  healthInsuranceId: string | null
  latestDiagnosisText: string
  surgeon: string
  type: string
  urgency: string
  start: string
  end: string
  result: string
  note: string
  /** optional; default: export-surgery-<patient>.pdf */
  filename?: string
}

const MARGIN_MM = { top: 10, left: 10, bottom: 12, right: 10 }

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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function slugFilenamePart(s: string) {
  return s.replace(/[^\w\u00C0-\u024f]+/gi, "-").replace(/^-|-$/g, "") || "patient"
}

function fmtWhen(iso: string) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString("vi-VN")
  } catch {
    return iso
  }
}

export async function generateSurgeryPdfBlob(opts: ExportSurgeryPdfInput): Promise<SurgeryPdfResult> {
  const {
    patientLabel,
    patientAge,
    patientGender,
    healthInsuranceId,
    latestDiagnosisText,
    surgeon,
    type,
    urgency,
    start,
    end,
    result,
    note,
    filename: filenameOpt,
  } = opts

  const safePatient = escapeHtml(patientLabel || "—")
  const safeAge = escapeHtml(patientAge == null ? "—" : String(patientAge))
  const safeGender = escapeHtml(
    patientGender === "M" ? "Nam" : patientGender === "F" ? "Nữ" : patientGender ? patientGender : "—"
  )
  const safeInsuranceId = escapeHtml(healthInsuranceId || "—")
  const safeSurgeon = escapeHtml(surgeon || "—")
  const safeType = escapeHtml(type || "—")
  const safeUrgency = escapeHtml(urgency || "—")
  const safeStart = escapeHtml(fmtWhen(start))
  const safeEnd = escapeHtml(fmtWhen(end))
  const safeResult = escapeHtml(result || "—")
  const safeNote = escapeHtml(note || "")
  const safeLatestDiagnosis = escapeHtml(latestDiagnosisText || "—")

  // Mẫu giấy xác nhận phẫu thuật tiếng Việt, hiển thị toàn bộ trường đang có trên UI.
  const bodyHtml = `
    <div style="font-family:'Times New Roman',Times,'DejaVu Serif',serif; color:#111; background:#fff; padding: 14px 18px 28px; box-sizing:border-box;">
      <div style="text-align:center; margin-bottom: 10px;">
        <div style="font-size:18px; font-weight:900; letter-spacing:0.4px; text-transform:uppercase;">Giấy xác nhận phẫu thuật</div>
        <div style="font-size:12px; color:#444; margin-top:4px;">MS: 14/BV-01</div>
      </div>

      <div style="margin-top: 6px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 12px;">
          <div style="font-size:13px; flex: 1;">
            <span style="font-weight:700;">Bệnh nhân:</span> ${safePatient}
            <span style="margin-left:12px; display:inline-block; min-width: 120px;">
              <span style="font-weight:700;">Tuổi:</span> ${safeAge}
            </span>
            <span style="display:inline-block; min-width: 120px;">
              <span style="font-weight:700;">Giới tính:</span> ${safeGender}
            </span>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; margin-top: 6px; gap: 12px;">
          <div style="font-size:13px;">
            <span style="font-weight:700;">Số BHYT:</span> ${safeInsuranceId}
          </div>
          <div style="font-size:13px;">
            <span style="font-weight:700;">Chẩn đoán gần nhất:</span> ${safeLatestDiagnosis}
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; column-gap: 26px; row-gap: 10px; margin-top: 12px;">
        <div style="font-size:13px;">
          <span style="font-weight:700;">Bác sĩ phẫu thuật:</span> ${safeSurgeon}
        </div>
        <div style="font-size:13px;">
          <span style="font-weight:700;">Loại phẫu thuật:</span> ${safeType}
        </div>
        <div style="font-size:13px;">
          <span style="font-weight:700;">Mức độ khẩn cấp:</span> ${safeUrgency}
        </div>
        <div style="font-size:13px;">
          <span style="font-weight:700;">Bắt đầu:</span> ${safeStart}
        </div>
        <div style="font-size:13px; grid-column: 1 / -1;">
          <span style="font-weight:700;">Kết thúc:</span> ${safeEnd}
        </div>
      </div>

      <div style="margin-top: 14px; border:1px solid #111;">
        <div style="text-align:center; font-weight:900; font-size:16px; padding: 8px 0; border-bottom: 1px solid #111;">
          Tóm tắt ca phẫu thuật
        </div>
        <div style="padding: 12px 14px;">
          <div style="font-size:13px; margin-bottom: 8px;">
            <span style="font-weight:700;">Kết quả (mô tả ngắn):</span> ${safeResult}
          </div>
          <div style="font-size:13px; margin-bottom: 6px;">
            <span style="font-weight:700;">Ghi chú của bác sĩ:</span>
          </div>
          <div style="font-size:13px; white-space:pre-wrap; min-height: 140px; border: 1px dashed #666; padding: 10px;">
            ${safeNote ? safeNote : "—"}
          </div>
        </div>
      </div>

      <div style="margin-top: 18px; display:flex; justify-content:flex-end;">
        <div style="width: 52%;">
          <div style="font-size:13px; font-weight:700; margin-bottom: 8px;">Chữ ký bác sĩ phẫu thuật</div>
          <div style="border-bottom:1px solid #111; height: 28px;"></div>
          <div style="font-size:12px; color:#444; margin-top: 6px; text-align:right;">${safeSurgeon}</div>
        </div>
      </div>
    </div>
  `

  const fullDoc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/></head><body>${bodyHtml}</body></html>`

  const iframe = document.createElement("iframe")
  iframe.setAttribute("title", "surgery-pdf-export")
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

  try {
    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: (body as HTMLElement).scrollWidth,
      windowHeight: (body as HTMLElement).scrollHeight,
      foreignObjectRendering: false,
    })

    const pdf = canvasToPdfDocument(canvas)
    const blob = pdf.output("blob")
    const defaultName = `export-surgery-${slugFilenamePart(patientLabel || "patient")}.pdf`
    const filename = filenameOpt || defaultName
    return { blob, filename }
  } finally {
    document.body.removeChild(iframe)
  }
}

