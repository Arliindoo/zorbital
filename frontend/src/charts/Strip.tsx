/** Faixas de pontos: uma linha por categoria, um ponto por registro (com afastamento vertical quando se sobrepõem). */

import { useState } from 'react'
import { median } from '@/lib/data'
import { g } from '@/lib/format'
import { Frame } from './kit'
import { delay, nice, scale, type TipData } from './scale'

export interface StripGroup {
  name: string
  color: string
  points: readonly { value: number; title: string; tip?: readonly (readonly [string, string])[] }[]
}

export function Strip({ groups, xLabel, height = 340, label }: { groups: readonly StripGroup[]; xLabel: string; height?: number; label: string }) {
  const [hot, setHot] = useState<{ key: string; tip: TipData } | null>(null)
  const all = groups.flatMap((group) => group.points.map((p) => p.value))
  const ax = nice(Math.min(...all), Math.max(...all), 6)
  return (
    <Frame label={label} height={height} tip={hot?.tip} focus={hot !== null}>
      {(width) => {
        const m = { l: Math.min(150, width * 0.3), r: 14, t: 8, b: 40 }
        const W = width - m.l - m.r
        const H = height - m.t - m.b
        const sx = scale(ax.lo, ax.hi, m.l, m.l + W)
        const row = H / groups.length
        const r = 3.4
        return (
          <svg width={width} height={height} onPointerLeave={() => setHot(null)}>
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
            {groups.map((group, gi) => {
              const cy = m.t + row * (gi + 0.5)
              // enxame simples: cada ponto procura o desvio vertical livre mais próximo do centro
              const placed: { x: number; y: number }[] = []
              const dots = [...group.points]
                .sort((a, b) => a.value - b.value)
                .map((p) => {
                  const x = sx(p.value)
                  let y = 0
                  for (let k = 0; k < 40; k++) {
                    y = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 1.9)
                    if (Math.abs(y) > row / 2 - r - 1) {
                      y = 0
                      break
                    }
                    if (!placed.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < (r * 2.1) ** 2)) break
                  }
                  placed.push({ x, y })
                  return { p, x, y: cy + y }
                })
              const mid = median(group.points.map((p) => p.value))
              return (
                <g key={group.name} className="mark" data-hot={hot?.key.startsWith(`${gi}:`) || undefined}>
                  <line className="axisline" x1={m.l} x2={m.l + W} y1={cy} y2={cy} strokeOpacity={0.5} />
                  <text className="t-ink2 t-sans" x={m.l - 12} y={cy - 1} textAnchor="end">
                    {group.name.length > 20 ? `${group.name.slice(0, 19)}…` : group.name}
                  </text>
                  <text x={m.l - 12} y={cy + 12} textAnchor="end">
                    n = {group.points.length}
                  </text>
                  {dots.map(({ p, x, y }, i) => (
                    <circle
                      key={i}
                      className="a-pop"
                      style={delay(100 + gi * 80 + ((x - m.l) / W) * 700)}
                      cx={x}
                      cy={y}
                      r={hot?.key === `${gi}:${i}` ? r + 2 : r}
                      fill={group.color}
                      fillOpacity={0.85}
                      stroke="var(--panel)"
                      strokeWidth={1}
                      onPointerEnter={() => setHot({ key: `${gi}:${i}`, tip: { x, y, title: p.title, color: group.color, rows: [[xLabel, g(p.value)], ...(p.tip ?? [])] } })}
                    />
                  ))}
                  {mid !== null && (
                    <g className="a-fade" style={delay(900 + gi * 80)}>
                      <line x1={sx(mid)} x2={sx(mid)} y1={cy - row * 0.36} y2={cy + row * 0.36} stroke="var(--ink)" strokeWidth={1.5} />
                      <text className="t-ink" x={sx(mid) + 6} y={cy - row * 0.36 + 8}>
                        {g(mid)}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>
        )
      }}
    </Frame>
  )
}
