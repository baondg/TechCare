export type ToastEvent = {
  id: number
  message: string
}

type Listener = (event: ToastEvent) => void

let seq = 0

function createToastBus() {
  const listeners = new Set<Listener>()
  return {
    emit(message: string) {
      const text = String(message || "").trim()
      if (!text) return
      seq += 1
      const event: ToastEvent = { id: seq, message: text }
      for (const listener of listeners) {
        listener(event)
      }
    },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const errorBus = createToastBus()
const successBus = createToastBus()

export const emitErrorToast = errorBus.emit
export const subscribeErrorToast = errorBus.subscribe
export const emitSuccessToast = successBus.emit
export const subscribeSuccessToast = successBus.subscribe
