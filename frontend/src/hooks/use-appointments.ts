/**
 * useAppointments — logic layer for the Patient Appointments page.
 *
 * Responsibilities (logic):
 *   - Fetch all appointments from the API
 *   - Cancel an appointment (status → 'Cancelled')
 *   - Expose a refresh function
 *
 * What stays in the page (UI):
 *   - Date filter inputs (startDate / endDate)        ← local form state
 *   - Filtering logic applied via useMemo in the page ← derives from hook data
 *   - Navigation to book/reschedule/feedback pages
 */

import { useState, useEffect, useCallback } from 'react'
import { appointmentService, type Appointment } from '@/services/appointment-service'

interface UseAppointmentsReturn {
  appointments: Appointment[]
  loading: boolean
  error: string | null
  cancel: (id: number, cancellationReason: string) => Promise<void>
  refresh: () => void
}

export function useAppointments(): UseAppointmentsReturn {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await appointmentService.getAppointments()
      setAppointments(data)
    } catch (err) {
      setError('Failed to load appointments.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const cancel = useCallback(async (id: number, cancellationReason: string) => {
    await appointmentService.updateAppointment(id, { status: 'Cancelled', cancellationReason })
    void load()
  }, [load])

  return { appointments, loading, error, cancel, refresh: load }
}
