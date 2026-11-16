/** Sankey em camadas: nós em colunas, fitas com largura proporcional ao valor e gradiente origem→destino. */

import { useMemo, useState } from 'react'
import { int } from '@/shared/lib/format'
import { t as tr } from '@/shared/lib/i18n'
import { Frame } from '@/shared/charts/kit'
import { delay, type TipData, useSvgId } from '@/shared/charts/scale'

export interface SankeyNode {
  id: string
  label: string
  column: number
  color: string
}
export interface SankeyLink {
  source: string
  target: string
  value: number
}

export function Sankey({
  nodes,
  links,
  height = 380,
  label,
  unit = '',
}: {
  nodes: readonly SankeyNode[]
  links: readonly SankeyLink[]
  height?: number
  label: string
  unit?: string
}) {
  const [hot, setHot] = useState<{ key: string; tip: TipData } | null>(null)
  const id = useSvgId('sk')
  const columns = useMemo(() => {
    const count = Math.max(...nodes.map((n) => n.column)) + 1
    return Array.from({ length: count }, (_, c) => nodes.filter((n) => n.column === c))
  }, [nodes])
  const value = useMemo(() => {
    const out = new Map<string, number>()
    for (const n of nodes) {
      const sumIn = links.filter((l) => l.target === n.id).reduce((s, l) => s + l.value, 0)
      const sumOut = links.filter((l) => l.source === n.id).reduce((s, l) => s + l.value, 0)
      out.set(n.id, Math.max(sumIn, sumOut))
    }
    return out
  }, [nodes, links])

  return (
    <Frame label={label} height={height} tip={hot?.tip} focus={hot !== null} className="sankey">
      {(width) => {
        const pad = { l: 4, r: 4, t: 8, b: 8 }
        const gap = 14
        const barW = 5
        const labelW = width < 520 ? 110 : 190
        const x0 = pad.l
        const x1 = width - pad.r - labelW
        const colX = (c: number) => x0 + (c / Math.max(1, columns.length - 1)) * (x1 - x0)
        const innerH = height - pad.t - pad.b
        const k = Math.min(
          ...columns.map((col) => (innerH - gap * (col.length - 1)) / Math.max(1, col.reduce((s, n) => s + (value.get(n.id) ?? 0), 0))),
        )
        const box = new Map<string, { x: number; y: number; h: number; node: SankeyNode }>()
        columns.forEach((col, c) => {
          const total = col.reduce((s, n) => s + (value.get(n.id) ?? 0) * k, 0) + gap * (col.length - 1)
          let y = pad.t + (innerH - total) / 2
          for (const n of col) {
            const h = Math.max(2, (value.get(n.id) ?? 0) * k)
            box.set(n.id, { x: colX(c), y, h, node: n })
            y += h + gap
          }
        })
        const outAt = new Map<string, number>()
        const inAt = new Map<string, number>()
        const ribbons = links
          .filter((l) => box.has(l.source) && box.has(l.target) && l.value > 0)
          .map((l, i) => {
            const s = box.get(l.source)!
            const t = box.get(l.target)!
            const h = l.value * k
            const sy = s.y + (outAt.get(l.source) ?? 0)
            const ty = t.y + (inAt.get(l.target) ?? 0)
            outAt.set(l.source, (outAt.get(l.source) ?? 0) + h)
            inAt.set(l.target, (inAt.get(l.target) ?? 0) + h)
            const xa = s.x + barW
            const xb = t.x
            const mx = (xa + xb) / 2
            return {
              key: `${l.source}→${l.target}`,
              i,
              l,
              s,
              t,
              d: `M${xa},${sy}C${mx},${sy} ${mx},${ty} ${xb},${ty}V${ty + h}C${mx},${ty + h} ${mx},${sy + h} ${xa},${sy + h}Z`,
              mid: [mx, (sy + ty + h) / 2] as const,
            }
          })
        return (
          <svg width={width} height={height} onPointerLeave={() => setHot(null)}>
            <defs>
              {ribbons.map((r) => (
                <linearGradient key={r.key} id={`${id}-${r.i}`} x1={r.s.x} x2={r.t.x} gradientUnits="userSpaceOnUse">
                  <stop offset="0" style={{ stopColor: r.s.node.color }} />
                  <stop offset="1" style={{ stopColor: r.t.node.color }} />
                </linearGradient>
              ))}
              <clipPath id={`${id}-wipe`}>
                <rect className="a-grow-x" x={0} y={0} width={width} height={height} style={delay(200)} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${id}-wipe)`}>
              {ribbons.map((r) => (
                <path
                  key={r.key}
                  className="mark"
                  data-hot={hot?.key === r.key || hot?.key === r.l.source || hot?.key === r.l.target || undefined}
                  d={r.d}
                  fill={`url(#${id}-${r.i})`}
                  fillOpacity={0.5}
                  stroke={`url(#${id}-${r.i})`}
                  strokeOpacity={0.9}
                  strokeWidth={0.75}
                  onPointerEnter={() =>
                    setHot({
                      key: r.key,
                      tip: { x: r.mid[0], y: r.mid[1], title: `${r.s.node.label} → ${r.t.node.label}`, rows: [[unit || tr('Value', 'Valor'), int(r.l.value)]] },
                    })
                  }
                />
              ))}
            </g>
            {[...box.values()].map(({ x, y, h, node }, i) => {
              const last = node.column === columns.length - 1
              return (
                <g
                  key={node.id}
                  className="mark"
                  data-hot={hot?.key === node.id || hot?.key.split('→').includes(node.id) || undefined}
                  onPointerEnter={() =>
                    setHot({ key: node.id, tip: { x: x + barW, y: y + h / 2, title: node.label, color: node.color, rows: [[unit || tr('Value', 'Valor'), int(value.get(node.id) ?? 0)]] } })
                  }
                >
                  <rect className="a-grow-y" style={delay(i * 50)} x={x} y={y} width={barW} height={h} rx={2.5} fill={node.color} />
                  <g className="a-fade sankey__label" style={delay(500 + i * 50)}>
                    <text className="t-ink t-sans" x={x + barW + 10} y={y + Math.min(h / 2, 14) + (h > 30 ? 0 : 4)}>
                      {!last && node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                    </text>
                    {h > 30 && (
                      <text className="t-ink2" x={x + barW + 10} y={y + Math.min(h / 2, 14) + 15}>
                        {int(value.get(node.id) ?? 0)} {unit}
                      </text>
                    )}
                  </g>
                </g>
              )
            })}
          </svg>
        )
      }}
    </Frame>
  )
}
