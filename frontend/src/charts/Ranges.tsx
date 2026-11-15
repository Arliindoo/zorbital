/** Faixas: do menor ao maior valor testado em cada estudo, com a janela comum a todos sombreada. */

import { useState } from 'react'
import { g } from '@/lib/format'
import { Frame } from './kit'
import { delay, nice, scale, type TipData } from './scale'

export interface RangeRow {
  label: string
  color: string
  lo: number
  hi: number
  /** A faixa por extenso, com unidade (vai no tooltip). */
  text: string
}

const ROW = 46

export function Ranges({ rows, window, xLabel, label }: { rows: readonly RangeRow[]; window: readonly [number, number] | null; xLabel: string; label: string }) {
  const [hot, setHot] = useState<{ i: number; tip: TipData } | null>(null)
  const ax = nice(Math.min(...rows.map((r) => r.lo)), Math.max(...rows.map((r) => r.hi)), 5)
  const height = 58 + ROW * rows.length
  return (
    <Frame label={label} height={height} tip={hot?.tip} focus={hot !== null}>
      {(width) => {
        const m = { l: 16, r: 20, t: 8, b: 42 }
        const W = width - m.l - m.r
        const H = height - m.t - m.b
        const sx = scale(ax.lo, ax.hi, m.l, m.l + W)
        return (
          <svg width={width} height={height} onPointerLeave={() => setHot(null)}>
            {window && (
              <g className="a-fade" style={delay(520)}>
                <rect x={sx(window[0])} y={m.t} width={Math.max(2, sx(window[1]) - sx(window[0]))} height={H} fill="rgb(var(--fg-rgb) / 0.06)" />
                <line className="ranges__edge" x1={sx(window[0])} x2={sx(window[0])} y1={m.t} y2={m.t + H} />
                <line className="ranges__edge" x1={sx(window[1])} x2={sx(window[1])} y1={m.t} y2={m.t + H} />
              </g>
            )}
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
              const y = m.t + ROW * (i + 0.5) + 7
              const [xa, xb] = [sx(r.lo), sx(r.hi)]
              const fixed = r.lo === r.hi
              return (
                <g key={r.label} className="mark" data-hot={hot?.i === i || undefined} onPointerEnter={() => setHot({ i, tip: { x: xb, y, title: r.label, color: r.color, rows: [[xLabel, r.text]] } })}>
                  <rect x={m.l} y={m.t + ROW * i} width={W} height={ROW} fill="transparent" />
                  <text className="t-ink2" x={Math.min(xa, m.l + W - 4)} y={y - 12} textAnchor={xa > m.l + W * 0.7 ? 'end' : 'start'}>
                    {r.label}
                  </text>
                  {!fixed && (
                    <>
                      <line className="a-grow-x" style={delay(160 + i * 80)} x1={xa} x2={xb} y1={y} y2={y} stroke={r.color} strokeOpacity={0.22} strokeWidth={10} strokeLinecap="round" />
                      <line className="a-grow-x" style={delay(160 + i * 80)} x1={xa} x2={xb} y1={y} y2={y} stroke={r.color} strokeWidth={2} />
                    </>
                  )}
                  <circle className="a-pop" style={delay(120 + i * 80)} cx={xa} cy={y} r={5} fill={r.color} stroke="var(--panel)" strokeWidth={1.5} />
                  {!fixed && <circle className="a-pop" style={delay(420 + i * 80)} cx={xb} cy={y} r={5} fill={r.color} stroke="var(--panel)" strokeWidth={1.5} />}
                </g>
              )
            })}
          </svg>
        )
      }}
    </Frame>
  )
}
