import type { Cell } from '@/api/types'

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 6 })

/** Como o `%g` do Python: até 6 algarismos significativos, sem zeros à direita. */
export function g(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Number.isInteger(value) && Math.abs(value) >= 1e6 ? integer.format(value) : decimal.format(value)
}

export function fixed(value: number | null | undefined, digits: number, signed = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const text = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value)
  return text
}

export function int(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : integer.format(value)
}

export function span(range: readonly [number, number] | null, digits?: number): string {
  if (!range) return '—'
  const f = (v: number) => (digits === undefined ? g(v) : fixed(v, digits))
  return `${f(range[0])}–${f(range[1])}`
}

/** Texto de uma célula qualquer, para tabelas e para o CSV. */
export function cell(value: Cell | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'sim' : 'não'
  if (typeof value === 'number') return g(value)
  return value
}
