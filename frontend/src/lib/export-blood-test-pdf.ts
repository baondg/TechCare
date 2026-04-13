import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"
import type { LabTestDetail } from "@/services/doctor-service"
import {
  evaluateLabMetric,
  normalizeLabMetricKey,
  parseLabNumericValue,
  resolveLabMetricKey,
} from "@/lib/lab-metric-eval"

export type BloodTestPdfResult = { blob: Blob; filename: string }

export type BloodTestPdfInput = {
  patientName: string
  age: string
  gender: string | null | undefined
  department: string
  diagnosis: string
  testDateLabel: string
  details: LabTestDetail[]
  filename?: string
  /** Hiển thị dưới dòng ngày tháng, trên dòng chức danh ký */
  signingTimeDisplay?: string
}

type MetricDef = {
  label: string
  keys: string[]
  refMale?: string
  refFemale?: string
  refCommon?: string
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function slugFilenamePart(s: string): string {
  return s
    .replace(/[^\w\u00C0-\u024f]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "patient"
}

function parseRefRange(raw: string): { min?: number; max?: number } | null {
  const s = String(raw || "").toLowerCase().replace(",", ".")
  const mBetween = s.match(/(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)/)
  if (mBetween) return { min: Number(mBetween[1]), max: Number(mBetween[3]) }
  const mLe = s.match(/<=?\s*(\d+(\.\d+)?)/) || s.match(/≤\s*(\d+(\.\d+)?)/)
  if (mLe) return { max: Number(mLe[1]) }
  const mGe = s.match(/>=?\s*(\d+(\.\d+)?)/) || s.match(/≥\s*(\d+(\.\d+)?)/)
  if (mGe) return { min: Number(mGe[1]) }
  return null
}

const LEFT: MetricDef[] = [
  { label: "Urê", keys: ["ure"], refCommon: "2.5 - 7.5 mmol/L" },
  { label: "Glucose", keys: ["glucose", "glucozo"], refCommon: "3.9 - 6.4 mmol/L" },
  { label: "Creatinin", keys: ["creatinin"], refMale: "62 - 120 umol/L", refFemale: "53 - 100 umol/L" },
  { label: "Acid Uric", keys: ["aciduric"], refMale: "180 - 420 umol/L", refFemale: "150 - 360 umol/L" },
  { label: "Bilirubin T.P", keys: ["bilirubintp"], refCommon: "≤ 17 umol/L" },
  { label: "Bilirubin T.T", keys: ["bilirubintt"], refCommon: "≤ 4.3 umol/L" },
  { label: "Bilirubin G.T", keys: ["bilirubingt"], refCommon: "≤ 12.7 umol/L" },
  { label: "Protein T.P", keys: ["proteintp"], refCommon: "65 - 82 g/L" },
  { label: "Albumin", keys: ["albumin"], refCommon: "35 - 50 g/L" },
  { label: "Globulin", keys: ["globulin"], refCommon: "24 - 38 g/L" },
  { label: "Tỷ lệ A/G", keys: ["tyleag", "ag"], refCommon: "1.3 - 1.8" },
  { label: "HDL-cho", keys: ["hdlcho"], refCommon: "≥ 0.9 mmol/L" },
  { label: "LDL-cho", keys: ["ldlcho"], refCommon: "≤ 3.4 mmol/L" },
  { label: "Na+", keys: ["na+"], refCommon: "135 - 145 mmol/L" },
  { label: "K+", keys: ["k+"], refCommon: "3.5 - 5.0 mmol/L" },
  { label: "Cl-", keys: ["cl"], refCommon: "98 - 106 mmol/L" },
  { label: "Calci", keys: ["calci"], refCommon: "2.15 - 2.6 mmol/L" },
  { label: "Calci ion hoá", keys: ["calciionhoa"], refCommon: "1.17 - 1.29 mmol/L" },
]

const RIGHT: MetricDef[] = [
  { label: "Sắt", keys: ["sat"], refMale: "11 - 27 umol/L", refFemale: "7 - 26 umol/L" },
  { label: "Magiê", keys: ["magie"], refCommon: "0.8 - 1.00 mmol/L" },
  { label: "AST (GOT)", keys: ["astgot", "ast"], refCommon: "≤ 37 U/L" },
  { label: "ALT (GPT)", keys: ["altgpt", "alt"], refCommon: "≤ 40 U/L" },
  { label: "Amylase", keys: ["amylase"], refCommon: "" },
  { label: "CK", keys: ["ck"], refMale: "24 - 190 U/L", refFemale: "24 - 167 U/L" },
  { label: "CK-MB", keys: ["ckmb"], refCommon: "≤ 24 U/L" },
  { label: "LDH", keys: ["ldh"], refCommon: "230 - 460 U/L" },
  { label: "GGT", keys: ["ggt"], refMale: "11 - 50 U/L", refFemale: "7 - 32 U/L" },
]

function chooseRef(def: MetricDef, gender: string) {
  const g = String(gender || "").toUpperCase()
  if (g === "M") return def.refMale || def.refCommon || ""
  if (g === "F") return def.refFemale || def.refCommon || ""
  return def.refCommon || def.refMale || def.refFemale || ""
}

/** Fallback when a row is not in the shared lab reference map (e.g. creatinin). */
function evaluateAbnormalFromRefText(value: number | null, refText: string): boolean {
  if (value === null || !refText) return false
  const r = parseRefRange(refText)
  if (!r) return false
  if (r.min !== undefined && value < r.min) return true
  if (r.max !== undefined && value > r.max) return true
  return false
}

function buildMetricCell(
  def: MetricDef,
  map: Map<string, LabTestDetail>,
  gender: string,
  genderRaw: string | null | undefined
): string {
  const detail = def.keys.map((k) => map.get(k)).find(Boolean) || null
  const ref = chooseRef(def, gender)
  const ctx = { gender: genderRaw ?? null }
  let abnormal = false
  if (detail) {
    const ev = evaluateLabMetric(detail, ctx)
    if (ev.status !== "unknown") abnormal = ev.abnormal
    else abnormal = evaluateAbnormalFromRefText(parseLabNumericValue(detail), ref)
  }
  const resultHtml = detail ? escapeHtml(detail.result || "") : ""
  const resultClass = abnormal ? "result-val result-val-abnormal" : "result-val result-val-normal"
  return `
    <td>${escapeHtml(def.label)}</td>
    <td>${escapeHtml(ref)}</td>
    <td class="${resultClass}">${resultHtml}</td>
  `
}

function canvasToPdfDocument(canvas: HTMLCanvasElement): jsPDF {
  const margin = { top: 8, left: 8, bottom: 10, right: 8 }
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const innerWidth = pageWidth - margin.left - margin.right
  const innerHeight = pageHeight - margin.top - margin.bottom
  const innerRatio = innerHeight / innerWidth
  const pxPageHeight = Math.max(1, Math.floor(canvas.width * innerRatio))
  const pages = Math.max(1, Math.ceil(canvas.height / pxPageHeight))

  const pageCanvas = document.createElement("canvas")
  const ctx = pageCanvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unsupported")
  pageCanvas.width = canvas.width

  for (let i = 0; i < pages; i++) {
    const top = i * pxPageHeight
    const h = Math.min(pxPageHeight, canvas.height - top)
    pageCanvas.height = h
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, pageCanvas.width, h)
    ctx.drawImage(canvas, 0, top, pageCanvas.width, h, 0, 0, pageCanvas.width, h)
    if (i > 0) pdf.addPage()
    const hMm = (h * innerWidth) / canvas.width
    pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", margin.left, margin.top, innerWidth, hMm)
  }
  return pdf
}

export async function generateBloodTestPdfBlob(input: BloodTestPdfInput): Promise<BloodTestPdfResult> {
  const signingFooter =
    input.signingTimeDisplay?.trim() != null && String(input.signingTimeDisplay).trim() !== ""
      ? `<div style="font-size:10px;font-style:italic;margin:4px 0 6px">${escapeHtml(String(input.signingTimeDisplay).trim())}</div>`
      : ""

  const map = new Map<string, LabTestDetail>()
  for (const d of input.details || []) {
    const k = normalizeLabMetricKey(d.itemIndex)
    const r = resolveLabMetricKey(k)
    map.set(k, d)
    if (r !== k) map.set(r, d)
  }
  const gender = String(input.gender || "").toUpperCase()

  const rows = Array.from({ length: Math.max(LEFT.length, RIGHT.length) }, (_, i) => {
    const left = LEFT[i]
    const right = RIGHT[i]
    return `<tr>
      ${left ? buildMetricCell(left, map, gender, input.gender) : "<td></td><td></td><td></td>"}
      ${right ? buildMetricCell(right, map, gender, input.gender) : "<td></td><td></td><td></td>"}
    </tr>`
  }).join("")

  const line = (minWidthPx: number, text?: string) => {
    const t = String(text ?? "").trim()
    const has = t.length > 0
    return `<span class="line${has ? " no-dots" : ""}" style="min-width:${minWidthPx}px">${has ? escapeHtml(t) : "&nbsp;"}</span>`
  }

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8" />
  <style>
    /* Reset & Base */
    body { font-family: "Times New Roman", Times, serif; margin: 0; padding: 0; color: #000; background: #fff; }
    
    /* Sheet Layout - Tối ưu cho A4 (210mm x 297mm) */
    .sheet { 
      width: 210mm; 
      min-height: 290mm; 
      margin: 0 auto; 
      padding: 15mm 10mm 10mm 15mm; 
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }

    /* Header Section */
    .topbar { display:flex; justify-content: space-between; align-items:flex-start; gap: 12px; }
    .topbar .org-left { width: 62mm; font-size: 14px; line-height: 1.4; }
    .topbar .title-wrap { flex: 1; text-align: center; }
    .topbar .meta { width: 52mm; font-size: 14px; line-height: 1.25; text-align: right; white-space: nowrap; }
    .topbar .meta b { font-size: 14px; }
    .title { font-weight: bold; font-size: 20px; text-transform: uppercase; white-space: nowrap; }
    
    /* Patient Info */
    .patient-info { font-size: 15px; line-height: 1.8; margin-bottom: 15px; }
    .line {
      display: inline-block;
      border-bottom: 1px dotted #000;
      padding: 0 5px 2px 5px;
      font-weight: normal;
      line-height: 1.1;
      min-height: 1em;
      vertical-align: baseline;
    }
    .no-dots { border-bottom: none; }
    .b { font-weight: bold; }

    /* Table Styling - Giúp bảng trông đầy trang hơn */
    .table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: auto; }
    .table th, .table td { border: 1px solid #000; padding: 6px 4px; font-size: 13px; }
    .table th { font-weight: bold; text-align: center; background: #f2f2f2; }
    .table td { vertical-align: middle; height: 22px; }
    .table td:nth-child(1), .table td:nth-child(4) { width: 25%; } /* Tên XN */
    .table td:nth-child(2), .table td:nth-child(5) { width: 15%; text-align: center; } /* Trị số BT */
    .table td:nth-child(3), .table td:nth-child(6) { width: 10%; vertical-align: middle; } /* Kết quả */

    .result-val-normal { text-align: left; font-weight: normal; color: #000; }
    .result-val-abnormal {
      text-align: center; font-weight: bold; text-decoration: underline; color: #b91c1c;
      background: #fef2f2;
    }

    /* Footer / Signature */
    .footer { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; font-size: 14px; }
    .center { text-align: center; }
    .date-placeholder { font-style: italic; margin-bottom: 5px; display: block; }
  </style></head>
  <body>
    <div class="sheet">
      <div class="topbar">
        <div class="org-left">
          Sở Y tế: ${line(140)}<br/>
          BV: ${line(140)}
        </div>
        <div class="title-wrap">
          <div class="title">PHIẾU XÉT NGHIỆM HOÁ SINH MÁU</div>
        </div>
        <div class="meta">
          <b>MS: 33/BV-01</b><br/>
          Số vào viện: ${escapeHtml("")}
        </div>
      </div>

      <div class="patient-info">
        - Họ tên người bệnh: <span class="line no-dots" style="min-width: 320px; font-weight: bold; font-size: 17px;">${escapeHtml(input.patientName.toUpperCase())}</span>
        &nbsp; Tuổi: ${line(60, input.age)}
        &nbsp; Nam/Nữ: ${line(40, gender)}<br/>
        - Địa chỉ: ${line(520)}<br/>
        - Khoa: ${line(220, input.department)}
        &nbsp; Buồng: ${line(110)}
        &nbsp; Giường: ${line(110)}<br/>
        - Chẩn đoán: ${line(560, input.diagnosis)}<br/>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Tên xét nghiệm</th><th>Trị số bình thường</th><th>Kết quả</th>
            <th>Tên xét nghiệm</th><th>Trị số bình thường</th><th>Kết quả</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="footer">
        <div class="center">
          <span class="date-placeholder">Ngày.....tháng.....năm 20...</span>
          ${signingFooter}
          <b>BÁC SĨ ĐIỀU TRỊ</b>
          <div style="margin-top: 60px;"></div>
        </div>
        <div class="center">
          <span class="date-placeholder">Ngày.....tháng.....năm 20...</span>
          ${signingFooter}
          <b>TRƯỞNG KHOA XÉT NGHIỆM</b>
          <div style="margin-top: 60px;"></div>
        </div>
      </div>
    </div>
  </body></html>`

  const iframe = document.createElement("iframe")
  Object.assign(iframe.style, {
    position: "fixed", left: "-10000px", top: "0", width: "210mm", height: "0", border: "none", visibility: "hidden",
  })
  document.body.appendChild(iframe)
  const idoc = iframe.contentDocument
  if (!idoc) throw new Error("Cannot create export document")
  idoc.open()
  idoc.write(html)
  idoc.close()

  try {
    const sheet = idoc.querySelector(".sheet") as HTMLElement | null
    if (!sheet) throw new Error("Export template missing .sheet")
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const canvas = await html2canvas(sheet, {
      scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff",
      windowWidth: sheet.scrollWidth, windowHeight: sheet.scrollHeight, foreignObjectRendering: false,
    })
    const pdf = canvasToPdfDocument(canvas)
    const blob = pdf.output("blob")
    return {
      blob,
      filename: input.filename || `phieu-xet-nghiem-${slugFilenamePart(input.patientName)}.pdf`,
    }
  } finally {
    document.body.removeChild(iframe)
  }
}

