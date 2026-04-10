"use client"

import { useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import type { PauseableToastEntry } from "@/hooks/usePauseableToast"

function PauseableCornerToast({
  toast,
  isExiting,
  onMouseEnter,
  onMouseLeave,
}: {
  toast: PauseableToastEntry
  isExiting: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const [entered, setEntered] = useState(false)

  useLayoutEffect(() => {
    setEntered(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [toast.id])

  const visible = entered && !isExiting

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto fixed bottom-6 left-6 z-[100] max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0",
        toast.variant === "success" && "bg-[#34A853] text-white",
        toast.variant === "error" && "bg-[#EA4335] text-white"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {toast.message}
    </div>
  )
}

/** Renders the same bottom-left pauseable toast as the prescription EMR page. */
export function PauseableCornerToastPortal({
  toast,
  isExiting,
  onMouseEnter,
  onMouseLeave,
}: {
  toast: PauseableToastEntry | null
  isExiting: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  if (!toast || typeof document === "undefined") return null
  return createPortal(
    <PauseableCornerToast
      toast={toast}
      isExiting={isExiting}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />,
    document.body
  )
}
