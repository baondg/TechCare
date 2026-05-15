"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CheckCircle2 } from "lucide-react"
import { subscribeSuccessToast, type SuccessToastEvent } from "@/lib/success-toast-bus"

const MAX_QUEUE = 5
const SHOW_MS = 3500

export function SuccessToastProvider() {
  const [queue, setQueue] = useState<SuccessToastEvent[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remainingRef = useRef(SHOW_MS)
  const deadlineRef = useRef(0)

  const current = useMemo(() => (queue.length ? queue[0] : null), [queue])

  const clearTimer = useCallback(() => {
    if (!timeoutRef.current) return
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const consumeCurrent = useCallback(() => {
    setQueue((prev) => prev.slice(1))
  }, [])

  const armDismiss = useCallback(
    (durationMs: number) => {
      clearTimer()
      deadlineRef.current = Date.now() + durationMs
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        consumeCurrent()
      }, durationMs)
    },
    [clearTimer, consumeCurrent]
  )

  useEffect(() => {
    const unsubscribe = subscribeSuccessToast((event) => {
      setQueue((prev) => {
        const next = [...prev, event]
        return next.slice(Math.max(0, next.length - MAX_QUEUE))
      })
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    clearTimer()
    remainingRef.current = SHOW_MS
    if (!current) return
    if (!isPaused) {
      armDismiss(SHOW_MS)
    }
    return clearTimer
  }, [armDismiss, clearTimer, current, isPaused])

  useEffect(() => () => clearTimer(), [clearTimer])

  const onMouseEnter = useCallback(() => {
    if (!current) return
    setIsPaused(true)
    if (timeoutRef.current) {
      remainingRef.current = Math.max(0, deadlineRef.current - Date.now())
      clearTimer()
    }
  }, [clearTimer, current])

  const onMouseLeave = useCallback(() => {
    if (!current) return
    setIsPaused(false)
    armDismiss(remainingRef.current || SHOW_MS)
  }, [armDismiss, current])

  if (!current || typeof document === "undefined") return null

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="pointer-events-auto fixed bottom-5 right-5 z-[121] max-w-md rounded-lg border-2 border-emerald-500 bg-white px-4 py-3 text-sm text-emerald-700 shadow-lg"
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p className="leading-5">{current.message}</p>
      </div>
    </div>,
    document.body
  )
}
