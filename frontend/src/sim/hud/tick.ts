import { useSyncExternalStore } from 'react'
import type { Tick } from '../director'

/**
 * O relógio do ensaio chega do diretor algumas vezes por segundo. Só as peças que mostram o tempo
 * (telemetria e transporte) assinam esta loja; o resto da tela não re-renderiza a cada tique.
 */
export interface TickStore {
  get: () => Tick
  set: (tick: Tick) => void
  subscribe: (notify: () => void) => () => void
}

export function createTickStore(): TickStore {
  let current: Tick = { t: 0, playing: false, ended: false }
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (tick) => {
      current = tick
      for (const notify of listeners) notify()
    },
    subscribe: (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
  }
}

export const useTick = (store: TickStore): Tick => useSyncExternalStore(store.subscribe, store.get)
