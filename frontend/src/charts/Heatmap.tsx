/** Matriz de calor: uma cor só, do apagado ao aceso; o valor vai escrito na célula quando cabe. */

import { useState } from 'react'
import { int } from '@/lib/format'
import { Frame } from './kit'
import { delay, type TipData } from './scale'

export function Heatmap({
  rows,
  cols,
  value,
  height = 320,
  label,
  unit = '',
  color = 'var(--signal)',
}: {
  rows: readonly string[]
  cols: readonly string[]
  value: (row: string, col: string) => number | null
  height?: number
  label: string
  unit?: string
  color?: string
}) {
  const [hot, setHot] = useState<{ key: string; tip: TipData } | null>(null)
  const max = Math.max(...rows.flatMap((r) => cols.map((c) => value(r, c) ?? 0)), 1)
  return (
    <Frame label={label} height={height} tip={hot?.tip}>
      {(width) => {
        const m = { l: Math.min(210, width * 0.4), r: 4, t: 6, b: 34 }
        const chars = Math.max(6, Math.floor((m.l - 14) / 6.9))
        const cw = (width - m.l - m.r) / cols.length
        const ch = (height - m.t - m.b) / rows.length
        return (
          <svg width={width} height={height} onPointerLeave={() => setHot(null)}>
            {rows.map((r, ri) => (
              <g key={r}>
                <text className="t-ink2 t-sans" x={m.l - 12} y={m.t + ri * ch + ch / 2 + 4} textAnchor="end">
                  {r.length > chars ? `${r.slice(0, chars - 1)}…` : r}
                </text>
                {cols.map((c, ci) => {
                  const v = value(r, c)
                  const t = v === null ? 0 : v / max
                  const key = `${r}|${c}`
                  const x = m.l + ci * cw + 1.5
                  const y = m.t + ri * ch + 1.5
                  return (
                    <g
                      key={c}
                      className="a-pop"
                      style={delay((ri + ci) * 45)}
                      onPointerEnter={() =>
                        setHot({ key, tip: { x: x + cw / 2, y: y + ch / 2, title: r, rows: [['Coluna', c], [unit || 'Valor', v === null ? 'sem dados' : int(v)]] } })
                      }
                    >
                      <rect x={x} y={y} width={cw - 3} height={ch - 3} rx={5} fill={v === null ? 'transparent' : color} fillOpacity={v === null ? 0 : 0.1 + t * 0.9} stroke={hot?.key === key ? 'var(--ink)' : v === null ? 'var(--line)' : 'transparent'} strokeDasharray={v === null ? '2 3' : undefined} />
                      {v !== null && cw > 30 && ch > 20 && (
                        <text x={x + (cw - 3) / 2} y={y + (ch - 3) / 2 + 4} textAnchor="middle" style={{ fill: t > 0.55 ? 'var(--signal-ink)' : 'var(--ink)', fontWeight: 500 }}>
                          {int(v)}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            ))}
            {cols.map((c, ci) => (
              <text key={c} x={m.l + ci * cw + cw / 2} y={height - m.b + 16} textAnchor="middle">
                {c}
              </text>
            ))}
          </svg>
        )
      }}
    </Frame>
  )
}
