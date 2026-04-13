/**
 * HTML phiếu "PHIẾU THEO DÕI ĐIỀU TRỊ" — dùng chung cho preview (iframe) và export PDF.
 */

export type TreatmentFollowupSlipInputs = {
  patientName: string
  age: string
  gender: "M" | "F" | string | null | undefined
  department: string
  /** Hiển thị tại ô "Phòng:" trên mẫu (tùy chọn). */
  roomLabel?: string
  diagnosisIcd10: string
  diagnosisInterpretation: string
  complaintSymptoms: string
  doctorName: string
  note: string
  /** Dòng đầu cột "Thời gian" trong bảng (vd. lịch hẹn). */
  dateLabel?: string
  /** Cuối trang 1, căn phải — ví dụ thời gian lập / ký phiếu */
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

const SLIP_STYLES = `
      body {
        font-family: "Times New Roman", Times, "DejaVu Serif", serif;
        color: #000;
        margin: 0;
        padding: 0;
        background: #fff;
      }
      .doc {
        width: 210mm;
        margin: 0 auto;
        background: #fff;
      }
      .page {
        width: 210mm;
        min-height: 297mm;
        box-sizing: border-box;
        padding: 8mm 10mm 10mm 12mm;
        display: flex;
        flex-direction: column;
        font-size: 13px;
        page-break-after: always;
      }
      .page:last-child { page-break-after: auto; }

      .title {
        text-align: center;
        font-weight: 700;
        font-size: 16px;
        letter-spacing: 0.2px;
        margin: 0 0 3mm;
        white-space: nowrap;
      }
      .top {
        display: flex;
        justify-content: space-between;
        gap: 10mm;
        font-size: 13px;
        line-height: 1.4;
      }
      .top .left { width: 62mm; }
      .top .center { flex: 1; text-align: center; }
      .top .right { width: 62mm; text-align: right; }

      .line {
        display: inline-block;
        border-bottom: 1px dotted #000;
        min-height: 1em;
        padding: 0 2px 1px;
        vertical-align: baseline;
      }
      .no-dots { border-bottom: none; }

      .info {
        margin-top: 2mm;
        font-size: 13px;
        line-height: 1.55;
      }
      .row {
        display: flex;
        gap: 8mm;
        align-items: baseline;
      }
      .row.top-person { align-items: center; }
      .row .grow { flex: 1; min-width: 0; }
      .row .fixed { white-space: nowrap; }
      .row .gender-fixed { display: inline-flex; align-items: center; gap: 10px; }
      .check {
        display: inline-flex;
        gap: 6px;
        align-items: center;
      }
      .box {
        width: 12px;
        height: 12px;
        border: 1px solid #000;
        display: inline-block;
      }
      .box.checked::after{
        content:"";
        display:block;
        width: 7px;
        height: 7px;
        background:#000;
        margin: 2px;
      }

      table.table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 4mm;
        table-layout: fixed;
        font-size: 13px;
      }
      .table-wrap {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
      }
      .table-wrap table.table {
        height: 100%;
      }
      .table-wrap tbody tr {
        height: calc(100% / var(--rows, 12));
      }
      table.table th, table.table td {
        border: 1px solid #000;
        vertical-align: top;
        padding: 4px 5px;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      table.table th { text-align: center; font-weight: 700; }
      th.w-time, td.w-time { width: 18%; }
      th.w-soap, td.w-soap { width: 52%; }
      th.w-order, td.w-order { width: 30%; }

      td.dotted {
        background-image: repeating-linear-gradient(
          to bottom,
          transparent 0px,
          transparent 15px,
          rgba(0,0,0,0.55) 15px,
          rgba(0,0,0,0.55) 16px
        );
        background-size: 100% 16px;
      }
      td.w-time.dotted {
        background-image: repeating-linear-gradient(
          to bottom,
          transparent 0px,
          transparent 14px,
          rgba(0,0,0,0.55) 14px,
          rgba(0,0,0,0.55) 15px
        );
        background-size: 100% 15px;
      }

      .note {
        margin-top: 3mm;
        font-size: 13px;
      }

      /* SOAP guide page */
      .guide-title {
        font-size: 14px;
        font-weight: 700;
        margin: 2mm 0 4mm;
        text-align: center;
      }
      .guide {
        font-size: 13px;
        line-height: 1.55;
      }
      .guide .line-item { margin: 6px 0; }
`

export function buildTreatmentFollowupSlipHtmlDocument(opts: TreatmentFollowupSlipInputs): string {
  const patientName = String(opts.patientName || "")
  const age = String(opts.age || "")
  const department = String(opts.department || "")
  const roomLabel = String(opts.roomLabel || "")
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

  const rowCount = 16
  const blankRows = Array.from({ length: rowCount }, () => {
    return `
      <tr>
        <td class="w-time dotted">&nbsp;</td>
        <td class="w-soap dotted">&nbsp;</td>
        <td class="w-order dotted">&nbsp;</td>
      </tr>
    `
  }).join("")

  return `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <style>${SLIP_STYLES}</style>
  </head>
  <body>
    <div class="doc">
      <div class="page">
        <div class="top">
          <div class="left">
            Cơ sở KB, CB <span class="line" style="min-width: 120px">&nbsp;</span><br/>
            Khoa <span class="line no-dots" style="min-width: 120px">${escapeHtml(department) || "&nbsp;"}</span>
          </div>
          <div class="center">
            <div class="title">PHIẾU THEO DÕI ĐIỀU TRỊ</div>
            Tờ số: <span class="line" style="min-width: 90px">&nbsp;</span>
          </div>
          <div class="right">
            MS: <span class="line" style="min-width: 80px">&nbsp;</span><br/>
            Số vào viện: <span class="line" style="min-width: 110px">&nbsp;</span><br/>
            Mã người bệnh: <span class="line" style="min-width: 110px">&nbsp;</span>
          </div>
        </div>

        <div class="info">
          <div class="row top-person">
            <div class="grow">
              Họ và tên người bệnh: <span class="line no-dots" style="min-width: 210px; font-weight: 700">${escapeHtml(patientName)}</span>
            </div>
            <div class="fixed">
              Tuổi: <span class="line no-dots" style="min-width: 28px">${escapeHtml(age)}</span>
            </div>
            <div class="fixed">
              Giới tính: <span class="line no-dots" style="min-width: 60px">${isMale ? "Nam" : isFemale ? "Nữ" : escapeHtml(g)}</span>
            </div>
          </div>

          <div class="row" style="margin-top:2mm;">
            <div class="grow">
              Khoa: <span class="line no-dots" style="min-width: 120px">${escapeHtml(department)}</span>
            </div>
            <div class="grow">
              Phòng: <span class="line no-dots" style="min-width: 80px">${escapeHtml(roomLabel)}</span>
            </div>
            <div class="grow">
              Giường: <span class="line" style="min-width: 80px">&nbsp;</span>
            </div>
          </div>

          <div style="margin-top:2mm;">
            Chẩn đoán: <span class="line no-dots" style="min-width: 430px">${escapeHtml(diagnosisLine)}</span>
          </div>
          <div style="margin-top:1mm;">
            Chẩn đoán phân biệt: <span class="line" style="min-width: 380px">&nbsp;</span>
          </div>
        </div>

        <div class="table-wrap" style="--rows:${rowCount}">
          <table class="table">
            <thead>
              <tr>
                <th class="w-time">Thời gian<br/><span style="font-weight:400">(Ngày, giờ)</span></th>
                <th class="w-soap">Diễn biến bệnh<br/><span style="font-weight:400">(Viết diễn biến theo cấu trúc SOAP)</span></th>
                <th class="w-order">Chỉ định</th>
              </tr>
            </thead>
            <tbody>${blankRows}</tbody>
          </table>
        </div>

        <div class="note">
          <b>Ghi chú:</b> Bác sỹ ký ngay sau mỗi lần ghi chép trong phần “Diễn biến bệnh” hoặc “Chỉ định”.
        </div>
        ${
          opts.signingTimeDisplay?.trim()
            ? `<div style="margin-top:3mm;font-size:11px;font-style:italic;text-align:right;color:#333">${escapeHtml(
                opts.signingTimeDisplay.trim()
              )}</div>`
            : ""
        }
      </div>

      <div class="page">
        <div class="guide-title">Hướng dẫn cách ghi chép theo cấu trúc (SOAP)</div>
        <div class="guide">
          <div class="line-item">- <b>S (Hỏi bệnh)</b>: ghi lại các thông tin của người bệnh tự khai như triệu chứng, bệnh sử, bối cảnh xuất hiện bệnh, tiền sử...</div>
          <div class="line-item">- <b>O (Kết quả khám)</b>: ghi lại các thông tin do bác sỹ thăm khám như các dấu hiệu sinh tồn, các kết quả xét nghiệm...</div>
          <div class="line-item">- <b>A (Đánh giá)</b>: đánh giá, phân tích kết quả và chẩn đoán trên cơ sở thông tin tự khai của người bệnh và kết quả khám bệnh.</div>
          <div class="line-item">- <b>P (Kế hoạch điều trị)</b>: tóm tắt tình hình, diễn biến bệnh, đưa ra nhận định, đưa ra hướng xử trí tiếp theo.</div>
          <div class="line-item">- <b>C (Chỉ định)</b>: cụ thể hóa kế hoạch điều trị như các vấn đề cần theo dõi (theo dõi thân nhiệt, nhịp thở, huyết áp...), các loại thuốc sử dụng, các thủ thuật cần làm...</div>
        </div>
      </div>
    </div>
  </body>
  </html>`
}

/** Gộp ngày + giờ lịch hẹn thành nhãn hiển thị (preview / PDF). */
export function formatFollowUpSlotDateLabel(dateIso: string, timeStr: string): string {
  const dPart = String(dateIso || "").trim()
  const tRaw = String(timeStr || "").trim()
  if (!dPart) return ""
  const t = tRaw.length <= 5 && tRaw.length > 0 ? `${tRaw}:00` : tRaw || "09:00:00"
  const combined = `${dPart}T${t}`
  const dt = new Date(combined)
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
  }
  return tRaw ? `${dPart} ${tRaw}` : dPart
}
