import type { CfiRow, Row } from '@/shared/api/types'

const FLAMES = [
  ['dext_quente_mm', 'Chama quente'],
  ['dext_fria_mm', 'Chama fria'],
] as const

/** Um ponto por ensaio e por tipo de chama (formato longo), com as colunas pedidas. */
export function flamesLong(rows: readonly CfiRow[], keep: readonly string[], { dropEmpty = true } = {}): Row[] {
  const out: Row[] = []
  for (const [column, flame] of FLAMES) {
    for (const r of rows) {
      const dext = r[column]
      if (dropEmpty && dext === null) continue
      const row: Row = Object.fromEntries(keep.map((k) => [k, r[k] ?? null]))
      row.dext_mm = dext
      row.tipo_chama = flame
      out.push(row)
    }
  }
  return out
}
