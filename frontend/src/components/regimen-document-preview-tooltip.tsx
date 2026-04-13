"use client"

import type { ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FormPayloadPreview } from "@/components/form-payload-preview"
import { cn } from "@/lib/utils"

type Props = {
  /** Plain-text / pre-wrap summary (vitals, transfer fields, etc.). */
  summary: string
  /** Optional EMR JSON shown as labeled fields instead of raw JSON. */
  formPayload?: Record<string, unknown> | null
  children: ReactNode
  side?: "top" | "right" | "bottom" | "left"
}

/** Hover preview for regimen-linked documents (hospital transfer, health tracking slip). */
export function RegimenDocumentPreviewTooltip({
  summary,
  formPayload,
  children,
  side = "top",
}: Props) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn(
          "z-[200] max-h-[min(70vh,26rem)] max-w-[min(28rem,92vw)] overflow-y-auto overflow-x-hidden",
          "whitespace-normal break-words border bg-popover px-3 py-2 text-[11px] leading-snug text-popover-foreground shadow-md"
        )}
      >
        <div className="space-y-0">
          <div className="whitespace-pre-wrap break-words font-normal">{summary}</div>
          <FormPayloadPreview payload={formPayload} />
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
