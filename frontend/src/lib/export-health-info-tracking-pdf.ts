import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"

export type HealthInfoTrackingRow = {
  updatedAt: Date
  bloodPressure: string
  pulse: number
  temperature: number
  weight: number
  respiratoryRate: number
  spo2: number
  symptoms: string
}

export type HealthInfoTrackingPdfResult = { blob: Blob; filename: string }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function slugFilenamePart(s: string): string {
  return s.replace(/[^\w\u00C0-\u024f]+/gi, "-").replace(/^-|-$/g, "") || "patient"
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

function fmtDate(d: Date): string {
  return d.toLocaleDateString("vi-VN")
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
}

export async function generateHealthInfoTrackingPdfBlob(opts: {
  patientName: string
  age: string
  gender: string
  diagnosis: string
  rows: HealthInfoTrackingRow[]
  filename?: string
}): Promise<HealthInfoTrackingPdfResult> {
  const points = [...opts.rows].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()).slice(-14)

  const cell = (v?: string | number | null) => `<td class="v">${v ? escapeHtml(String(v)) : ""}</td>`
  const valueCells = (getter: (r: HealthInfoTrackingRow) => string | number) =>
    Array.from({ length: 14 }, (_, i) => cell(points[i] ? getter(points[i]) : "")).join("")

  const dateCells = Array.from({ length: 14 }, (_, i) => 
    `<td class="v" style="font-size: 8px;">${points[i] ? fmtDate(points[i].updatedAt) : ""}</td>`
  ).join("")

  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="utf-8"/>
    <style>
      body { font-family: "Times New Roman", Times, serif; color:#000; margin:0; padding:0; font-size:13px; background:#fff; }
      .sheet { width: 195mm; margin: 0 auto; padding: 10mm 5mm; box-sizing: border-box; }
      
      /* Fix tiêu đề trên 1 hàng */
      .head { display:flex; justify-content:space-between; align-items: flex-start; margin-bottom:15px; }
      .head .left { width: 30%; line-height: 1.5; }
      .head .title { flex: 1; text-align: center; font-weight: 700; font-size: 16px; white-space: nowrap; padding: 0 10px; margin-top: 10px; }
      .head .right { width: 25%; text-align: left; font-size: 12px; }
      
      /* Cấu trúc dòng thông tin: Có dữ liệu thì ẩn chấm */
      .info-line { margin-bottom: 8px; display: flex; align-items: baseline; }
      .label { white-space: nowrap; margin-right: 4px; }
      .content { 
        border-bottom: 1px dotted #000; 
        flex-grow: 1; 
        min-height: 1.2em; 
        padding: 0 5px;
        font-weight: bold;
      }
      .no-dots { border-bottom: none !important; } /* Dùng khi muốn bỏ hẳn gạch chân */

      .grid { width:100%; border-collapse:collapse; table-layout:fixed; }
      .grid td { border:1px solid #000; text-align:center; vertical-align:middle; height: 24px; padding: 2px; word-break: break-all; overflow: hidden; }
      
      .label-col { width: 80px; text-align: left !important; padding-left: 5px !important; font-size: 12px; }
      .unit-col { width: 55px; text-align: left !important; padding-left: 5px !important; font-size: 12px; }
      
      .graph-container { position: relative; padding: 0 !important; }
      .inner-graph { width: 100%; border-collapse: collapse; height: 100%; border: none; }
      .inner-graph td { border: 0.1pt solid #bbb; height: 12px; }
      .inner-graph td:not(:last-child) { border-right: 1px solid #000; }

      .v { font-size: 10px; line-height: 1.1; }
      .note { margin-top:15px; font-size:11px; font-style: italic; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="head">
        <div class="left">
          Sở Y tế: ...........................<br/>
          BV: ................................<br/>
          Khoa: .............................
        </div>
        <div class="title">PHIẾU THEO DÕI CHỨC NĂNG SỐNG</div>
        <div class="right">
          MS: 10/BV-01<br/>
          Số vào viện: .........
        </div>
      </div>

      <div style="display: flex; gap: 20px;">
        <div class="info-line" style="flex: 2;">
          <span class="label">- Họ tên người bệnh:</span>
          <span class="content">${opts.patientName || ""}</span>
        </div>
        <div class="info-line" style="flex: 0.5;">
          <span class="label">Tuổi:</span>
          <span class="content">${opts.age || ""}</span>
        </div>
        <div class="info-line" style="flex: 0.5;">
          <span class="label">Giới:</span>
          <span class="content">${opts.gender || ""}</span>
        </div>
      </div>

      <div style="display: flex; gap: 20px;">
        <div class="info-line" style="flex: 1;">
          <span class="label">- Số giường:</span>
          <span class="content"></span>
        </div>
        <div class="info-line" style="flex: 1;">
          <span class="label">Buồng:</span>
          <span class="content"></span>
        </div>
      </div>

      <div class="info-line">
        <span class="label">- Chẩn đoán:</span>
        <span class="content">${opts.diagnosis || ""}</span>
      </div>

      <table class="grid">
        <tr>
          <td class="label-col">Ngày, tháng</td><td class="unit-col"></td>
          ${dateCells}
        </tr>
        <tr>
          <td class="label-col">Mạch (l/ph)</td>
          <td class="unit-col">Nhiệt độ (&deg;C)</td>
          ${Array.from({ length: 14 }, (_, i) => `
            <td class="v">
              <div style="color: red; font-weight: bold;">${points[i] ? points[i].pulse : ""}</div>
              <div style="border-top: 1px solid #ccc; color: blue;">${points[i] ? points[i].temperature : ""}</div>
            </td>
          `).join("")}
        </tr>
        
        ${[160, 140, 120, 100, 80, 60, 40].map((val, idx) => {
          const temp = 41 - idx;
          return `
            <tr>
              <td class="label-col">${val}</td>
              <td class="unit-col" style="${temp === 37 ? 'font-weight:bold' : ''}">${temp}</td>
              ${idx === 0 ? `<td colspan="14" rowspan="7" class="graph-container">
                  <table class="inner-graph">
                    ${Array.from({length: 35}, (_, lineIdx) => `
                      <tr style="${lineIdx === 20 ? 'border-bottom: 2px solid #000' : ''}">
                        ${Array.from({length: 14}, () => `<td></td>`).join("")}
                      </tr>
                    `).join("")}
                  </table>
              </td>` : ''}
            </tr>
          `;
        }).join("")}

        <tr><td class="label-col">1. Huyết áp</td><td class="unit-col">(mmHg)</td>${valueCells(r => r.bloodPressure)}</tr>
        <tr><td class="label-col">2. Cân nặng</td><td class="unit-col">(kg)</td>${valueCells(r => r.weight)}</tr>
        <tr><td class="label-col">3. Nhịp thở</td><td class="unit-col">(l/phút)</td>${valueCells(r => r.respiratoryRate)}</tr>
        <tr><td class="label-col">4.</td><td class="unit-col"></td>${Array.from({length:14}, () => `<td></td>`).join("")}</tr>
        <tr><td class="label-col">5.</td><td class="unit-col"></td>${Array.from({length:14}, () => `<td></td>`).join("")}</tr>
        <tr><td class="label-col">Y tá - ĐD</td><td class="unit-col"></td>${Array.from({length:14}, () => `<td></td>`).join("")}</tr>
        <tr><td class="label-col" style="height:40px">Ký tên</td><td class="unit-col"></td>${Array.from({length:14}, () => `<td></td>`).join("")}</tr>
      </table>

      <div class="note">
        Ghi chú: ô số 1, 2, 3, 4, 5 để ghi các chỉ số theo dõi chỉ định của bác sỹ<br/>
        Hướng dẫn: - In khổ A4 dọc, 2 mặt như nhau, dòng kẻ dưới 37&deg;C in đậm.<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Nhiệt độ: màu xanh, Mạch: màu đỏ; phiếu này được cài ở bảng đầu giường.
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
    const filename = opts.filename || `phieu-theo-doi-${slugFilenamePart(opts.patientName || "benh-nhan")}.pdf`
    return { blob, filename }
  } finally {
    document.body.removeChild(iframe)
  }
}

