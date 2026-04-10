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
    font-size: 13px;
    line-height: 1.35;
  }
  .doc { width: 210mm; margin: 0 auto; }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 8mm 12mm 10mm;
    box-sizing: border-box;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  .center { text-align: center; }
  .top-note { font-size: 12px; text-align: center; font-weight: 700; }
  .top-note em { font-weight: 400; font-style: italic; }
  .head {
    margin-top: 6px;
    display: grid;
    grid-template-columns: 1fr 1.1fr 1fr;
    gap: 8px;
    align-items: start;
  }
  .head .left, .head .mid, .head .right { font-weight: 700; }
  .head .left { text-align: left; }
  .head .mid { text-align: center; }
  .head .right { text-align: right; }
  .line {
    border-bottom: 1px dotted #000;
    display: inline-block;
    min-height: 1em;
    vertical-align: baseline;
    padding: 0 2px 1px;
  }
  .title {
    margin-top: 8px;
    margin-bottom: 8px;
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .row { margin: 4px 0; }
  .chk {
    width: 12px;
    height: 12px;
    border: 1px solid #000;
    display: inline-block;
    vertical-align: -1px;
    margin-left: 4px;
  }
  .section-title { margin-top: 6px; font-weight: 700; text-transform: uppercase; }
  .muted { font-style: italic; font-size: 12px; }
  .sign { margin-top: 16px; text-align: right; font-weight: 700; }
`

/** Full HTML document (for iframe srcDoc và cho PDF pipeline). */
export function buildHospitalTransferSlipHtmlDocument(opts: HospitalTransferSlipInputs): string {
  const facility = String(opts.facilityName || "Cơ sở khám chữa bệnh")
  const dest = String(opts.destinationHospital || "")
  const reason = String(opts.reason || "")
  const note = String(opts.note || "")
  const transport = opts.transport != null ? String(opts.transport) : ""
  const doctor = String(opts.doctorName || "")
  const extraHtml = formatPayloadExtra(opts.formPayload || null)

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
        <div class="top-note">Phụ lục VI<br/>MẪU PHIẾU CHUYỂN CƠ SỞ KHÁM BỆNH, CHỮA BỆNH BẢO HIỂM Y TẾ<br/><em>(Ban hành kèm theo Thông tư số 01/2025/TT-BYT ngày 01 tháng 01 năm 2025 của Bộ trưởng Bộ Y tế)</em></div>
        <div class="head">
          <div class="left">CƠ QUAN CHỦ<br/>(BYT/SYT..)<br/>TÊN CƠ SỞ KCB<br/><br/>Số<span class="line" style="min-width:92px"> ${escapeHtml(opts.destinationRefId ? String(opts.destinationRefId) : "")}</span>/PCCKCB</div>
          <div class="mid">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br/>Độc lập - Tự do - Hạnh phúc<br/>------------------</div>
          <div class="right">Số hồ sơ:<span class="line" style="min-width:86px">&nbsp;</span><br/>Vào sổ chuyển viện số:<span class="line" style="min-width:62px">&nbsp;</span></div>
        </div>

        <div class="title">PHIẾU CHUYỂN CƠ SỞ KHÁM BỆNH, CHỮA BỆNH BẢO HIỂM Y TẾ</div>
        <div class="center row">Kính gửi: <span class="line" style="min-width:360px">${escapeHtml(dest)}</span></div>

        <div class="row">Cơ sở khám bệnh, chữa bệnh: <span class="line" style="min-width:260px">${escapeHtml(facility)}</span> trân trọng giới thiệu:</div>
        <div class="row">- Họ và tên người bệnh: <span class="line" style="min-width:380px">${escapeHtml(opts.patientName)}</span></div>
        <div class="row">- Nam/Nữ: <span class="line" style="min-width:70px">${escapeHtml(opts.patientSex || "")}</span> Năm sinh: <span class="line" style="min-width:90px">${escapeHtml(opts.patientDob || "")}</span></div>
        <div class="row">- Địa chỉ: <span class="line" style="min-width:520px">${escapeHtml(opts.patientAddress || "")}</span></div>
        <div class="row">- Dân tộc: <span class="line" style="min-width:120px">&nbsp;</span> Quốc tịch: <span class="line" style="min-width:120px">&nbsp;</span></div>
        <div class="row">- Nghề nghiệp: <span class="line" style="min-width:140px">&nbsp;</span> Nơi làm việc <span class="line" style="min-width:220px">&nbsp;</span></div>
        <div class="row">- Số thẻ bảo hiểm y tế: <span class="line" style="min-width:220px">${escapeHtml(opts.insuranceId || "")}</span></div>
        <div class="row">- Thời hạn sử dụng của thẻ bảo hiểm y tế đến ngày.... tháng...... năm.....</div>
        <div class="row">Hết thời hạn <span class="chk"></span>&nbsp;&nbsp;&nbsp; Không xác định được thời hạn: <span class="chk"></span></div>
        <div class="row">- Đã được khám bệnh, điều trị:</div>
        <div class="row">+ Tại <span class="line" style="min-width:150px">${escapeHtml(facility)}</span> (Cấp........) từ ngày ..... tháng .... năm ... đến ngày ..... tháng .... năm ...</div>
        <div class="row">+ Tại <span class="line" style="min-width:150px">&nbsp;</span> (Cấp........) từ ngày ..... tháng .... năm ... đến ngày ..... tháng .... năm ...</div>

        <div class="section-title">TÓM TẮT BỆNH ÁN</div>
        <div class="row">- Tóm tắt dấu hiệu lâm sàng: <span class="line" style="min-width:470px">${escapeHtml(reason)}</span></div>
        <div class="row"><span class="line" style="min-width:580px">&nbsp;</span></div>
        <div class="row">- Tóm tắt kết quả xét nghiệm, cận lâm sàng chính có giá trị chẩn đoán, theo dõi điều trị:</div>
        <div class="row"><span class="line" style="min-width:580px">${escapeHtml(note || "")}</span></div>
        <div class="row">- Chẩn đoán (bệnh chính) <span class="line" style="min-width:430px">${escapeHtml([opts.icd10, opts.diagnosis].filter(Boolean).join(" - "))}</span></div>
      </div>

      <div class="page">
        <div class="center" style="font-size:16px; font-weight:700;">2</div>
        <div class="row">- Phương pháp, thủ thuật đã thực hiện (nếu có) <span class="line" style="min-width:320px">&nbsp;</span></div>
        <div class="row"><span class="line" style="min-width:580px">&nbsp;</span></div>
        <div class="row">Thời gian bắt đầu thực hiện: .....giờ.....phút.....ngày ....tháng ....năm....</div>
        <div class="row">Thời gian kết thúc thực hiện: .....giờ.....phút.....ngày ....tháng ....năm....</div>
        <div class="row">- Kỹ thuật, thuốc điều trị chính đã sử dụng: <span class="line" style="min-width:430px">${escapeHtml(transport)}</span></div>
        <div class="row"><span class="line" style="min-width:580px">&nbsp;</span></div>
        <div class="row">- Tình trạng người bệnh lúc chuyển cơ sở khám bệnh, chữa bệnh: <span class="line" style="min-width:330px">&nbsp;</span></div>
        <div class="row"><span class="line" style="min-width:580px">&nbsp;</span></div>
        <div class="row">- Lý do chuyển cơ sở khám bệnh, chữa bệnh: Khoanh tròn vào mục 1 hoặc 2 lý do chuyển cơ sở khám bệnh, chữa bệnh. Trường hợp chọn mục 1, đánh dấu (X) vào ô tương ứng.</div>
        <div class="row">(1) Đi điều kiện chuyển cơ sở khám bệnh, chữa bệnh:</div>
        <div class="row">a) Phù hợp với quy định chuyển cấp chuyên môn kỹ thuật (**): <span class="chk"></span></div>
        <div class="row">b) Không phù hợp với khả năng đáp ứng của cơ sở khám bệnh, chữa bệnh. <span class="chk"></span></div>
        <div class="row">(2) Theo yêu cầu của người bệnh hoặc người đại diện hợp pháp của người bệnh.</div>
        <div class="row">- Hướng điều trị: <span class="line" style="min-width:500px">&nbsp;</span></div>
        <div class="row"><span class="line" style="min-width:580px">&nbsp;</span></div>
        <div class="row">- Chuyển cơ sở khám bệnh, chữa bệnh hồi: .... giờ ... phút, ngày ... tháng ... năm</div>
        <div class="row">- Trường hợp chuyển cơ sở khám bệnh, chữa bệnh có giá trị trong 01 năm: (có/không)***</div>
        <div class="row">- Phương tiện vận chuyển: <span class="line" style="min-width:380px">${escapeHtml(transport)}</span></div>
        <div class="row">- Họ tên, chức danh, trình độ chuyên môn của người hộ tống (nếu có): <span class="line" style="min-width:240px">${escapeHtml(doctor)}</span></div>
        <div class="row"><span class="line" style="min-width:580px">&nbsp;</span></div>

        <div class="sign">Ngày .... tháng .... năm ....<br/>ĐẠI DIỆN CƠ SỞ KCB/BS ĐIỀU TRỊ<br/><span class="muted">(Ký tên, đóng dấu)</span></div>

        <div style="margin-top: 14px;" class="muted"><b>Ghi chú:</b><br/>
        (*) Cơ sở khám bệnh, chữa bệnh có thể ghi tóm tắt thông tin cơ bản, các nội dung chi tiết có thể gửi kèm theo dữ liệu khám bệnh, chữa bệnh.<br/>
        (**) Người bệnh đi khám bệnh, chữa bệnh đúng cấp chuyên môn kỹ thuật trong khám bệnh, chữa bệnh bao gồm được chuyển lên cấp trên hoặc chuyển về cấp dưới hoặc chuyển giữa các cơ sở khám bệnh, chữa bệnh trong cùng cấp theo quy định của pháp luật.<br/>
        (***) Ghi rõ có hoặc không.<br/>
        Trường hợp phiếu chuyển cơ sở khám bệnh, chữa bệnh được hiển thị trên ứng dụng VNeID và có ký số đầy đủ theo quy định thì có giá trị tương đương bản giấy.
        </div>
        ${extraHtml ? `<div style="margin-top:8px" class="muted">${extraHtml}</div>` : ""}
      </div>
    </div>
  </body>
  </html>`
}
