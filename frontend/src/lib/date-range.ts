import { format, isValid, parse } from "date-fns"

export function formatDdMmYyyyInput(raw: string): string {
  const digits = String(raw || "")
    .replace(/\D/g, "")
    .slice(0, 8)

  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function parseDdMmYyyyStrict(value: string): Date | undefined {
  const v = String(value || "")
  if (!v) return undefined

  const parsed = parse(v, "dd/MM/yyyy", new Date())
  if (!isValid(parsed)) return undefined
  if (format(parsed, "dd/MM/yyyy") !== v) return undefined
  return parsed
}

export function isAfter(a?: Date, b?: Date): boolean {
  if (!a || !b) return false
  return a.getTime() > b.getTime()
}

export function isBefore(a?: Date, b?: Date): boolean {
  if (!a || !b) return false
  return a.getTime() < b.getTime()
}

type RangeEditResult = { nextText: string; nextValue?: Date }

/**
 * Apply typing changes to a dd/MM/yyyy input that backs a Date range (From/To).
 * If the user completes a date that would invert the range, the edit is rejected (no state update).
 */
export function applyDdMmYyyyRangeTyping(opts: {
  prevText: string
  rawInput: string
  otherValue?: Date
  kind: "from" | "to"
}): RangeEditResult | null {
  const nextText = formatDdMmYyyyInput(opts.rawInput)

  if (nextText === "") return { nextText: "", nextValue: undefined }
  if (nextText.length !== 10) return { nextText, nextValue: undefined }

  const nextValue = parseDdMmYyyyStrict(nextText)
  if (!nextValue) return { nextText, nextValue: undefined }

  if (opts.kind === "from" && isAfter(nextValue, opts.otherValue)) return null
  if (opts.kind === "to" && isBefore(nextValue, opts.otherValue)) return null

  return { nextText, nextValue }
}


