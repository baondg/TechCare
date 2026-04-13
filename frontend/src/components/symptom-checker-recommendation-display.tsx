import { AlertCircle, HeartPulse, ListChecks } from "lucide-react"

type SymptomItem = { name?: string; severity?: string; duration?: string }
type ConditionItem = { disease?: string; probability?: string; reason?: string }

type ParsedSymptomPayload = {
  symptoms?: SymptomItem[]
  possible_conditions?: ConditionItem[]
  recommended_action?: string
}

function tryParseSymptomCheckerJson(raw: string): ParsedSymptomPayload | null {
  const t = String(raw || "").trim()
  if (!t.startsWith("{")) return null
  try {
    const o = JSON.parse(t) as unknown
    if (!o || typeof o !== "object") return null
    const obj = o as Record<string, unknown>
    const has =
      Array.isArray(obj.symptoms) ||
      Array.isArray(obj.possible_conditions) ||
      typeof obj.recommended_action === "string"
    if (!has) return null
    return obj as ParsedSymptomPayload
  } catch {
    return null
  }
}

/** Turn values like "moderate", "1to3days", "medium" into readable labels. */
function humanizeToken(s: string | undefined): string {
  if (!s) return "—"
  let x = s.replace(/_/g, " ").trim()
  x = x.replace(/(\d)\s*to\s*(\d)/gi, "$1–$2")
  x = x.replace(/(\d)([a-z])/gi, "$1 $2")
  x = x.replace(/([a-z])(\d)/gi, "$1 $2")
  return x.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Renders symptom-checker AI payloads (symptoms / possible_conditions / recommended_action)
 * when `content` is JSON; otherwise falls back to plain text.
 */
export function SymptomCheckerRecommendationDisplay({ content }: { content: string }) {
  const data = tryParseSymptomCheckerJson(content)
  if (!data) {
    return (
      <p className="text-slate-900 leading-relaxed whitespace-pre-wrap break-words">{content}</p>
    )
  }

  const symptoms = Array.isArray(data.symptoms) ? data.symptoms : []
  const conditions = Array.isArray(data.possible_conditions) ? data.possible_conditions : []
  const action = typeof data.recommended_action === "string" ? data.recommended_action.trim() : ""

  const hasStructured = symptoms.length > 0 || conditions.length > 0 || Boolean(action)

  if (!hasStructured) {
    return (
      <p className="text-slate-900 leading-relaxed whitespace-pre-wrap break-words">{content}</p>
    )
  }

  return (
    <div className="space-y-5 text-sm text-slate-800">
      {symptoms.length > 0 ? (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <HeartPulse className="h-3.5 w-3.5 shrink-0 text-cyan-600" aria-hidden />
            Symptoms you reported
          </h4>
          <ul className="space-y-2">
            {symptoms.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
              >
                <span className="font-semibold text-slate-900">{s.name?.trim() || "Symptom"}</span>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  {s.severity ? (
                    <span>
                      Severity:{" "}
                      <span className="font-medium text-slate-800">{humanizeToken(s.severity)}</span>
                    </span>
                  ) : null}
                  {s.duration ? (
                    <span>
                      Duration:{" "}
                      <span className="font-medium text-slate-800">{humanizeToken(s.duration)}</span>
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {conditions.length > 0 ? (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <ListChecks className="h-3.5 w-3.5 shrink-0 text-cyan-600" aria-hidden />
            Possible conditions
          </h4>
          <div className="space-y-3">
            {conditions.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-cyan-100 bg-cyan-50/50 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {c.disease?.trim() || "Condition"}
                  </span>
                  {c.probability ? (
                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-cyan-900 ring-1 ring-cyan-200">
                      {humanizeToken(c.probability)} likelihood
                    </span>
                  ) : null}
                </div>
                {c.reason?.trim() ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-700">{c.reason.trim()}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {action ? (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
            Recommended next steps
          </h4>
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 text-sm leading-relaxed text-slate-900">
            {action}
          </div>
        </div>
      ) : null}
    </div>
  )
}
