/** Peças visuais comuns dos gráficos: moldura animada, legenda e tooltip. */

import type { CSSProperties, ReactNode } from 'react'
import { useInView } from '@/fx/useInView'
import { type LegendItem, type TipData, useWidth } from './scale'

export function Tip({ tip, width }: { tip: TipData | null; width: number }) {
  if (!tip) return null
  const flip = tip.x > width * 0.62
  return (
    <div
      className="chart__tip"
      role="status"
      style={{ left: tip.x, top: tip.y, transform: `translate(${flip ? 'calc(-100% - 14px)' : '14px'}, -50%)` }}
    >
      <strong>
        {tip.color && <i style={{ background: tip.color }} />}
        {tip.title}
      </strong>
      {tip.rows.length > 0 && (
        <dl>
          {tip.rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export function Legend({
  items,
  hidden,
  onToggle,
}: {
  items: readonly LegendItem[]
  hidden?: ReadonlySet<string>
  onToggle?: (name: string) => void
}) {
  if (items.length < 2 && !onToggle) return null
  return (
    <div className="chart__legend">
      {items.map(({ name, color, mark = 'dot' }) => {
        const off = hidden?.has(name) ?? false
        const swatch = <i className={`sw sw--${mark}`} style={{ '--c': color } as CSSProperties} />
        return onToggle ? (
          <button key={name} type="button" aria-pressed={!off} data-off={off} onClick={() => onToggle(name)}>
            {swatch}
            {name}
          </button>
        ) : (
          <span key={name}>
            {swatch}
            {name}
          </span>
        )
      })}
    </div>
  )
}

/** Moldura do gráfico: mede a largura, liga `data-on` ao entrar na tela e posiciona o tooltip. */
export function Frame({
  label,
  height,
  legend,
  tip,
  focus,
  children,
  className = '',
}: {
  label: string
  height?: number
  legend?: ReactNode
  tip?: TipData | null
  /** Há uma marca em foco: as outras recuam. */
  focus?: boolean
  className?: string
  children: (width: number) => ReactNode
}) {
  const [view, on] = useInView<HTMLDivElement>()
  const [plot, width] = useWidth<HTMLDivElement>()
  return (
    <div ref={view} className={`chart ${className}`} data-on={on} data-focus={focus || undefined}>
      {legend}
      <div ref={plot} className="chart__plot" role="img" aria-label={label} style={{ height }}>
        {children(width)}
        <Tip tip={tip ?? null} width={width} />
      </div>
    </div>
  )
}
