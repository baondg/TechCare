/**
 * useHealthInfo — logic layer for the Patient Health Info page.
 *
 * Responsibilities (logic):
 *   - Fetch current health info record
 *   - Fetch paginated health history
 *   - Save (create or update) health info
 *   - Manage loading / saving / error / success states
 *
 * What stays in the page (UI):
 *   - Individual form field states (height, weight, bpSys, …)
 *   - Allergy / history arrays (edited with InputList component)
 *   - isEditing, selectedRecord, pagination-display state
 */

import { useState, useEffect, useCallback } from 'react'
import { healthInfoService, type HealthInfo } from '@/services/health-info-service'

interface HistoryPagination {
  total: number
  page: number
  limit: number
  totalPages: number
}

interface HealthRecord {
  id: number
  updatedAt: Date
  height: number
  weight: number
  bmi: number
  bloodPressure: string
  heartRate: number
  respiratoryRate: number
  temperature: number
  spo2: number
  symptoms: string
  updatedBy: string
}

interface UseHealthInfoReturn {
  healthInfo: HealthInfo | null
  currentHealthInfoId: number | null
  loading: boolean
  saving: boolean
  error: string | null
  success: string | null
  history: HealthRecord[]
  historyPagination: HistoryPagination
  save: (data: Partial<HealthInfo>) => Promise<void>
  loadHistory: (page?: number, limit?: number) => Promise<void>
  clearMessages: () => void
}

export function useHealthInfo(): UseHealthInfoReturn {
  const [healthInfo, setHealthInfo] = useState<HealthInfo | null>(null)
  const [currentHealthInfoId, setCurrentHealthInfoId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [history, setHistory] = useState<HealthRecord[]>([])
  const [historyPagination, setHistoryPagination] = useState<HistoryPagination>({
    total: 0, page: 1, limit: 10, totalPages: 1,
  })

  const loadHealthInfo = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await healthInfoService.getHealthInfo()
      if (result.success && result.healthInfo) {
        setHealthInfo(result.healthInfo)
        setCurrentHealthInfoId(result.healthInfo.id ?? null)
      }
    } catch (err) {
      console.error('Failed to load health info:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async (page = 1, limit = 10) => {
    try {
      const result = await healthInfoService.getHealthHistory(page, limit)
      if (result.success) {
        setHistory((result.healthHistory as HealthRecord[]) ?? [])
        setHistoryPagination(
          (result.pagination as HistoryPagination) ?? { total: 0, page, limit, totalPages: 1 },
        )
      }
    } catch (err) {
      console.error('Failed to load health history:', err)
    }
  }, [])

  useEffect(() => {
    void loadHealthInfo()
    void loadHistory()
  }, [loadHealthInfo, loadHistory])

  const save = useCallback(async (data: Partial<HealthInfo>) => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      if (currentHealthInfoId) {
        await healthInfoService.updateHealthInfo(currentHealthInfoId, data)
      } else {
        await healthInfoService.createHealthInfo(data)
      }
      setSuccess('Health information saved successfully!')
      void loadHealthInfo()
      void loadHistory()
    } catch (err) {
      setError('Failed to save health information.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [currentHealthInfoId, loadHealthInfo, loadHistory])

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  return {
    healthInfo, currentHealthInfoId,
    loading, saving, error, success,
    history, historyPagination,
    save, loadHistory, clearMessages,
  }
}
