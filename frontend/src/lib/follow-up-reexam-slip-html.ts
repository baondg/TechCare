/**
 * PHIẾU HẸN KHÁM LẠI — HTML cho preview (iframe). Bố cục theo mẫu giấy thông dụng.
 */

export type FollowUpReexamSlipInputs = {
  patientName: string
  /** Hiển thị sau "Giới:" (vd. Nam / Nữ) */
  genderLabel: string
  /** Sinh ngày dạng DD/MM/YYYY hoặc placeholder */
  dateOfBirthDisplay: string
  address: string
  /** Mảng 4 phần số thẻ BHYT: 2 ký tự, 1 ký tự, 2 ký tự, phần còn lại */
  insuranceCardParts: string[]
  insuranceValidFromDisplay: string
  insuranceValidToDisplay: string
  examDateDisplay: string
  admissionDateDisplay: string
  dischargeDateDisplay: string
  diagnosis: string
  comorbidities: string
  revisitDay: string
  revisitMonth: string
  revisitYear: string
  /** Giờ hẹn (từ form), hiển thị dưới đoạn hẹn khám */
  appointmentTimeLabel?: string
  /** Khoa hẹn (từ form) */
  departmentLabel?: string
  footerPlaceLine: string
  footerDay: string
  footerMonth: string
  footerYear: string
  doctorDisplayName: string
  /** Hiển thị phía trên vạch ký, ví dụ từ `signingLineFromIso(createdAt)` */
  signingTimeDisplay?: string
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/** Tách số BHYT thành 4 phần: AA | B | CC | DDD... */
export function splitInsuranceCardParts(raw: string | null | undefined): string[] {
  const clean = String(raw || "")
    .replace(/\s/g, "")
    .toUpperCase()
  const p1 = clean.slice(0, 2)
  const p2 = clean.slice(2, 3)
  const p3 = clean.slice(3, 5)
  const p4 = clean.slice(5)
  return [p1, p2, p3, p4]
}

/** YYYY-MM-DD → { day, month, year } (chuỗi hiển thị, có thể pad). */
export function parseIsoDateForSlip(iso: string): { day: string; month: string; year: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim())
  if (!m) return null
  const y = m[1]
  const month = String(Number(m[2]))
  const day = String(Number(m[3]))
  return { day, month, year: y }
}

export function formatDdMmYyyy(iso: string): string {
  const p = parseIsoDateForSlip(iso)
  if (!p) return ""
  const d = p.day.padStart(2, "0")
  const mo = p.month.padStart(2, "0")
  return `${d}/${mo}/${p.year}`
}

const STYLES = `
  body { margin: 0; padding: 0; background: #fff; color: #000; font-family: "Times New Roman", Times, "DejaVu Serif", serif; }
  .sheet {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 10mm 12mm 12mm;
    box-sizing: border-box;
    font-size: 13px;
    line-height: 1.4;
  }
  .head {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10mm;
    margin-bottom: 2mm;
  }
  .head .left, .head .right { font-weight: 700; text-align: center; }
  .head .small { font-weight: 700; font-size: 12px; }
  .center { text-align: center; }
  .title {
    margin-top: 8mm;
    text-align: center;
    font-size: 35px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .line {
    display: inline-block;
    border-bottom: 1px dotted #000;
    min-height: 1em;
    vertical-align: baseline;
    padding: 0 2px 1px;
  }
  .no-dots { border-bottom: none; }
  .row { margin: 6px 0; }
  .ins-boxes { display: inline-flex; gap: 0; margin-left: 6px; vertical-align: middle; }
  .ins-box {
    min-width: 22px;
    height: 22px;
    border: 1px solid #000;
    border-right: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    box-sizing: border-box;
  }
  .ins-box:last-child { border-right: 1px solid #000; }
  .ins-box.box-1 { min-width: 36px; }
  .ins-box.box-2 { min-width: 24px; }
  .ins-box.box-3 { min-width: 30px; }
  .ins-box.box-4 { min-width: 138px; justify-content: flex-start; padding: 0 6px; }
  .para { margin-top: 6px; text-align: justify; }
  .footer {
    margin-top: 18px;
    text-align: right;
    line-height: 1.5;
  }
  .sig { font-weight: 700; }
`

