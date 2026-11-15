/** Comparação por séries do explorador livre (porte de `spaceapps.data`). */

import type { Cell, Dataset, Row } from '@/api/types'
import { t } from '@/lib/i18n'
import { compareCells, groupBy, mean, median, numbers } from './data'

export const AGGREGATIONS = {
  média: mean,
  soma: (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) : null),
  mediana: median,
  mínimo: (v: number[]) => (v.length ? Math.min(...v) : null),
  máximo: (v: number[]) => (v.length ? Math.max(...v) : null),
} satisfies Record<string, (values: number[]) => number | null>

export type Aggregation = keyof typeof AGGREGATIONS

/** O nome de cada agregação na tela; a chave continua a mesma nos dois idiomas. */
export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  média: t('mean', 'média'),
  soma: t('sum', 'soma'),
  mediana: t('median', 'mediana'),
  mínimo: t('minimum', 'mínimo'),
  máximo: t('maximum', 'máximo'),
}

/** Acima disso uma coluna de texto deixa de ser útil como dimensão de comparação. */
export const MAX_CATEGORIES = 500

export function numericColumns(data: Dataset): string[] {
  return data.columns.filter((c) => c.kind === 'number').map((c) => c.name)
}

/** Colunas de texto com cardinalidade baixa o bastante para comparar. */
export function categoryColumns(data: Dataset): string[] {
  return data.columns
    .filter((c) => c.kind === 'string')
    .filter((c) => new Set(data.rows.map((r) => r[c.name])).size <= MAX_CATEGORIES)
    .map((c) => c.name)
}

/** Numérica ou temporal: dá para ligar os pontos numa linha. */
export function isOrdered(data: Dataset, column: string): boolean {
  const kind = data.columns.find((c) => c.name === column)?.kind
  return kind === 'number' || kind === 'date' || kind === 'datetime'
}

/** Tabela longa (x, by, measure) com a medida agregada por entidade e por x. */
export function compare(
  rows: readonly Row[],
  opts: { by: string; entities: readonly Cell[]; x: string; measure: string; agg: Aggregation },
): Row[] {
  const { by, entities, x, measure, agg } = opts
  const wanted = new Set(entities)
  const kept = rows.filter((r) => wanted.has(r[by] ?? null))
  const groups = groupBy(kept, (r) => JSON.stringify([r[x] ?? null, r[by] ?? null]))
  const out: Row[] = []
  for (const list of groups.values()) {
    const first = list[0]!
    out.push({
      [x]: first[x] ?? null,
      [by]: first[by] ?? null,
      [measure]: AGGREGATIONS[agg](numbers(list.map((r) => r[measure]))),
    })
  }
  return out.sort((a, b) => compareCells(a[x] ?? null, b[x] ?? null) || compareCells(a[by] ?? null, b[by] ?? null))
}

/** Resumo por entidade: pontos, extremos, média e primeiro/último valor em x. */
export function summarize(table: readonly Row[], opts: { by: string; x: string; measure: string }): Row[] {
  const { by, x, measure } = opts
  const sorted = [...table].sort((a, b) => compareCells(a[x] ?? null, b[x] ?? null))
  const out: Row[] = []
  for (const [entity, list] of groupBy(sorted, (r) => r[by] ?? null)) {
    const all = list.map((r) => r[measure] ?? null)
    const values = numbers(all)
    out.push({
      [by]: entity,
      [t('points', 'pontos')]: values.length,
      [t('minimum', 'mínimo')]: values.length ? Math.min(...values) : null,
      [t('maximum', 'máximo')]: values.length ? Math.max(...values) : null,
      [t('mean', 'média')]: mean(values),
      [t('first', 'primeiro')]: all[0] ?? null,
      [t('last', 'último')]: all.at(-1) ?? null,
    })
  }
  return out.sort((a, b) => compareCells(a[by] ?? null, b[by] ?? null))
}
