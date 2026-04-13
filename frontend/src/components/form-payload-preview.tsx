"use client"

import { Fragment, type ReactNode } from "react"
import { cn } from "@/lib/utils"

const LABELS: Record<string, string> = {
  portalVersion: "Portal version",
  recordedAt: "Recorded at",
  toHospitalName: "Destination (form)",
  toHospitalId: "Hospital ref (form)",
  clinicalSummary: "Clinical summary",
  keyFindings: "Key findings",
  keyTestsSummary: "Key tests summary",
  treatmentsProvided: "Treatments provided",
  conditionAtTransfer: "Condition at transfer",
  transferObjective: "Transfer objective",
  escortInfo: "Escort / transport",
  version: "Form version",
  createdAt: "Created at (payload)",
  ms: "MS",
  admissionNo: "Admission no.",
  note: "Form note",
  recordIds: "Linked health record IDs",
}

function humanizeKey(key: string): string {
  const s = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")
  return s.replace(/^\s+/, "").replace(/\b\w/g, (c) => c.toUpperCase())
}

function labelFor(key: string): string {
  return LABELS[key] ?? humanizeKey(key)
}

function formatScalar(v: unknown): string {
  if (v == null) return "—"
  if (typeof v === "boolean") return v ? "Yes" : "No"
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  if (typeof v === "string") {
    const t = v.trim()
    return t || "—"
  }
  return String(v)
}

function NestedFields({ obj, depth }: { obj: Record<string, unknown>; depth: number }) {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <dl
      className={cn(
        "grid gap-x-2 gap-y-0.5 border-l border-border/50 pl-2",
        depth <= 1 ? "grid-cols-[minmax(0,7.5rem)_1fr] text-[9px]" : "grid-cols-1 text-[9px]"
      )}
    >
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="text-muted-foreground">{labelFor(k)}</dt>
          <dd className="min-w-0 break-words text-foreground">
            <ValueCell value={v} depth={depth} />
          </dd>
        </Fragment>
      ))}
    </dl>
  )
}

function ValueCell({ value, depth }: { value: unknown; depth: number }): ReactNode {
  if (value == null) return "—"
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span className="whitespace-pre-wrap">{formatScalar(value)}</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—"
    const primitive = value.every(
      (x) => x === null || ["string", "number", "boolean"].includes(typeof x)
    )
    if (primitive) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, i) => (
            <span
              key={i}
              className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-foreground"
            >
              {formatScalar(item)}
            </span>
          ))}
        </div>
      )
    }
    return (
      <ul className="list-inside list-disc space-y-0.5 text-[9px] text-foreground">
        {value.slice(0, 12).map((item, i) => (
          <li key={i} className="break-words">
            <ValueCell value={item} depth={depth + 1} />
          </li>
        ))}
        {value.length > 12 ? <li className="text-muted-foreground">… +{value.length - 12} more</li> : null}
      </ul>
    )
  }
  if (typeof value === "object" && depth < 5) {
    return <NestedFields obj={value as Record<string, unknown>} depth={depth + 1} />
  }
  return <span className="text-[9px] text-muted-foreground">… (nested — open PDF for full detail)</span>
}

/** Renders EMR `form_payload` as compact labeled fields (no raw JSON block). */
export function FormPayloadPreview({
  payload,
  className,
}: {
  payload: Record<string, unknown> | null | undefined
  className?: string
}) {
  if (!payload || typeof payload !== "object") return null
  const keys = Object.keys(payload)
  if (keys.length === 0) return null

  return (
    <div className={cn("mt-2 border-t border-border/50 pt-2", className)}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Additional form details
      </p>
      <dl className="grid grid-cols-[minmax(0,8.5rem)_1fr] gap-x-2 gap-y-1 text-[10px] leading-snug">
        {keys.map((key) => {
          const v = payload[key]
          if (v === undefined) return null
          return (
            <Fragment key={key}>
              <dt className="shrink-0 text-muted-foreground">{labelFor(key)}</dt>
              <dd className="min-w-0 break-words">
                <ValueCell value={v} depth={0} />
              </dd>
            </Fragment>
          )
        })}
      </dl>
    </div>
  )
}
