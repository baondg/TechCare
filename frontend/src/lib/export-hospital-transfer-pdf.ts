import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"
import {
  buildHospitalTransferSlipHtmlDocument,
  type HospitalTransferSlipInputs,
} from "./hospital-transfer-slip-html"

export type HospitalTransferPdfResult = { blob: Blob; filename: string }

export type HospitalTransferPdfInputs = HospitalTransferSlipInputs & {
  filename?: string
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

/**
 * Phiếu thông tin chuyển cơ sở (bản tóm tắt điện tử — hiển thị / in cho bệnh nhân).
 * Không thay thế mẫu giấy BHYT đầy đủ; dùng dữ liệu EMR + form_payload.
 */
export async function generateHospitalTransferPdfBlob(opts: HospitalTransferPdfInputs): Promise<HospitalTransferPdfResult> {
  const { filename: _fn, ...slip } = opts
  const html = buildHospitalTransferSlipHtmlDocument(slip)

  const iframe = document.createElement("iframe")
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    height: "1600px",
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
    const filename = opts.filename || `phieu-chuyen-vien-${slugFilenamePart(opts.patientName)}.pdf`
    return { blob, filename }
  } finally {
    document.body.removeChild(iframe)
  }
}
