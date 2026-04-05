import { PDFDocument } from "pdf-lib"

/** Concatenate multiple single-page or multi-page PDF blobs into one file (patient portal exports). */
export async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error("No PDFs to merge")
  if (blobs.length === 1) return blobs[0]

  const mergedPdf = await PDFDocument.create()
  for (const blob of blobs) {
    const pdf = await PDFDocument.load(await blob.arrayBuffer())
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices())
    copiedPages.forEach((page) => mergedPdf.addPage(page))
  }
  const bytes = await mergedPdf.save()
  return new Blob([bytes], { type: "application/pdf" })
}
