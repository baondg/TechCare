import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"

export type TreatmentFollowupPdfResult = { blob: Blob; filename: string }

export type TreatmentFollowupPdfInputs = {
  patientName: string
  age: string
  gender: "M" | "F" | string | null | undefined
  department: string
  diagnosisIcd10: string
  diagnosisInterpretation: string
  complaintSymptoms: string
  doctorName: string
  note: string
  /**
   * Optional: date label to put into the first "Thời gian" row.
   * e.g. "16:01:29 23/3/2026" or any plain text.
   */
  dateLabel?: string
  filename?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function slugFilenamePart(s: string): string {
  return s
    .replace(/[^\w\u00C0-\u024f]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "patient"
}

const MARGIN_MM = { top: 8, left: 8, bottom: 10, right: 8 }

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

export async function generateTreatmentFollowupPdfBlob(opts: TreatmentFollowupPdfInputs): Promise<TreatmentFollowupPdfResult> {
  const patientName = String(opts.patientName || "")
  const age = String(opts.age || "")
  const department = String(opts.department || "")
  const icd10 = String(opts.diagnosisIcd10 || "")
  const diagnosisInterpretation = String(opts.diagnosisInterpretation || "")
  const complaintSymptoms = String(opts.complaintSymptoms || "")
  const doctorName = String(opts.doctorName || "")
  const note = String(opts.note || "")
  const dateLabel = String(opts.dateLabel || "")

  const g = String(opts.gender || "").toUpperCase()
  const isMale = g === "M"
  const isFemale = g === "F"

  const diagnosisLine = [icd10, diagnosisInterpretation].filter(Boolean).join(" — ")

  // 12 empty rows like the original template; we fill row 1 only when data exists.
  const rowCount = 12
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const t = i === 0 ? dateLabel : ""
    const dienBien = i === 0 ? complaintSymptoms : ""
    const chiDinh = i === 0 ? note : ""
    return `
      <tr>
        <td class="w-time">${escapeHtml(t)}</td>
        <td class="w-behavior">${escapeHtml(dienBien)}</td>
        <td class="w-order">${escapeHtml(chiDinh)}</td>
      </tr>
    `
  }).join("")

  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="utf-8"/>
    <style>
      body {
        font-family: "Times New Roman", Times, "DejaVu Serif", serif;
        color: #000;
        margin: 0;
        padding: 0;
        background: #fff;
      }
      .sheet {
        width: 190mm;
        margin: 0 auto;
        padding: 8mm 2mm 6mm;
        box-sizing: border-box;
      }
      .title {
        text-align: center;
        font-weight: 700;
        font-size: 18px;
        letter-spacing: 0.2px;
        margin-bottom: 6px;
      }
      .subline {
        font-size: 12px;
        margin-bottom: 6px;
      }
      .top-grid {
        width: 100%;
        display: grid;
        grid-template-columns: 1.2fr 0.7fr 1fr;
        gap: 6px;
        font-size: 12px;
      }
      .kv {
        border-bottom: 1px dotted #444;
        min-height: 16px;
      }
      .patient-row {
        margin-top: 10px;
        display: grid;
        grid-template-columns: 1.35fr 0.45fr 1fr;
        gap: 10px;
        font-size: 12px;
        align-items: center;
      }
      .field-line { min-height: 18px; }
      .age { text-align: left; white-space: nowrap; }
      .gender {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: flex-start;
      }
      .check {
        display: inline-flex;
        gap: 6px;
        align-items: center;
      }
      .box {
        width: 14px;
        height: 14px;
        border: 1px solid #000;
        display: inline-block;
      }
      .box.checked::after{
        content:"";
        display:block;
        width: 8px;
        height: 8px;
        background:#000;
        margin: 2px;
      }
      .diag-row {
        margin-top: 10px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        font-size: 12px;
      }
      .diag-row .full { grid-column: 1 / span 2; }
      .diag-box {
        border-bottom: 1px dotted #444;
        min-height: 18px;
        padding-bottom: 1px;
      }
      table.table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
        table-layout: fixed;
      }
      table.table th, table.table td {
        border: 1px solid #000;
        vertical-align: top;
        font-size: 12px;
        padding: 4px 6px;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      table.table th {
        text-align: center;
        font-weight: 700;
        padding: 6px 6px;
      }
      td.w-time { width: 22%; }
      td.w-behavior { width: 46%; }
      td.w-order { width: 32%; }
      .stamp {
        margin-top: 10px;
        display: flex;
        justify-content: flex-end;
        font-size: 12px;
      }
      .doctor-line {
        min-width: 160px;
        text-align: right;
      }
      /* prevent overlap when html2canvas scales */
      .small { font-size: 11px; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="title">PHIẾU THEO DÕI ĐIỀU TRỊ</div>
      <div class="top-grid subline">
        <div class="field-line">Cơ sở KB, CB.......................... <span class="kv"></span></div>
        <div class="field-line">Tổ số: <span class="kv"></span></div>
        <div class="field-line">MS: <span class="kv"></span> &nbsp;&nbsp; Số vào viện: <span class="kv"></span></div>
      </div>

      <div class="patient-row">
        <div class="field-line">
          <b>Họ và tên người bệnh:</b> ..............................................................
          <span style="margin-left:6px; font-weight:600">${escapeHtml(patientName)}</span>
        </div>
        <div class="age field-line">
          <b>Tuổi:</b> <span>${escapeHtml(age)}</span>
        </div>
        <div class="gender">
          <span class="check"><span class="box ${isMale ? "checked" : ""}"></span>Nam</span>
          <span class="check"><span class="box ${isFemale ? "checked" : ""}"></span>Nữ</span>
        </div>
      </div>

      <div class="diag-row">
        <div class="field-line">
          <b>Khoa:</b> <span class="diag-box">${escapeHtml(department)}</span>
        </div>
        <div class="field-line">
          <b>Phòng:</b> <span class="diag-box"></span>
        </div>
        <div class="full field-line">
          <b>Chẩn đoán:</b> <span class="diag-box">${escapeHtml(diagnosisLine)}</span>
        </div>
        <div class="full field-line">
          <b>Chẩn đoán phân biệt:</b> <span class="diag-box"></span>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th class="w-time">Thời gian</th>
            <th class="w-behavior">Diễn biến bệnh</th>
            <th class="w-order">Chỉ định</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="stamp">
        <div class="doctor-line">
          Ngày ... tháng ... năm ...<br/>
          Bác sĩ: ${escapeHtml(doctorName)}
        </div>
      </div>
    </div>
  </body>
  </html>`

  const iframe = document.createElement("iframe")
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
  idoc.write(html)
  idoc.close()

  try {
    const body = idoc.body
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: body.scrollWidth,
      windowHeight: body.scrollHeight,
      foreignObjectRendering: false,
    })
    const pdf = canvasToPdfDocument(canvas)
    const blob = pdf.output("blob")

    const filename = opts.filename || `phieu-theo-doi-dieu-tri-${slugFilenamePart(patientName)}.pdf`
    return { blob, filename }
  } finally {
    document.body.removeChild(iframe)
  }
}

