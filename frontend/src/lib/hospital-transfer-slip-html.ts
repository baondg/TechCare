/**
 * HTML cho phiếu chuyển viện — dùng chung cho preview (iframe) và export PDF.
 */

export type HospitalTransferSlipInputs = {
  patientName: string
  patientDob?: string
  patientSex?: string
  patientAddress?: string
  insuranceId?: string
  insuranceExpiry?: string
  destinationHospital: string
  destinationRefId?: string | null
  reason: string
  note?: string
  transport?: string | null
  transferAt: string
  doctorName?: string
  facilityName?: string
  icd10?: string
  diagnosis?: string
  formPayload?: Record<string, unknown> | null
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatPayloadExtra(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== "object") return ""
  const labelMap: Record<string, string> = {
    clinicalSummary: "Clinical summary",
    keyFindings: "Key findings",
    keyTestsSummary: "Key tests and results",
    treatmentsProvided: "Treatments provided",
    conditionAtTransfer: "Patient condition at transfer",
    transferObjective: "Transfer objective",
    escortInfo: "Escort / handover contact",
    portalVersion: "Portal version",
    recordedAt: "Recorded at",
    toHospitalName: "Destination (payload)",
    toHospitalId: "Destination ref (payload)",
  }
  const skip = new Set(["reason", "note", "toHospitalName", "toHospitalId", "transport", "recordedAt"])
  const entries = Object.entries(payload).filter(([k]) => !skip.has(k))
  if (!entries.length) return ""
  return entries
    .map(([k, v]) => {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v)
      const label = labelMap[k] || k
      return `<div class="line"><b>${escapeHtml(label)}:</b> ${escapeHtml(val)}</div>`
    })
    .join("")
}

const SLIP_STYLES = `
      body {
        font-family: "Times New Roman", Times, "DejaVu Serif", serif;
        color: #000;
        margin: 0;
        padding: 0;
        background: #fff;
      }
      .sheet {
        width: 190mm;
        max-width: 100%;
        margin: 0 auto;
        padding: 8mm 10mm 10mm;
        box-sizing: border-box;
      }
      .motto { text-align: center; font-size: 11px; margin-bottom: 4px; }
      .facility { font-size: 11px; margin-bottom: 12px; }
      .title {
        text-align: center;
        font-weight: 700;
        font-size: 15px;
        margin: 10px 0 14px;
        text-transform: uppercase;
      }
      .line {
        font-size: 12px;
        margin-bottom: 8px;
        line-height: 1.45;
      }
      .box {
        border: 1px solid #333;
        padding: 10px;
        margin-top: 10px;
        font-size: 11px;
        min-height: 48px;
        white-space: pre-wrap;
      }
      .muted { font-size: 10px; color: #444; margin-top: 12px; font-style: italic; }
`

/** Full HTML document (for iframe srcDoc và cho PDF pipeline). */
export function buildHospitalTransferSlipHtmlDocument(opts: HospitalTransferSlipInputs): string {
  const facility = String(opts.facilityName || "Cơ sở khám chữa bệnh")
  const dest = String(opts.destinationHospital || "")
  const reason = String(opts.reason || "")
  const note = String(opts.note || "")
  const transport = opts.transport != null ? String(opts.transport) : ""
  const doctor = String(opts.doctorName || "")
  const transferAt = String(opts.transferAt || "")
  const extraHtml = formatPayloadExtra(opts.formPayload || null)

  return `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <style>${SLIP_STYLES}</style>
  </head>
  <body>
    <div class="sheet">
      <div class="motto">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br/>Độc lập - Tự do - Hạnh phúc</div>
      <div class="facility"><b>${escapeHtml(facility)}</b></div>
      <div class="title">Thông tin chuyển cơ sở khám chữa bệnh</div>
      <div class="line"><b>Họ tên người bệnh:</b> ${escapeHtml(opts.patientName)}</div>
      <div class="line"><b>Giới tính / Ngày sinh:</b> ${escapeHtml(opts.patientSex || "—")} &nbsp;|&nbsp; ${escapeHtml(opts.patientDob || "—")}</div>
      <div class="line"><b>Địa chỉ:</b> ${escapeHtml(opts.patientAddress || "—")}</div>
      <div class="line"><b>Số thẻ BHYT:</b> ${escapeHtml(opts.insuranceId || "—")} &nbsp;&nbsp; <b>Hạn thẻ:</b> ${escapeHtml(opts.insuranceExpiry || "—")}</div>
      <div class="line"><b>Chuyển đến:</b> ${escapeHtml(dest)}${opts.destinationRefId ? ` <span style="font-size:11px">(Mã: ${escapeHtml(String(opts.destinationRefId))})</span>` : ""}</div>
      <div class="line"><b>Thời gian ghi nhận:</b> ${escapeHtml(transferAt)}</div>
      <div class="line"><b>Lý do chuyển:</b></div>
      <div class="box">${escapeHtml(reason) || "—"}</div>
      ${note ? `<div class="line"><b>Ghi chú thêm:</b></div><div class="box">${escapeHtml(note)}</div>` : ""}
      ${transport ? `<div class="line"><b>Phương tiện / hình thức:</b> ${escapeHtml(transport)}</div>` : ""}
      ${opts.icd10 || opts.diagnosis ? `<div class="line"><b>Chẩn đoán (tham chiếu đợt khám):</b> ${escapeHtml([opts.icd10, opts.diagnosis].filter(Boolean).join(" — "))}</div>` : ""}
      ${extraHtml ? `<div class="line" style="margin-top:12px"><b>Thông tin bổ sung (form_payload):</b></div><div class="box">${extraHtml}</div>` : ""}
      <div class="muted">
        Đây là bản tóm tắt điện tử từ hệ thống TechCare. Đối với thủ tục BHYT, vui lòng sử dụng phiếu chuyển tuyến theo mẫu quy định của cơ quan có thẩm quyền.
      </div>
      <div class="line" style="margin-top: 28px; text-align: right; font-size: 12px;">
        Bác sĩ / Người lập<br/><br/>
        ${escapeHtml(doctor || "…………………")}
      </div>
    </div>
  </body>
  </html>`
}
