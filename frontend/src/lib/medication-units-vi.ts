/** English unit keys stored in DB -> Vietnamese labels for prescriptions. */
export const MEDICATION_UNIT_LABELS_VI: Record<string, string> = {
  tablet: "viên",
  tablets: "viên",
  capsule: "viên nang",
  capsules: "viên nang",
  syrup: "chai (siro)",
  injection: "ống tiêm / lọ",
  drop: "giọt",
  drops: "giọt",
  cream: "tuýp kem",
  ointment: "tuýp thuốc mỡ",
  powder: "gói bột",
  spray: "chai xịt",
  ml: "ml",
  bottle: "chai",
  vial: "lọ",
  application: "lần bôi",
  unit: "đơn vị",
}

export function medicationUnitLabelVi(unit: string | null | undefined): string {
  const key = String(unit ?? "")
    .trim()
    .toLowerCase()
  if (!key) return "viên"
  return MEDICATION_UNIT_LABELS_VI[key] ?? String(unit).trim()
}