import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { int } from '@/lib/format'
import { locale, t } from '@/lib/i18n'
import type { ScreenDigest } from './types'

const plural = (n: number, one: string, many: string) => `${int(n)} ${n === 1 ? one : many}`

/** "7 blocos · 2 gráficos · 312 linhas · 4 filtros": o que segue junto com a pergunta. */
export function digestText(d: ScreenDigest): string {
  const parts: string[] = []
  if (d.blocos) parts.push(plural(d.blocos, t('block', 'bloco'), t('blocks', 'blocos')))
  if (d.graficos) parts.push(plural(d.graficos, t('chart', 'gráfico'), t('charts', 'gráficos')))
  if (d.linhas !== null) parts.push(plural(d.linhas, t('row', 'linha'), t('rows', 'linhas')))
  parts.push(d.filtros ? plural(d.filtros, t('filter', 'filtro'), t('filters', 'filtros')) : t('no filters', 'sem filtros'))
  return parts.join(' · ')
}

const oneDecimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export function seconds(ms: number): string {
  return `${oneDecimal.format(ms / 1000)} s`
}

const cost = new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 })
/** Custo em ZYT com três algarismos significativos (o recibo não precisa de mais). */
export function zyt(value: number): string {
  return cost.format(value)
}

export function clock(at: number): string {
  return new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

/** `flex_agrupar(por=desfecho)` → nome e argumentos separados; o sufixo " · erro" vira um aviso. */
export function parseTool(label: string): { name: string; args: string; failed: boolean } {
  const failed = label.endsWith(' · erro')
  const clean = failed ? label.slice(0, -' · erro'.length) : label
  const open = clean.indexOf('(')
  if (open < 0) return { name: clean, args: '', failed }
  return { name: clean.slice(0, open), args: clean.slice(open + 1).replace(/\)$/, ''), failed }
}

function subscribeMedia(query: string) {
  return (notify: () => void) => {
    const media = window.matchMedia(query)
    media.addEventListener('change', notify)
    return () => media.removeEventListener('change', notify)
  }
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/** Cronômetro da execução: corre enquanto `final` é null e congela no valor final. */
export function useElapsed(startedAt: number, final: number | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (final !== null) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [final, startedAt])
  return seconds(final ?? Math.max(0, now - startedAt))
}

const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789_=()·'

/** Texto que se "decifra" ao mudar: os caracteres embaralhados assentam da esquerda para a direita. */
export function useScramble(text: string, enabled = true): string {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(text)
  const frame = useRef(0)
  const active = enabled && !reduced
  useEffect(() => {
    if (!active) return
    const started = performance.now()
    const duration = Math.min(520, 180 + text.length * 9)
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      const settled = Math.floor(text.length * t)
      let out = text.slice(0, settled)
      for (let i = settled; i < text.length; i++) {
        const ch = text[i]!
        out += ch === ' ' || i > settled + 14 ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      }
      setShown(out)
      if (t < 1) frame.current = window.requestAnimationFrame(step)
    }
    frame.current = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame.current)
  }, [text, active])
  return active ? shown : text
}

/** Conta até o valor novo em vez de saltar (numeral do núcleo). */
export function useCountUp(value: number): number {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reduced) {
      from.current = value
      return
    }
    const start = from.current
    const started = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / 420)
      const eased = 1 - (1 - t) ** 3
      const next = Math.round(start + (value - start) * eased)
      from.current = next
      setShown(next)
      if (t < 1) frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [value, reduced])
  return reduced ? value : shown
}
