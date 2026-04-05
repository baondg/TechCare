import { createContext, useContext, type ReactNode } from "react"

export type EmrSessionState = {
  visitLoading: boolean
  /** Open REGIMEN (nurse check-in completed for this encounter). */
  visitActive: boolean
  /** When false, EMR pages should not perform POST/PUT/PATCH/DELETE for this patient. */
  mutationsAllowed: boolean
}

const EmrSessionContext = createContext<EmrSessionState | null>(null)

export function EmrSessionProvider({
  children,
  value,
}: {
  children: ReactNode
  value: EmrSessionState
}) {
  return <EmrSessionContext.Provider value={value}>{children}</EmrSessionContext.Provider>
}

/** Outside doctor/technician EMR layouts (e.g. nurse reusing a page), mutations stay allowed. */
export function useEmrSession(): EmrSessionState {
  const ctx = useContext(EmrSessionContext)
  if (!ctx) {
    return { visitLoading: false, visitActive: true, mutationsAllowed: true }
  }
  return ctx
}
