/**
 * Séries dos gráficos do painel: cada função recebe linhas do banco e devolve camadas do XYChart.
 * São funções puras (sem React).
 */

import type { Cell, Row } from '@/api/types'
import { compareCells, groupBy, median, uniqueInOrder } from '@/lib/data'
import { fixed, g } from '@/lib/format'
import { t } from '@/lib/i18n'
import { DOMAIN_ORDER, type DomainColumn, domainColors, MAX_SERIES, SERIES } from './colors'
import type { XYPoint, XYSeries } from './XYChart'
import { td } from '@/lib/i18n-data'

const num = (v: Cell | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: Cell | undefined): string =>
  v === null || v === undefined ? '—' : typeof v === 'number' ? g(v) : typeof v === 'boolean' ? (v ? t('yes', 'sim') : t('no', 'não')) : td(v)
const xValue = (v: Cell | undefined): number | string => (typeof v === 'number' ? v : text(v))

/** Dispersão com cor por categoria do domínio; as colunas de `hover` entram no tooltip. */
export function scatterBy(
  rows: readonly Row[],
  opts: { x: string; y: string; color: DomainColumn; labels: Record<string, string>; hover: string[] },
): XYSeries[] {
  const { x, y, color, labels, hover } = opts
  const colors = domainColors(color)
  const groups = groupBy(rows, (r) => String(r[color] ?? ''))
  const known: readonly string[] = DOMAIN_ORDER[color]
  const order = [...known.filter((v) => groups.has(v)), ...[...groups.keys()].filter((v) => !known.includes(v))]
  const extra = hover.filter((h) => h !== x && h !== y)
  return order.map((name, i) => ({
    name,
    color: colors[name] ?? SERIES[i % MAX_SERIES]!,
    type: 'points',
    data: groups
      .get(name)!
      .filter((r) => num(r[x]) !== null && num(r[y]) !== null)
      .map((r) => ({ x: r[x] as number, y: r[y] as number, tip: extra.map((h) => [labels[h] ?? h, text(r[h])] as const) })),
  }))
}

/** Faixa de incerteza por pressão (uma cápsula vertical por condição). */
function band(rows: readonly Row[], x: string, lo: string, hi: string): XYPoint[] {
  return rows
    .filter((r) => num(r[lo]) !== null && num(r[hi]) !== null)
    .map((r) => ({ x: r[x] as number, y: null, lo: r[lo] as number, hi: r[hi] as number }))
}

/**
 * Diâmetro de extinção por pressão: medição em pontos, modelo em linha tracejada e a faixa
 * de incerteza informada como cápsula vertical. A cor é o tipo de chama.
 */
export function measuredVsModel(points: readonly Row[], comparison: readonly Row[]): XYSeries[] {
  const colors = domainColors('tipo_chama')
  const out: XYSeries[] = []
  for (const flame of DOMAIN_ORDER.tipo_chama) {
    const color = colors[flame]!
    const segments = band(
      comparison.filter((r) => r.tipo_chama === flame),
      'pressao_atm',
      'limite_inferior_mm',
      'limite_superior_mm',
    )
    if (segments.length) out.push({ name: t(`${td(flame)} · reported range`, `${flame} · faixa informada`), color, type: 'band', data: segments })
    const rows = points
      .filter((r) => r.tipo_chama === flame)
      .sort((a, b) => compareCells(a.pressao_atm ?? null, b.pressao_atm ?? null))
    const toPoint = (r: Row): XYPoint => ({ x: r.pressao_atm as number, y: num(r.diametro_extincao_mm) })
    const model = rows.filter((r) => r.serie === 'Modelo')
    if (model.length)
      out.push({ name: t(`${td(flame)} · model`, `${flame} · modelo`), color, type: 'line', dashed: true, markers: true, symbol: 'diamond', data: model.map(toPoint) })
    const measured = rows.filter((r) => r.serie === 'Medição')
    if (measured.length) out.push({ name: t(`${td(flame)} · measurement`, `${flame} · medição`), color, type: 'points', size: 5, data: measured.map(toPoint) })
  }
  return out
}

/** Uma linha por série, na ordem em que as séries aparecem (cor fixa por posição). */
export function xyLines(
  rows: readonly Row[],
  opts: { x: string; y: string; series: string; markers?: boolean; area?: boolean },
): XYSeries[] {
  const { x, y, series, markers = true, area = false } = opts
  const names = uniqueInOrder(rows.map((r) => String(r[series] ?? ''))).slice(0, MAX_SERIES)
  const groups = groupBy(rows, (r) => String(r[series] ?? ''))
  return names.map((name, i) => ({
    name,
    color: SERIES[i]!,
    type: 'line',
    markers: markers && groups.get(name)!.length <= 60,
    area,
    data: groups
      .get(name)!
      .filter((r) => num(r[x]) !== null && num(r[y]) !== null)
      .map((r) => ({ x: r[x] as number, y: r[y] as number })),
  }))
}

