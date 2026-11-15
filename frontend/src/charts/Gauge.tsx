/** Medidor de traços: `value` de `total` acesos ao longo de um arco de 270°. */

import { Frame } from './kit'
import { delay } from './scale'

export function Gauge({
  value,
  total,
  caption,
  height = 260,
  label,
  color = 'var(--signal)',
  ticks = 60,
}: {
  value: number
  total: number
  caption: string
  height?: number
  label: string
  color?: string
  ticks?: number
}) {
  const share = total ? value / total : 0
  return (
    <Frame label={label} height={height}>
      {(width) => {
        const R = Math.min(width / 2 - 6, height / 2 - 4)
        const cx = width / 2
        const cy = height / 2 + R * 0.12
        const start = Math.PI * 0.75
        const sweep = Math.PI * 1.5
        const lit = Math.round(share * ticks)
        return (
          <svg width={width} height={height}>
            <g transform={`translate(${cx} ${cy})`}>
              <circle className="a-spin" r={R * 0.62} fill="none" stroke="rgb(var(--fg-rgb) / 0.1)" strokeDasharray="1 7" />
              {Array.from({ length: ticks }, (_, i) => {
                const a = start + (i / (ticks - 1)) * sweep
                const on = i < lit
                const r0 = R * (on ? 0.78 : 0.84)
                return (
                  <line
                    key={i}
                    className="a-fade"
                    style={delay(i * 14)}
                    x1={Math.cos(a) * r0}
                    y1={Math.sin(a) * r0}
                    x2={Math.cos(a) * R}
                    y2={Math.sin(a) * R}
                    stroke={on ? color : 'rgb(var(--fg-rgb) / 0.14)'}
                    strokeWidth={on ? 2.2 : 1.2}
                    strokeLinecap="round"
                  />
                )
              })}
              <text className="t-big a-fade" style={{ ...delay(500), fontSize: R * 0.42 }} y={R * 0.06} textAnchor="middle">
                {value}
                <tspan style={{ fontSize: R * 0.2, fill: 'var(--ink-3)' }}> / {total}</tspan>
              </text>
              <text className="t-title a-fade" style={delay(650)} y={R * 0.3} textAnchor="middle">
                {caption}
              </text>
            </g>
          </svg>
        )
      }}
    </Frame>
  )
}
