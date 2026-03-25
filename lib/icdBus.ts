import type { ICDBillingCodeResponse } from './api'

type ICDEvent =
  | { kind: 'codes'; payload: ICDBillingCodeResponse }
  | { kind: 'search'; payload: Array<{ code?: string; description?: string; intent?: string }> }

type Listener = (ev: ICDEvent) => void

const listeners = new Set<Listener>()

export const icdBus = {
  subscribe: (fn: Listener) => {
    listeners.add(fn)
    return () => { listeners.delete(fn); }
  },
  emitCodes: (payload: ICDBillingCodeResponse) => {
    const ev: ICDEvent = { kind: 'codes', payload }
    listeners.forEach((l) => l(ev))
  },
  emitSearch: (payload: Array<{ code?: string; description?: string; intent?: string }>) => {
    const ev: ICDEvent = { kind: 'search', payload }
    listeners.forEach((l) => l(ev))
  }
}

export default icdBus
