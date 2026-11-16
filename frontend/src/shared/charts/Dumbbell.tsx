/** Halteres: dois valores da mesma condição ligados por um traço (aqui, medido × modelo). */

import { useState } from 'react'
import { fixed, g } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { Frame, Legend } from '@/shared/charts/kit'
import { delay, nice, scale, type TipData } from '@/shared/charts/scale'

export interface DumbbellRow {
  label: string
  group: string
  color: string
  a: number | null
  b: number | null
  ok?: boolean | null
}

export function Dumbbell({
  rows,
  aLabel,
  bLabel,
  xLabel,
  height = 340,
  label,
}: {
  rows: readonly DumbbellRow[]
  aLabel: string
  bLabel: string
  xLabel: string
  height?: number
  label: string
}) {
  const [hot, setHot] = useState<{ i: number; tip: TipData } | null>(null)
  const values = rows.flatMap((r) => [r.a, r.b]).filter((v): v is number => v !== null)
  const ax = nice(0, Math.max(...values), 5)
  const groups = [...new Set(rows.map((r) => r.group))]
  return (
    <Frame
      label={label}
      height={height}
      tip={hot?.tip}
      focus={hot !== null}
      legend={
        <Legend
          items={[
            ...groups.map((name) => ({ name, color: rows.find((r) => r.group === name)!.color, mark: 'line' as const })),
            { name: aLabel, color: 'var(--ink)', mark: 'dot' },
            { name: bLabel, color: 'var(--ink)', mark: 'diamond' },
          ]}
        />
      }
    >
      {(width) => {
        const m = { l: 64, r: 16, t: 6, b: 40 }
        const W = width - m.l - m.r
        const H = height - m.t - m.b
        const sx = scale(ax.lo, ax.hi, m.l, m.l + W)
        const row = H / rows.length
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
            {rows.map((r, i) => {
              const y = m.t + row * (i + 0.5)
              const xa = r.a === null ? null : sx(r.a)
              const xb = r.b === null ? null : sx(r.b)
              return (
                <g
                  key={`${r.group}${r.label}`}
                  className="mark"
                  data-hot={hot?.i === i || undefined}
                  onPointerEnter={() =>
                    setHot({
                      i,
                      tip: {
                        x: Math.max(xa ?? 0, xb ?? 0),
                        y,
                        title: `${r.group} · ${r.label}`,
                        color: r.color,
                        rows: [
                          [aLabel, r.a === null ? '—' : `${fixed(r.a, 2)} mm`],
                          [bLabel, r.b === null ? '—' : `${fixed(r.b, 2)} mm`],
                          ...(r.a !== null && r.b !== null ? [[t('Difference', 'Diferença'), `${fixed(r.b - r.a, 2, true)} mm`] as const] : []),
                          ...(r.ok === null || r.ok === undefined ? [] : [[t('Model within range', 'Modelo na faixa'), r.ok ? t('yes', 'sim') : t('no', 'não')] as const]),
                        ],
                      },
                    })
                  }
                >
                  <rect x={m.l} y={y - row / 2} width={W} height={row} fill="transparent" />
                  <text className="t-ink2" x={m.l - 10} y={y + 3.5} textAnchor="end">
                    {r.label}
                  </text>
                  {xa !== null && xb !== null && (
                    <>
                      <line className="a-grow-x" style={delay(200 + i * 60)} x1={Math.min(xa, xb)} x2={Math.max(xa, xb)} y1={y} y2={y} stroke={r.color} strokeOpacity={0.2} strokeWidth={9} strokeLinecap="round" />
                      <line className="a-grow-x" style={delay(200 + i * 60)} x1={Math.min(xa, xb)} x2={Math.max(xa, xb)} y1={y} y2={y} stroke={r.color} strokeWidth={1.5} />
                    </>
                  )}
                  {xa !== null && <circle className="a-pop" style={delay(100 + i * 60)} cx={xa} cy={y} r={5} fill={r.color} stroke="var(--panel)" strokeWidth={1.5} />}
                  {xb !== null && (
                    <path className="a-pop" style={delay(500 + i * 60)} d={`M${xb},${y - 6.5}L${xb + 6.5},${y}L${xb},${y + 6.5}L${xb - 6.5},${y}Z`} fill="var(--panel)" stroke={r.color} strokeWidth={1.6} />
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
