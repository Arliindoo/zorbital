import { type Dispatch, type SetStateAction, useCallback, useState } from 'react'
import { session } from './storage'

/**
 * `useState` que sobrevive a trocar de página e voltar (sessionStorage): os filtros continuam onde
 * a pessoa deixou. Só para valores JSON.
 */
export function usePageState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const saved = session.get<T>(`filtro:${key}`)
    if (saved !== null) return saved
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) =>
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        session.set(`filtro:${key}`, resolved)
        return resolved
      }),
    [key],
  )
  return [value, set]
}
