/**
 * useProfile — logic layer for the Patient Profile page.
 *
 * Responsibilities (logic):
 *   - Fetch the patient's profile from the API
 *   - Save (create or update) the profile
 *   - Manage loading / saving / error / success states
 *
 * What stays in the page (UI):
 *   - Individual form field state (fullName, dob, sex, …)
 *   - isEditing toggle
 *   - Date pickers
 *
 * Usage:
 *   const { profile, loading, saving, error, success, save, clearMessages } = useProfile(user?.id)
 *   // On mount, profile is populated → page initialises its form fields from it.
 *   // On save, page assembles Partial<PatientProfile> and calls save(data).
 */

import { useState, useEffect, useCallback } from 'react'
import { profileService, type PatientProfile } from '@/services/profile-service'

interface UseProfileReturn {
  profile: PatientProfile | null
  loading: boolean
  saving: boolean
  error: string | null
  success: string | null
  save: (data: Partial<PatientProfile>) => Promise<void>
  clearMessages: () => void
}

export function useProfile(userId: number | undefined): UseProfileReturn {
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const data = await profileService.getProfile(userId)
      setProfile(data)
    } catch (err) {
      // Profile may not exist yet — that's fine, page shows an empty form
      console.warn('Profile not found:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (data: Partial<PatientProfile>) => {
    if (!userId) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await profileService.updateProfile(userId, data)
      setSuccess('Profile saved successfully!')
      void load()           // refresh to get server-side values (e.g. updatedAt)
    } catch (err) {
      setError('Failed to save profile. Please try again.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [userId, profile?.id, load])

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  return { profile, loading, saving, error, success, save, clearMessages }
}
