export type SuccessToastEvent = {
  id: number
  message: string
}

type Listener = (event: SuccessToastEvent) => void

let seq = 0
const listeners = new Set<Listener>()

export function emitSuccessToast(message: string) {
  const text = String(message || "").trim()
  if (!text) return
  seq += 1
  const event: SuccessToastEvent = { id: seq, message: text }
  for (const listener of listeners) {
    listener(event)
  }
}

export function subscribeSuccessToast(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
