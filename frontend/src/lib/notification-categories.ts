/** Tabs used in notification UI (maps from NOTIFICATION.type). */
export type NotificationTabId = "all" | "medication" | "appointments" | "clinical" | "other"

/** `label` = full name (tooltip); `labelShort` = compact tab text (single-row UI). */
export const NOTIFICATION_TAB_META: { id: NotificationTabId; label: string; labelShort: string }[] = [
  { id: "all", label: "All", labelShort: "All" },
  { id: "medication", label: "Medication", labelShort: "Meds" },
  { id: "appointments", label: "Appointments", labelShort: "Appts" },
  { id: "clinical", label: "Clinical", labelShort: "Clinic" },
  { id: "other", label: "Other", labelShort: "Other" },
]

export function getNotificationTabId(type: string | undefined | null): NotificationTabId {
  const t = String(type || "").toLowerCase().trim()
  if (!t) return "other"
  if (t === "medication_reminder" || t.includes("medication")) return "medication"
  if (t.startsWith("appointment_")) return "appointments"
  if (t === "patient_clinic_transfer_inbound" || t.includes("transfer") || t.includes("clinic")) {
    return "clinical"
  }
  return "other"
}

/** Short category label for the Type column (same wording as former tabs, no "Type" prefix). */
export function getNotificationCategoryTypeLabel(type: string | undefined | null): string {
  const id = getNotificationTabId(type)
  switch (id) {
    case "medication":
      return "Meds"
    case "appointments":
      return "Appts"
    case "clinical":
      return "Clinic"
    case "other":
      return "Other"
    default:
      return "Other"
  }
}