export function buildFollowUpReexamSlipHtmlDocument(opts: FollowUpReexamSlipInputs): string {
  const parts = (opts.insuranceCardParts || []).slice(0, 4)
  while (parts.length < 4) parts.push("")
  const boxes = parts
    .map((part, idx) => `<span class="ins-box box-${idx + 1}">${escapeHtml(part || "\u00A0")}</span>`)
    .join("")

  const dept = (opts.departmentLabel || "").trim()

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>${STYLES}</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="left">
        CƠ QUAN CHỦ QUẢN<br/>(BYT/SYT/.....)<br/>Tên cơ sở KCB<br/><br/>
        Số<span class="line" style="min-width:80px">&nbsp;</span>
      </div>
      <div class="right">
        CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br/>Độc lập - Tự do - Hạnh phúc<br/>--------------
      </div>
    </div>

    <div class="title">PHIẾU HẸN KHÁM LẠI</div>

    <div class="row">
      Họ tên người bệnh:<span class="line no-dots" style="min-width:320px">${escapeHtml(opts.patientName)}</span>
      Giới:<span class="line no-dots" style="min-width:56px">${escapeHtml(opts.genderLabel)}</span>
    </div>
    <div class="row">
      Sinh ngày: <span class="line" style="min-width:120px">${escapeHtml(opts.dateOfBirthDisplay)}</span>
      Địa chỉ: <span class="line no-dots" style="min-width:250px">${escapeHtml(opts.address)}</span>
    </div>
    <div class="row">
      Số thẻ BHYT: <span class="ins-boxes">${boxes}</span>
    </div>
    <div class="row">
      Hạn sử dụng: Từ <span class="line" style="min-width:120px">${escapeHtml(opts.insuranceValidFromDisplay)}</span>
      Đến <span class="line" style="min-width:120px">${escapeHtml(opts.insuranceValidToDisplay)}</span>
    </div>
    <div class="row">Ngày khám bệnh: <span class="line" style="min-width:120px">${escapeHtml(opts.examDateDisplay)}</span></div>
    <div class="row">
      Ngày vào viện:<span class="line" style="min-width:110px">${escapeHtml(opts.admissionDateDisplay)}</span>
      Ngày ra viện:<span class="line" style="min-width:110px">${escapeHtml(opts.dischargeDateDisplay)}</span>
    </div>
    <div class="row">Chẩn đoán:<span class="line no-dots" style="min-width:520px">${escapeHtml(opts.diagnosis)}</span></div>
    <div class="row">Bệnh kèm theo:<span class="line no-dots" style="min-width:490px">${escapeHtml(opts.comorbidities)}</span></div>

    <div class="para">
      Hẹn khám lại vào ngày <b>${escapeHtml(opts.revisitDay || "....")}</b> tháng <b>${escapeHtml(opts.revisitMonth || "....")}</b> năm <b>${escapeHtml(opts.revisitYear || "....")}</b>,
      hoặc đến bất kỳ thời gian nào trước ngày được hẹn khám lại nếu có dấu hiệu (triệu chứng) bất thường.
      ${opts.appointmentTimeLabel?.trim() ? ` Giờ hẹn: ${escapeHtml(opts.appointmentTimeLabel.trim())}.` : ""}
      ${dept ? ` Khoa hẹn: ${escapeHtml(dept)}.` : ""}
    </div>
    <div class="para">
      Phiếu hẹn khám lại chỉ có giá trị sử dụng 01 (một) lần. Trường hợp không đúng hẹn cần liên hệ với cơ sở khám bệnh chữa bệnh để được giải quyết.
    </div>

    <div class="footer">
      <div>........., ngày….tháng …. năm……</div>
      <div class="sig">Bác sĩ, Y sĩ khám bệnh</div>
      <div class="sig">(ký tên)</div>
      ${
        opts.signingTimeDisplay?.trim()
          ? `<div class="sig" style="font-size:12px;font-style:italic;margin-top:10px;text-align:right;max-width:220px;margin-left:auto">${escapeHtml(
              opts.signingTimeDisplay.trim()
            )}</div>`
          : ""
      }
      <div style="margin-top:16px; min-height: 2.5em; border-bottom: 1px solid #000; max-width: 220px; margin-left: auto;"></div>
      <div style="margin-top:6px">${escapeHtml(opts.doctorDisplayName)}</div>
    </div>
  </div>
</body>
</html>`
}
