export type ErrorToastEvent = {
  id: number
  message: string
}

type Listener = (event: ErrorToastEvent) => void

let seq = 0
const listeners = new Set<Listener>()

export function emitErrorToast(message: string) {
  const text = String(message || "").trim()
  if (!text) return
  seq += 1
  const event: ErrorToastEvent = { id: seq, message: text }
  for (const listener of listeners) {
    listener(event)
  }
}

export function subscribeErrorToast(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
