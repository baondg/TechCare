/**
 * useDoctorAppointments — logic layer for the Doctor Appointments page.
 *
 * Responsibilities (logic):
 *   - Fetch all appointments and filter only those belonging to the current doctor
 *   - Confirm an appointment (status → 'Confirmed')
 *   - Cancel an accepted visit with required reason
 *
 * What stays in the page (UI):
 *   - Date filter inputs (startDate / endDate)
 *   - Filtering via useMemo in the page
 *   - Cover / cancel reason dialogs (handled in the page)
 */

import { useState, useEffect, useCallback } from 'react'
import { doctorService, type DoctorAppointment } from '@/services/doctor-service'

interface UseDoctorAppointmentsReturn {
  appointments: DoctorAppointment[]
  loading: boolean
  error: string | null
  confirm: (id: number) => Promise<void>
  cancelConfirmed: (id: number, reason: string) => Promise<void>
  refresh: () => void
}

export function useDoctorAppointments(): UseDoctorAppointmentsReturn {
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await doctorService.getAppointments()
      setAppointments(data.appointments || [])
    } catch (err) {
      setError('Failed to load appointments.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const confirm = useCallback(async (id: number) => {
    await doctorService.confirmAppointment(id)
    void load()
  }, [load])

  const cancelConfirmed = useCallback(async (id: number, reason: string) => {
    await doctorService.cancelAppointment(id, reason)
    void load()
  }, [load])

  return { appointments, loading, error, confirm, cancelConfirmed, refresh: load }
}
