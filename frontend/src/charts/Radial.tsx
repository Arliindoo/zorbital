/** Arcos concêntricos: um anel por categoria, comprimento proporcional ao valor; o total fica no centro. */

import { useState } from 'react'
import { int } from '@/lib/format'
import { Frame } from './kit'
import { delay, type TipData } from './scale'

export interface RadialItem {
  label: string
  value: number
  color: string
}

const arc = (r: number, a0: number, a1: number) => {
  const p = (a: number) => [Math.cos(a) * r, Math.sin(a) * r] as const
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}

export function Radial({ items, height = 340, label, centerLabel }: { items: readonly RadialItem[]; height?: number; label: string; centerLabel: string }) {
  const [hot, setHot] = useState<{ i: number; tip: TipData } | null>(null)
  const max = Math.max(...items.map((i) => i.value), 1)
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <Frame label={label} height={height} tip={hot?.tip} focus={hot !== null}>
      {(width) => {
        const R = Math.min(width / 2 - 8, height / 2 - 6)
        const cx = width / 2
        const cy = height / 2
        const inner = R * 0.36
        const step = (R - inner) / items.length
        const start = -Math.PI / 2
        const sweep = Math.PI * 1.5
        return (
          <svg width={width} height={height} onPointerLeave={() => setHot(null)}>
            <g transform={`translate(${cx} ${cy})`}>
              {items.map((item, i) => {
                const r = R - step * (i + 0.5)
                const end = start + sweep * (item.value / max)
                return (
                  <g
                    key={item.label}
                    className="mark"
                    data-hot={hot?.i === i || undefined}
                    onPointerEnter={() =>
                      setHot({ i, tip: { x: cx + Math.cos(end) * r, y: cy + Math.sin(end) * r, title: item.label, color: item.color, rows: [['Ocorrências', int(item.value)], ['Do total', `${Math.round((item.value / total) * 100)}%`]] } })
                    }
                  >
                    <path d={arc(r, start, start + sweep)} fill="none" stroke="rgb(var(--fg-rgb) / 0.055)" strokeWidth={Math.max(3, step - 5)} strokeLinecap="round" />
                    <path className="a-draw" pathLength={1} style={delay(i * 110)} d={arc(r, start, Math.max(end, start + 0.02))} fill="none" stroke={item.color} strokeWidth={Math.max(3, step - 5)} strokeLinecap="round" />
                    <text className="t-ink2" x={-10} y={-r + 3.5} textAnchor="end">
                      {item.label.length > 24 ? `${item.label.slice(0, 23)}…` : item.label}
                      <tspan className="t-ink" dx={6}>
                        {int(item.value)}
                      </tspan>
                    </text>

                  </g>
                )
              })}
              <text className="t-big a-fade" style={delay(400)} y={4} textAnchor="middle">
                {int(total)}
              </text>
              <text className="t-title a-fade" style={delay(500)} y={22} textAnchor="middle">
                {centerLabel}
              </text>
            </g>
          </svg>
        )
      }}
    </Frame>
  )
}
