import { PDFDocument } from "pdf-lib"

/** dd-mm-yyyy hh:mm (24h, local) */
export function formatVnDdMmYyyyHhMm(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`
}

export function buildExportFooterLine(exportAt: Date): string {
  return `Ngày xuất: ${formatVnDdMmYyyyHhMm(exportAt)}`
}

/** Shown above signer name on slips (from clinical ISO or save time). */
export function buildSigningTimeLine(signingAt: Date): string {
  return `Thời gian ký: ${formatVnDdMmYyyyHhMm(signingAt)}`
}

export function signingLineFromIso(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  return buildSigningTimeLine(d)
}

async function renderItalicFooterPng(text: string, fontPx: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unsupported")
  ctx.font = `italic ${fontPx}px "Times New Roman", Times, serif`
  const w = Math.ceil(ctx.measureText(text).width + 20)
  const h = Math.ceil(fontPx * 1.85)
  canvas.width = w
  canvas.height = h
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, h)
  ctx.font = `italic ${fontPx}px "Times New Roman", Times, serif`
  ctx.fillStyle = "#111111"
  ctx.textBaseline = "middle"
  ctx.fillText(text, 8, h / 2)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"))
  if (!blob) throw new Error("PNG export failed")
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Stamps bottom-right footer on every page (Print / Download time).
 * Uses PNG text raster so Vietnamese renders reliably in pdf-lib.
 */
export async function stampPdfWithExportFooter(pdfBlob: Blob, exportAt: Date): Promise<Blob> {
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer())
  const pdfDoc = await PDFDocument.load(bytes)
  const label = buildExportFooterLine(exportAt)
  const pngBytes = await renderItalicFooterPng(label, 9)
  const img = await pdfDoc.embedPng(pngBytes)
  const marginX = 14
  const marginY = 10
  const targetW = Math.min(200, img.width * 0.75)
  const aspect = img.height / img.width
  const targetH = targetW * aspect

  for (const page of pdfDoc.getPages()) {
    const { width } = page.getSize()
    page.drawImage(img, {
      x: width - targetW - marginX,
      y: marginY,
      width: targetW,
      height: targetH,
    })
  }

  return new Blob([(await pdfDoc.save()) as Uint8Array<ArrayBuffer>], { type: "application/pdf" })
}
