/** Ridgeline: uma curva de densidade por grupo, empilhadas com sobreposição (a ordem dos grupos tem sentido). */

import { useState } from 'react'
import { median } from '@/lib/data'
import { g } from '@/lib/format'
import { t } from '@/lib/i18n'
import { Frame } from './kit'
import { delay, nice, scale, smoothPath, type TipData, useSvgId } from './scale'

export interface RidgeGroup {
  name: string
  values: readonly number[]
}

/** Densidade por kernel gaussiano, amostrada em `xs`. */
function density(values: readonly number[], xs: readonly number[], bandwidth: number): number[] {
  return xs.map((x) => values.reduce((sum, v) => sum + Math.exp(-0.5 * ((x - v) / bandwidth) ** 2), 0) / (values.length * bandwidth * Math.sqrt(2 * Math.PI)))
}

// rampa de um extremo ao outro da dimensão ordenada (violeta → verde), em OKLCH pelo navegador
const ramp = (t: number) => `color-mix(in oklch, var(--violet) ${Math.round((1 - t) * 100)}%, var(--signal))`

export function Ridge({ groups, xLabel, height = 380, label }: { groups: readonly RidgeGroup[]; xLabel: string; height?: number; label: string }) {
  const [hot, setHot] = useState<{ i: number; tip: TipData } | null>(null)
  const id = useSvgId('rg')
  const all = groups.flatMap((group) => group.values)
  const ax = nice(Math.min(...all), Math.max(...all), 5)
  return (
    <Frame label={label} height={height} tip={hot?.tip} focus={hot !== null}>
      {(width) => {
        const m = { l: 74, r: 12, t: 12, b: 40 }
        const W = width - m.l - m.r
        const H = height - m.t - m.b
        const sx = scale(ax.lo, ax.hi, m.l, m.l + W)
        const xs = Array.from({ length: 64 }, (_, i) => ax.lo + (i / 63) * (ax.hi - ax.lo))
        const bandwidth = (ax.hi - ax.lo) / 18
        const curves = groups.map((group) => density(group.values, xs, bandwidth))
        const peak = Math.max(...curves.flat(), 1e-9)
        const row = H / (groups.length + 1.2)
        const amp = row * 2.3
        return (
          <svg width={width} height={height} onPointerLeave={() => setHot(null)}>
            <defs>
              {groups.map((_, i) => (
                <linearGradient key={i} id={`${id}-${i}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" style={{ stopColor: ramp(i / Math.max(1, groups.length - 1)) }} stopOpacity="0.5" />
                  <stop offset="1" style={{ stopColor: ramp(i / Math.max(1, groups.length - 1)) }} stopOpacity="0.02" />
                </linearGradient>
              ))}
            </defs>
            {ax.ticks.map((t) => (
              <g key={t}>
                <line className="gridline" x1={sx(t)} x2={sx(t)} y1={m.t} y2={m.t + H} />
                <text x={sx(t)} y={m.t + H + 16} textAnchor="middle">
                  {g(t)}
                </text>
              </g>
            ))}
            <text className="t-title" x={m.l + W} y={height - 4} textAnchor="end">
              {xLabel} →
            </text>
            {groups.map((group, i) => {
              const base = m.t + row * (i + 2.2)
              const pts = curves[i]!.map((d, k) => [sx(xs[k]!), base - (d / peak) * amp] as const)
              const d = smoothPath(pts)
              const color = ramp(i / Math.max(1, groups.length - 1))
              return (
                <g
                  key={group.name}
                  className="mark"
                  data-hot={hot?.i === i || undefined}
                  onPointerEnter={() =>
                    setHot({
                      i,
                      tip: {
                        x: sx(median([...group.values]) ?? ax.lo),
                        y: base - row * 0.6,
                        title: group.name,
                        color,
                        rows: [
                          [t('Tests', 'Ensaios'), String(group.values.length)],
                          [t('Median', 'Mediana'), g(median([...group.values]))],
                          [t('Range', 'Faixa'), `${g(Math.min(...group.values))} – ${g(Math.max(...group.values))}`],
                        ],
                      },
                    })
                  }
                >
                  <path className="a-fade" style={delay(300 + i * 90)} d={`${d}L${m.l + W},${base}L${m.l},${base}Z`} fill="var(--panel)" />
                  <path className="a-fade" style={delay(300 + i * 90)} d={`${d}L${m.l + W},${base}L${m.l},${base}Z`} fill={`url(#${id}-${i})`} />
                  <path className="a-draw" pathLength={1} style={delay(i * 90)} d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
                  <text className="t-ink2" x={m.l - 10} y={base - 2} textAnchor="end">
                    {group.name}
                  </text>
                </g>
              )
            })}
          </svg>
        )
      }}
    </Frame>
  )
}
