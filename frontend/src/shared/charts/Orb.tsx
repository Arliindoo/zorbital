import { useMemo } from 'react'
import { delay } from '@/shared/charts/scale'

/** Sorteio determinístico: o mesmo núcleo a cada render. */
function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Núcleo de pontos em anéis concêntricos (o "olho" do fluxo). `share` é a fração de pontos
 * pintados com a cor de destaque — aqui, a proporção de alertas.
 */
export function Orb({
  cx,
  cy,
  r,
  share = 0.1,
  color = 'var(--signal)',
  accent = 'var(--magenta)',
  start = 0,
}: {
  cx: number
  cy: number
  r: number
  share?: number
  color?: string
  accent?: string
  /** Atraso da entrada, em ms. */
  start?: number
}) {
  const rings = useMemo(() => {
    const random = mulberry(7)
    const count = Math.max(3, Math.round(r / 13))
    return Array.from({ length: count }, (_, k) => {
      const radius = ((k + 1) / count) * r * 0.82
      const n = 6 + k * 6
      return {
        radius,
        dots: Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2 + k * 0.4
          return { x: Math.cos(a) * radius, y: Math.sin(a) * radius, hot: random() < share, size: 1.1 + random() * 1.1, o: 0.45 + random() * 0.55 }
        }),
      }
    })
  }, [r, share])
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* halos: traços finos, sem desfoque */}
      {[1.62, 1.4, 1.2].map((k, i) => (
        <circle key={k} className="a-fade" style={delay(start + i * 120)} r={r * k} fill="none" stroke="rgb(var(--fg-rgb) / 0.07)" strokeWidth={i === 0 ? 10 : 1} />
      ))}
      <g className="a-spin" style={{ '--spin': '90s' } as React.CSSProperties}>
        <circle className="a-draw" pathLength={1} style={delay(start)} r={r * 1.08} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="0.012 0.012" />
      </g>
      <g className="a-spin-back" style={{ '--spin': '140s' } as React.CSSProperties}>
        <circle r={r * 0.96} fill="none" stroke="rgb(var(--fg-rgb) / 0.16)" strokeDasharray="1 6" />
      </g>
      {rings.map((ring, k) => (
        <g key={k} className={k % 2 ? 'a-spin' : 'a-spin-back'} style={{ '--spin': `${70 + k * 22}s` } as React.CSSProperties}>
          {ring.dots.map((d, i) => (
            <circle
              key={i}
              className="a-pop"
              style={delay(start + 200 + k * 90 + (i / ring.dots.length) * 500)}
              cx={d.x}
              cy={d.y}
              r={d.hot ? d.size + 0.5 : d.size}
              fill={d.hot ? accent : color}
              opacity={d.o}
            />
          ))}
        </g>
      ))}
      <circle className="a-pop" style={delay(start + 100)} r={2.4} fill="var(--ink)" />
    </g>
  )
}
