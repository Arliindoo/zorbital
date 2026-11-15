/** Operações pequenas sobre linhas já carregadas: filtros, extremos e agrupamentos das páginas. */

import type { Cell, Row } from '@/api/types'

export type Range = readonly [number, number]

const collator = new Intl.Collator('pt-BR', { numeric: true })

export function compareCells(a: Cell, b: Cell): number {
  if (a === b) return 0
  if (a === null) return 1 // vazios por último
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

/** Valores distintos, sem vazios, em ordem. */
export function uniqueSorted<T extends Cell>(values: Iterable<T>): Exclude<T, null>[] {
  const set = new Set<Exclude<T, null>>()
  for (const v of values) if (v !== null && v !== undefined) set.add(v as Exclude<T, null>)
  return [...set].sort(compareCells)
}

/** Valores distintos na ordem em que aparecem (como `dict.fromkeys` no Python). */
export function uniqueInOrder<T>(values: Iterable<T>): T[] {
  return [...new Set(values)]
}

export function numbers(values: Iterable<Cell | undefined>): number[] {
  const out: number[] = []
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) out.push(v)
  return out
}

export function extent(values: Iterable<Cell | undefined>): Range | null {
  const nums = numbers(values)
  if (!nums.length) return null
  return [Math.min(...nums), Math.max(...nums)]
}

/** Dentro da faixa; vazio passa (o filtro de faixa não esconde quem não tem o valor). */
export function inRangeOrNull(value: Cell | undefined, range: Range | null): boolean {
  if (!range || value === null || value === undefined) return true
  return typeof value === 'number' && value >= range[0] && value <= range[1]
}

export function inRange(value: Cell | undefined, range: Range | null): boolean {
  if (!range) return true
  return typeof value === 'number' && value >= range[0] && value <= range[1]
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

export function round(value: number | null, digits: number): number | null {
  if (value === null) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}

export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = groups.get(k)
    if (list) list.push(row)
    else groups.set(k, [row])
  }
  return groups
}

export function omit<T extends Row>(rows: readonly T[], drop: readonly string[]): Row[] {
  const skip = new Set(drop)
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !skip.has(k))))
}

export function count(values: Iterable<unknown>, predicate: (v: unknown) => boolean = (v) => v !== null): number {
  let n = 0
  for (const v of values) if (predicate(v)) n++
  return n
}
