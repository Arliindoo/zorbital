import type { LegendItem } from '@/shared/charts/scale'
import type { XYSeries } from '@/shared/charts/XYChart'

const MARK: Record<XYSeries['type'], LegendItem['mark']> = { points: 'dot', line: 'line', bars: 'bar', band: 'band' }
export const legendItems = (series: readonly XYSeries[]): LegendItem[] =>
  series.map((s) => ({
    name: s.name,
    color: s.color,
    mark: s.type === 'line' && s.dashed ? 'dash' : s.type === 'points' && s.symbol && s.symbol !== 'circle' ? s.symbol : MARK[s.type],
  }))
