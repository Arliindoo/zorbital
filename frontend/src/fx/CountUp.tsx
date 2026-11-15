import { useEffect, useState } from 'react'
import { locale } from '@/lib/i18n'
import { reducedMotion, useInView } from './useInView'

const easeOut = (t: number) => 1 - (1 - t) ** 4

/** Número que sobe de zero até o valor quando aparece na tela. */
export function CountUp({
  value,
  digits = 0,
  duration = 1400,
  delay = 0,
}: {
  value: number
  digits?: number
  duration?: number
  delay?: number
}) {
  const [ref, on] = useInView<HTMLSpanElement>('0px')
  const [still] = useState(reducedMotion)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!on || still) return
    let frame = 0
    const start = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      setProgress(easeOut(t))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [on, still, duration, delay])
  const shown = still ? value : value * progress
  return (
    <span ref={ref} className="num" aria-label={value.toLocaleString(locale, { maximumFractionDigits: digits })}>
      {shown.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}
    </span>
  )
}
