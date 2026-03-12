/**
 * useDoctorAppointments — logic layer for the Doctor Appointments page.
 *
 * Responsibilities (logic):
 *   - Fetch all appointments and filter only those belonging to the current doctor
 *   - Confirm an appointment (status → 'Confirmed')
 *   - Reject an appointment (status → 'Rejected')
 *
 * What stays in the page (UI):
 *   - Date filter inputs (startDate / endDate)
 *   - Filtering via useMemo in the page
 *   - Confirmation dialog (confirm on reject)
 */

import { useState, useEffect, useCallback } from 'react'
import { appointmentService, type Appointment } from '@/services/appointment-service'

interface UseDoctorAppointmentsReturn {
  appointments: Appointment[]
  loading: boolean
  error: string | null
  confirm: (id: number) => Promise<void>
  reject: (id: number) => Promise<void>
  refresh: () => void
}

export function useDoctorAppointments(doctorUsername: string | undefined): UseDoctorAppointmentsReturn {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!doctorUsername) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const all = await appointmentService.getAppointments()
      setAppointments(all.filter(a => a.doctor === doctorUsername))
    } catch (err) {
      setError('Failed to load appointments.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [doctorUsername])

  useEffect(() => { void load() }, [load])

  const confirm = useCallback(async (id: number) => {
    await appointmentService.updateAppointment(id, { status: 'Confirmed' })
    void load()
  }, [load])

  const reject = useCallback(async (id: number) => {
    await appointmentService.updateAppointment(id, { status: 'Rejected' })
    void load()
  }, [load])

  return { appointments, loading, error, confirm, reject, refresh: load }
}
