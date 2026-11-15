/** Mosaico: um quadrado por unidade (um arquivo, um ensaio), colorido pela categoria. */

import { useState } from 'react'
import { Frame, Legend } from './kit'
import { delay, type TipData } from './scale'

export interface WaffleCell {
  title: string
  category: string
  rows?: readonly (readonly [string, string])[]
}

export function Waffle({
  cells,
  colors,
  height = 190,
  label,
  columns,
}: {
  cells: readonly WaffleCell[]
  colors: Record<string, string>
  height?: number
  label: string
  columns?: number
}) {
  const [hot, setHot] = useState<{ i: number; tip: TipData } | null>(null)
  const categories = [...new Set(cells.map((c) => c.category))]
  return (
    <Frame
      label={label}
      height={height}
      tip={hot?.tip}
      focus={hot !== null}
      legend={<Legend items={categories.map((name) => ({ name: `${name} · ${cells.filter((c) => c.category === name).length}`, color: colors[name] ?? 'var(--ink-3)', mark: 'square' }))} />}
    >
      {(width) => {
        const cols = columns ?? Math.max(4, Math.min(cells.length, Math.floor(width / 34)))
        const rowsCount = Math.ceil(cells.length / cols)
        const size = Math.min(width / cols, height / rowsCount)
        const ox = 0
        return (
          <svg width={width} height={height} onPointerLeave={() => setHot(null)}>
            {cells.map((cell, i) => {
              const x = ox + (i % cols) * size
              const y = Math.floor(i / cols) * size
              const color = colors[cell.category] ?? 'var(--ink-3)'
              return (
                <g key={i} className="mark" data-hot={hot?.i === i || undefined} onPointerEnter={() => setHot({ i, tip: { x: x + size / 2, y: y + size / 2, title: cell.title, color, rows: [['Situação', cell.category], ...(cell.rows ?? [])] } })}>
                  <rect className="a-pop" style={delay(i * 28)} x={x + 2} y={y + 2} width={size - 4} height={size - 4} rx={Math.min(6, size / 5)} fill={color} fillOpacity={0.85} />
                </g>
              )
            })}
          </svg>
        )
      }}
    </Frame>
  )
}
