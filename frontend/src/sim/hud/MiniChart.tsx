import { useMemo } from 'react'
import { g } from '@/lib/format'
import type { MiniChart as Spec } from '../types'

const W = 232
const H = 104
const PAD = { l: 30, r: 8, t: 8, b: 20 }

function extent(values: number[], zero: boolean): [number, number] {
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (zero) lo = Math.min(0, lo)
  if (hi - lo < 1e-9) hi = lo + 1
  return [lo, hi]
}

const tick = (v: number) => g(Number(v.toPrecision(3)))

/** Gráfico pequeno do painel de telemetria; o cursor acompanha o relógio do ensaio. */
export function MiniChart({ spec, t }: { spec: Spec; t: number }) {
  // escalas e curvas só mudam com o ensaio; a cada tique só o cursor é redesenhado
  const base = useMemo(() => {
    const xs = spec.series.flatMap((s) => s.points.map((p) => p[0]))
    const ys = spec.series.flatMap((s) => s.points.map((p) => p[1]))
    if (!xs.length) return null
    const [x0, x1] = extent(xs, false)
    const [y0, y1] = extent(ys, spec.yZero ?? false)
    const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * (W - PAD.l - PAD.r)
    const sy = (v: number) => H - PAD.b - ((v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b)
    const curves = spec.series.map((s, i) => (
      <g key={i} data-tone={s.tone}>
        <polyline
          points={s.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--tone)"
          strokeWidth={1.5}
          strokeDasharray={s.dashed ? '3 3' : undefined}
          strokeLinejoin="round"
        />
        {s.dots && s.points.map(([x, y], k) => <circle key={k} cx={sx(x)} cy={sy(y)} r={2.2} fill="var(--tone)" />)}
      </g>
    ))
    return { x0, x1, y0, y1, sx, sy, curves }
  }, [spec])
  if (!base) return null
  const { x0, x1, y0, y1, sx, sy, curves } = base
  const cursor = spec.cursor(t)
  return (
    <figure className="sim-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${spec.yLabel} em função de ${spec.xLabel}`}>
        <path d={`M${PAD.l},${PAD.t}V${H - PAD.b}H${W - PAD.r}`} fill="none" stroke="var(--line-2)" />
        <line x1={PAD.l} x2={W - PAD.r} y1={sy(y1)} y2={sy(y1)} stroke="var(--line)" strokeDasharray="2 4" />
        <text x={PAD.l - 5} y={sy(y1) + 3} textAnchor="end">
          {tick(y1)}
        </text>
        <text x={PAD.l - 5} y={sy(y0) + 3} textAnchor="end">
          {tick(y0)}
        </text>
        <text x={PAD.l} y={H - 5}>
          {tick(x0)}
        </text>
        <text x={W - PAD.r} y={H - 5} textAnchor="end">
          {tick(x1)}
        </text>
        <text className="sim-chart__axis" x={(PAD.l + W - PAD.r) / 2} y={H - 5} textAnchor="middle">
          {spec.xLabel}
        </text>
        {curves}
        {cursor && (
          <g>
            <line x1={sx(cursor[0])} x2={sx(cursor[0])} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-3)" strokeDasharray="2 3" />
            <circle cx={sx(cursor[0])} cy={sy(cursor[1])} r={6} fill="var(--ink)" opacity={0.14} />
            <circle cx={sx(cursor[0])} cy={sy(cursor[1])} r={2.8} fill="var(--ink)" />
          </g>
        )}
      </svg>
      <figcaption className="label">{spec.yLabel}</figcaption>
    </figure>
  )
}
