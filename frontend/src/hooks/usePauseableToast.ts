import { useCallback, useEffect, useRef, useState } from 'react'

export type PauseableToastVariant = 'success' | 'error'

/** Full-opacity window (hover pauses). Fade-in 300ms runs before this countdown starts. */
const FADE_IN_MS = 300
const FADE_OUT_MS = 300

export interface PauseableToastEntry {
  id: number
  message: string
  variant: PauseableToastVariant
}

export function usePauseableToast(durationMs = 2000) {
  const [toast, setToast] = useState<PauseableToastEntry | null>(null)
  const [isExiting, setIsExiting] = useState(false)
  const endTimeRef = useRef(0)
  const remainingMsRef = useRef(FADE_IN_MS + durationMs)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastIdRef = useRef(0)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const clearExitTimer = useCallback(() => {
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current)
      exitTimeoutRef.current = null
    }
  }, [])

  const startExitAnimation = useCallback(() => {
    clearTimer()
    clearExitTimer()
    setIsExiting(true)
    exitTimeoutRef.current = setTimeout(() => {
      setToast(null)
      setIsExiting(false)
      exitTimeoutRef.current = null
    }, FADE_OUT_MS)
  }, [clearTimer, clearExitTimer])

  const armTimer = useCallback(() => {
    clearTimer()
    const ms = Math.max(0, endTimeRef.current - Date.now())
    if (ms <= 0) {
      startExitAnimation()
      return
    }
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      startExitAnimation()
    }, ms)
  }, [clearTimer, startExitAnimation])

  const show = useCallback(
    (message: string, variant: PauseableToastVariant) => {
      clearTimer()
      clearExitTimer()
      setIsExiting(false)
      toastIdRef.current += 1
      setToast({ id: toastIdRef.current, message, variant })
      endTimeRef.current = Date.now() + FADE_IN_MS + durationMs
      remainingMsRef.current = FADE_IN_MS + durationMs
      armTimer()
    },
    [armTimer, clearExitTimer, clearTimer, durationMs]
  )

  const showSuccess = useCallback((message: string) => show(message, 'success'), [show])
  const showError = useCallback((message: string) => show(message, 'error'), [show])

  const dismiss = useCallback(() => {
    clearTimer()
    clearExitTimer()
    setIsExiting(false)
    setToast(null)
  }, [clearExitTimer, clearTimer])

  const onMouseEnter = useCallback(() => {
    clearTimer()
    remainingMsRef.current = Math.max(0, endTimeRef.current - Date.now())
  }, [clearTimer])

  const onMouseLeave = useCallback(() => {
    endTimeRef.current = Date.now() + remainingMsRef.current
    armTimer()
  }, [armTimer])

  useEffect(
    () => () => {
      clearTimer()
      clearExitTimer()
    },
    [clearExitTimer, clearTimer]
  )

  return { toast, isExiting, showSuccess, showError, dismiss, onMouseEnter, onMouseLeave }
}
