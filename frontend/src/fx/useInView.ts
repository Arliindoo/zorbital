import { useEffect, useRef, useState } from 'react'
import { introReleased } from './intro'

/** Liga uma vez, quando o elemento entra na tela: é o gatilho das animações de entrada. */
export function useInView<T extends Element>(margin = '0px 0px -12% 0px'): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || on) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true)
          observer.disconnect()
        }
      },
      { rootMargin: margin },
    )
    // só começa a observar depois que a abertura da logo libera a tela (fx/intro.ts)
    let cancelled = false
    introReleased.then(() => cancelled || observer.observe(node))
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [on, margin])
  return [ref, on]
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
