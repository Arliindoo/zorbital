/** Pirulitos em 3D isométrico: dois eixos no chão, a altura é a medida. Cubo de grade desenhado em SVG. */

import { useState } from 'react'
import { g } from '@/shared/lib/format'
import { Frame } from '@/shared/charts/kit'
import { delay, nice, type TipData } from '@/shared/charts/scale'

export interface IsoPoint {
  x: number
  z: number
  h: number
  color: string
  title: string
  tip?: readonly (readonly [string, string])[]
}

export function Iso({
  points,
  xLabel,
  zLabel,
  hLabel,
  height = 380,
  label,
}: {
  points: readonly IsoPoint[]
  xLabel: string
  zLabel: string
  hLabel: string
  height?: number
  label: string
}) {
  const [hot, setHot] = useState<{ i: number; tip: TipData } | null>(null)
  // chão justo aos dados (com folga), para os pontos ocuparem o cubo; as marcas continuam redondas
  const fit = (values: number[]) => {
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = (hi - lo) * 0.06 || 1
    return { lo: lo - pad, hi: hi + pad, ticks: nice(lo, hi, 4).ticks.filter((t) => t >= lo - pad && t <= hi + pad) }
  }
  const ax = fit(points.map((p) => p.x))
  const az = fit(points.map((p) => p.z))
  const ah = nice(0, Math.max(...points.map((p) => p.h)), 4)
  return (
    <Frame label={label} height={height} tip={hot?.tip} focus={hot !== null} className="iso">
      {(width) => {
        const S = Math.min((width - 70) / 1.74, (height - 64) / 1.92)
        const cx = width / 2
        const cy = height - 36 - S * 0.5
        const C = Math.cos(Math.PI / 6)
        // (u, v) no chão em [0,1]; t é a altura em [0,1]
        const P = (u: number, v: number, t: number): [number, number] => [cx + (u - v) * C * S, cy + (u + v - 1) * 0.5 * S - t * S * 0.92]
        const line = (a: [number, number], b: [number, number]) => `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`
        const n = 4
        const grid: string[] = []
        for (let i = 0; i <= n; i++) {
          const f = i / n
          grid.push(line(P(f, 0, 0), P(f, 1, 0)), line(P(0, f, 0), P(1, f, 0))) // chão
          grid.push(line(P(f, 0, 0), P(f, 0, 1)), line(P(0, 0, f), P(1, 0, f))) // parede do fundo (v = 0)
          grid.push(line(P(0, f, 0), P(0, f, 1)), line(P(0, 0, f), P(0, 1, f))) // parede do fundo (u = 0)
        }
        const norm = (v: number, a: { lo: number; hi: number }) => (v - a.lo) / (a.hi - a.lo || 1)
        const items = points
          .map((p, i) => {
            const u = norm(p.x, ax)
            const v = norm(p.z, az)
            const t = norm(p.h, ah)
            return { p, i, base: P(u, v, 0), top: P(u, v, t), depth: u + v }
          })
          .sort((a, b) => a.depth - b.depth)
        return (
          <svg width={width} height={height} onPointerLeave={() => setHot(null)}>
            <path className="a-fade" d={grid.join('')} stroke="rgb(var(--fg-rgb) / 0.09)" fill="none" />
            <g className="a-fade" style={delay(200)}>
              {ah.ticks.map((t) => {
                const [x, y] = P(0, 1, norm(t, ah))
                return (
                  <text key={t} x={x - 8} y={y + 3} textAnchor="end">
                    {g(t)}
                  </text>
                )
              })}
              {ax.ticks.map((t) => {
                const [x, y] = P(norm(t, ax), 1, 0)
                return (
                  <text key={t} x={x - 6} y={y + 14} textAnchor="end">
                    {g(t)}
                  </text>
                )
              })}
              {az.ticks.map((t) => {
                const [x, y] = P(1, norm(t, az), 0)
                return (
                  <text key={t} x={x + 6} y={y + 14}>
                    {g(t)}
                  </text>
                )
              })}
              <text className="t-title" x={P(0.5, 1, 0)[0] - 26} y={P(0.5, 1, 0)[1] + 34} textAnchor="end">
                {xLabel}
              </text>
              <text className="t-title" x={P(1, 0.5, 0)[0] + 26} y={P(1, 0.5, 0)[1] + 34}>
                {zLabel}
              </text>
              <text className="t-title" x={0} y={12}>
                ↑ {hLabel}
              </text>
            </g>
            {items.map(({ p, i, base, top }, order) => (
              <g
                key={i}
                className="mark"
                data-hot={hot?.i === i || undefined}
                onPointerEnter={() =>
                  setHot({
                    i,
                    tip: { x: top[0], y: top[1], title: p.title, color: p.color, rows: [[xLabel, g(p.x)], [zLabel, g(p.z)], [hLabel, g(p.h)], ...(p.tip ?? [])] },
                  })
                }
              >
                <ellipse className="a-fade" style={delay(300 + order * 6)} cx={base[0]} cy={base[1]} rx={3.5} ry={1.7} fill="none" stroke={p.color} strokeOpacity={0.35} />
                <line className="a-grow-y" style={delay(300 + order * 6)} x1={base[0]} x2={top[0]} y1={base[1]} y2={top[1]} stroke={p.color} strokeOpacity={0.32} />
                <g className="a-pop" style={delay(700 + order * 6)}>
                  <circle cx={top[0]} cy={top[1]} r={7} fill={p.color} opacity={0.12} />
                  <circle cx={top[0]} cy={top[1]} r={3.2} fill={p.color} stroke="var(--panel)" strokeWidth={1} />
                </g>
              </g>
            ))}
          </svg>
        )
      }}
    </Frame>
  )
}