/** Linhas quando x é ordenado (tempo, número); barras agrupadas quando é categoria. */
export function comparisonSeries(
  rows: readonly Row[],
  opts: { x: string; measure: string; by: string; slots: Record<string, number>; ordered: boolean },
): XYSeries[] {
  const { x, measure, by, slots, ordered } = opts
  const groups = groupBy(rows, (r) => String(r[by] ?? ''))
  return Object.keys(slots)
    .sort((a, b) => slots[a]! - slots[b]!)
    .filter((e) => groups.has(e))
    .map((entity) => ({
      name: entity,
      color: SERIES[slots[entity]!]!,
      type: ordered ? 'line' : 'bars',
      markers: ordered && groups.get(entity)!.length <= 40,
      data: groups.get(entity)!.map((r) => ({ x: xValue(r[x]), y: num(r[measure]) })),
    }))
}

export interface FlamePanel {
  flame: string
  series: XYSeries[]
}

/**
 * Diâmetro de extinção por pressão, um painel por tipo de chama (mesma escala nos dois).
 * `cfi`: um ensaio por linha (tipo_chama, pressao_atm, dext_mm, teste_id, d0_mm).
 * `psi`: v_psi117_comparacao (medido, modelo e faixa por pressão).
 */
export function c12Comparison(cfi: readonly Row[], psi: readonly Row[]): { panels: FlamePanel[]; yDomain: [number, number] } {
  const flames = ['Chama quente', 'Chama fria'] as const
  let top = 0
  const panels = flames.map((flame) => {
    const tests = cfi.filter((r) => r.tipo_chama === flame && num(r.dext_mm) !== null)
    const byPressure = [...groupBy(tests, (r) => r.pressao_atm as number).entries()].sort((a, b) => a[0] - b[0])
    const ref = psi
      .filter((r) => r.tipo_chama === flame)
      .sort((a, b) => compareCells(a.pressao_atm ?? null, b.pressao_atm ?? null))
    const segments = band(ref, 'pressao_atm', 'limite_inferior_mm', 'limite_superior_mm')
    const series: XYSeries[] = [
      { name: t('PSI-117 · reported range', 'PSI-117 · faixa informada'), color: SERIES[2], type: 'band', data: segments },
      {
        name: t('CFI · test (ISS)', 'CFI · ensaio (ISS)'),
        color: SERIES[3],
        type: 'points',
        size: 3.5,
        opacity: 0.6,
        data: tests.map((r) => ({
          x: r.pressao_atm as number,
          y: r.dext_mm as number,
          tip: [
            [t('Test', 'Ensaio'), text(r.teste_id)],
            ['D0', `${fixed(num(r.d0_mm), 2)} mm`],
          ] as const,
        })),
      },
      // só marcadores: as pressões são condições separadas, e com poucos ensaios uma linha sugeriria
      // uma tendência que os dados não sustentam. O n de cada mediana vai no tooltip.
      {
        name: t('CFI · median', 'CFI · mediana'),
        color: SERIES[3],
        type: 'points',
        symbol: 'square',
        size: 5.5,
        data: byPressure.map(([p, list]) => ({
          x: p,
          y: median(list.map((r) => r.dext_mm as number)),
          tip: [[t('Tests', 'Ensaios'), String(list.length)]] as const,
        })),
      },
      {
        name: t('PSI-117 · measurement', 'PSI-117 · medição'),
        color: SERIES[2],
        type: 'points',
        symbol: 'diamond',
        size: 5,
        data: ref.map((r) => ({ x: r.pressao_atm as number, y: num(r.medido_mm) })),
      },
      {
        name: t('PSI-117 · model', 'PSI-117 · modelo'),
        color: SERIES[0],
        type: 'line',
        dashed: true,
        data: ref.map((r) => ({ x: r.pressao_atm as number, y: num(r.modelo_mm) })),
      },
    ]
    for (const s of series) for (const p of s.data) top = Math.max(top, p.y ?? 0, p.hi ?? 0)
    return { flame, series: series.filter((s) => s.data.length > 0) }
  })
  return { panels, yDomain: [0, top * 1.06] }
}

/**
 * Cor = combustível (a mesma em todas as páginas); medição em pontos, modelo em linha tracejada.
 * Medições não são ligadas: cada ponto é uma gota diferente.
 */
export function measuredModelByFuel(rows: readonly Row[], opts: { x: string; y: string }): XYSeries[] {
  const { x, y } = opts
  const colors = domainColors('combustivel')
  const present = new Set(rows.map((r) => r.combustivel))
  const out: XYSeries[] = []
  for (const fuel of DOMAIN_ORDER.combustivel.filter((f) => present.has(f))) {
    const part = rows.filter((r) => r.combustivel === fuel && num(r[x]) !== null && num(r[y]) !== null)
    const toPoint = (r: Row): XYPoint => ({ x: r[x] as number, y: r[y] as number })
    const model = part.filter((r) => r.serie === 'Modelo').sort((a, b) => compareCells(a[x] ?? null, b[x] ?? null))
    const measured = part.filter((r) => r.serie === 'Medição')
    if (model.length) out.push({ name: t(`${fuel} · model`, `${fuel} · modelo`), color: colors[fuel]!, type: 'line', dashed: true, data: model.map(toPoint) })
    if (measured.length) out.push({ name: t(`${fuel} · measurement`, `${fuel} · medição`), color: colors[fuel]!, type: 'points', data: measured.map(toPoint) })
  }
  return out
}
