"use client"

import { RecoveryProgressComingSoon } from "@/components/recovery-progress-coming-soon"

/** EMR sidebar recovery block — AI estimate disabled; shows Coming soon. */
export function EmrPatientRecoveryPanel(_props: { patientId?: string }) {
  return <RecoveryProgressComingSoon />
}
