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
  /** Mảng đúng 6 ký tự hiển thị trong ô vuông số thẻ BHYT */
  insuranceCardSix: string[]
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
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/** Lấy 6 ký tự đầu (sau khi bỏ khoảng trắng) cho ô vuông số thẻ. */
export function splitInsuranceCardSix(raw: string | null | undefined): string[] {
  const clean = String(raw || "")
    .replace(/\s/g, "")
    .slice(0, 6)
    .split("")
  const out = [...clean]
  while (out.length < 6) out.push("")
  return out.slice(0, 6)
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
  body { margin: 0; padding: 0; background: #fff; color: #000; }
  .sheet {
    width: 190mm;
    max-width: 100%;
    margin: 0 auto;
    padding: 10mm 12mm 12mm;
    box-sizing: border-box;
    font-family: "Times New Roman", Times, "DejaVu Serif", serif;
    font-size: 13px;
    line-height: 1.45;
  }
  .title {
    text-align: center;
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.5px;
    margin-bottom: 16px;
    text-transform: uppercase;
  }
  .row { margin-bottom: 11px; }
  .label { font-weight: 400; }
  .fill {
    border-bottom: 1px dotted #000;
    display: inline-block;
    min-height: 1.15em;
    vertical-align: baseline;
    padding: 0 2px 1px;
  }
  .fill-long { min-width: 55%; }
  .fill-mid { min-width: 28%; }
  .fill-short { min-width: 3.5em; }
  .inline-gio { margin-left: 8px; }
  .ins-wrap { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; vertical-align: middle; }
  .ins-boxes { display: inline-flex; gap: 5px; margin-left: 4px; }
  .ins-box {
    width: 22px;
    height: 24px;
    border: 1px solid #000;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    box-sizing: border-box;
  }
  .block-text {
    margin: 14px 0;
    text-align: justify;
    line-height: 1.55;
  }
  .legal {
    margin-top: 12px;
    font-size: 12px;
    line-height: 1.5;
    text-align: justify;
  }
  .footer {
    margin-top: 28px;
    text-align: right;
    font-size: 13px;
    line-height: 1.65;
  }
  .sig-bold { font-weight: 700; margin-top: 6px; }
  .muted { color: #333; }
  .time-hint { font-size: 12px; margin-top: 6px; }
`

export function buildFollowUpReexamSlipHtmlDocument(opts: FollowUpReexamSlipInputs): string {
  const six = (opts.insuranceCardSix || []).slice(0, 6)
  while (six.length < 6) six.push("")
  const boxes = six
    .map((ch) => `<span class="ins-box">${escapeHtml(ch || "\u00A0")}</span>`)
    .join("")

  const dept = (opts.departmentLabel || "").trim()
  const deptLine = dept
    ? `<div class="time-hint"><span class="label">Khoa hẹn:</span> <span class="fill fill-mid">${escapeHtml(dept)}</span></div>`
    : ""

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>${STYLES}</style>
</head>
<body>
  <div class="sheet">
    <div class="title">PHIẾU HẸN KHÁM LẠI</div>

    <div class="row">
      <span class="label">Họ tên người bệnh:</span>
      <span class="fill fill-long">${escapeHtml(opts.patientName)}</span>
      <span class="inline-gio"><span class="label">Giới:</span> <span class="fill fill-short">${escapeHtml(opts.genderLabel)}</span></span>
    </div>

    <div class="row">
      <span class="label">Sinh ngày:</span> <span class="fill fill-mid">${escapeHtml(opts.dateOfBirthDisplay)}</span>
      <span class="inline-gio"><span class="label">Địa chỉ:</span> <span class="fill fill-long" style="min-width:52%">${escapeHtml(opts.address)}</span></span>
    </div>

    <div class="row">
      <span class="label">Số thẻ BHYT:</span>
      <span class="ins-wrap"><span class="ins-boxes">${boxes}</span></span>
    </div>

    <div class="row">
      <span class="label">Hạn sử dụng:</span>
      Từ <span class="fill fill-mid">${escapeHtml(opts.insuranceValidFromDisplay)}</span>
      Đến <span class="fill fill-mid">${escapeHtml(opts.insuranceValidToDisplay)}</span>
    </div>

    <div class="row">
      <span class="label">Ngày khám bệnh:</span> <span class="fill fill-mid">${escapeHtml(opts.examDateDisplay)}</span>
    </div>

    <div class="row">
      <span class="label">Ngày vào viện:</span> <span class="fill fill-mid">${escapeHtml(opts.admissionDateDisplay)}</span>
      <span class="inline-gio"><span class="label">Ngày ra viện:</span> <span class="fill fill-mid">${escapeHtml(opts.dischargeDateDisplay)}</span></span>
    </div>

    <div class="row">
      <span class="label">Chẩn đoán:</span> <span class="fill" style="display:block;width:100%;margin-top:4px;min-height:2.2em">${escapeHtml(opts.diagnosis)}</span>
    </div>

    <div class="row">
      <span class="label">Bệnh kèm theo:</span> <span class="fill" style="display:block;width:100%;margin-top:4px;min-height:2.2em">${escapeHtml(opts.comorbidities)}</span>
    </div>

    <div class="block-text">
      Hẹn khám lại vào ngày <b>${escapeHtml(opts.revisitDay)}</b> tháng <b>${escapeHtml(opts.revisitMonth)}</b> năm <b>${escapeHtml(opts.revisitYear)}</b>,
      hoặc đến bất kỳ thời gian nào trước ngày được hẹn khám lại nếu có dấu hiệu (triệu chứng) bất thường.
    </div>
    ${opts.appointmentTimeLabel?.trim() ? `<div class="time-hint"><span class="label">Giờ hẹn:</span> ${escapeHtml(opts.appointmentTimeLabel.trim())}</div>` : ""}
    ${deptLine}

    <div class="legal muted">
      Phiếu hẹn khám lại chỉ có giá trị sử dụng 01 (một) lần. Trường hợp không đúng hẹn cần liên hệ với cơ sở khám bệnh chữa bệnh để được giải quyết.
    </div>

    <div class="footer">
      <div>${escapeHtml(opts.footerPlaceLine)}<span class="muted">, ngày </span>${escapeHtml(opts.footerDay)}<span class="muted"> tháng </span>${escapeHtml(opts.footerMonth)}<span class="muted"> năm </span>${escapeHtml(opts.footerYear)}</div>
      <div class="sig-bold">Bác sĩ, Y sĩ khám bệnh</div>
      <div class="muted">(ký tên)</div>
      <div style="margin-top:16px; min-height: 2.5em; border-bottom: 1px solid #000; max-width: 220px; margin-left: auto;"></div>
      <div style="margin-top:6px">${escapeHtml(opts.doctorDisplayName)}</div>
    </div>
  </div>
</body>
</html>`
}
