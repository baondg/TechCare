"use client"

import { useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import type { PauseableToastEntry } from "@/hooks/use-pauseable-toast"

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
        "pointer-events-auto fixed bottom-5 right-5 z-[118] max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ease-out",
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

/** Bottom-right pauseable toast (aligned with global toast corner; avoids stacking with the global error toast when only one path fires). */
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
