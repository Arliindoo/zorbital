/** Base dos gráficos em SVG: medida do contêiner, escalas, curvas e tipos compartilhados. */

import { type CSSProperties, useEffect, useId, useRef, useState } from 'react'
import { g } from '@/lib/format'

export function useWidth<T extends HTMLElement>(initial = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry!.contentRect.width)
      if (w > 0) setWidth(w)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/** Id estável e seguro para `url(#…)` (gradientes, recortes). */
export function useSvgId(prefix: string): string {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, '')
}

export type Scale = (value: number) => number
export const scale =
  (d0: number, d1: number, r0: number, r1: number): Scale =>
  (v) =>
    r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0)

/** Limites e marcas "redondos" (1, 2, 5 × 10ⁿ) cobrindo [min, max]. */
export function nice(min: number, max: number, count = 5): { lo: number; hi: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] }
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)))
  return { lo, hi, ticks }
}

export const tick = (v: number): string => (Math.abs(v) >= 10000 ? `${g(v / 1000)}k` : g(v))

/** Curva suave que não ultrapassa os pontos (cúbica monótona em x). */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  const n = points.length
  if (n < 3) return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('')
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1]![0] - points[i]![0])
    slope.push((points[i + 1]![1] - points[i]![1]) / (dx[i] || 1))
  }
  const m: number[] = [slope[0]!]
  for (let i = 1; i < n - 1; i++) m.push(slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2)
  m.push(slope[n - 2]!)
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i]! / slope[i]!
    const b = m[i + 1]! / slope[i]!
    const h = Math.hypot(a, b)
    if (h > 3) {
      m[i] = (3 * a * slope[i]!) / h
      m[i + 1] = (3 * b * slope[i]!) / h
    }
  }
  let d = `M${points[0]![0]},${points[0]![1]}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!
    const [x1, y1] = points[i + 1]!
    const h = dx[i]! / 3
    d += `C${x0 + h},${y0 + m[i]! * h} ${x1 - h},${y1 - m[i + 1]! * h} ${x1},${y1}`
  }
  return d
}

export const linePath = (points: readonly (readonly [number, number])[]): string =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')

/** Atraso de entrada em ms, lido pelo CSS (`--d`). */
export const delay = (ms: number): CSSProperties => ({ '--d': Math.round(ms) }) as CSSProperties

export interface TipData {
  x: number
  y: number
  title: string
  color?: string
  rows: readonly (readonly [string, string])[]
}


export interface LegendItem {
  name: string
  color: string
  mark?: 'dot' | 'line' | 'dash' | 'bar' | 'band' | 'diamond' | 'square'
}
