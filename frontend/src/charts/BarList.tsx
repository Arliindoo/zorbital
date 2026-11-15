import type { CSSProperties } from 'react'
import { useInView } from '@/fx/useInView'
import { int } from '@/lib/format'

export interface BarItem {
  label: string
  value: number
  color?: string
  note?: string
}

/** Ranking em barras horizontais finas, maior em cima, com o valor na ponta. */
export function BarList({ items, label, color = 'var(--s1)', format = int }: { items: readonly BarItem[]; label: string; color?: string; format?: (v: number) => string }) {
  const [ref, on] = useInView<HTMLOListElement>()
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ol ref={ref} className="barlist" data-on={on} aria-label={label}>
      {items.map((item, i) => (
        <li key={item.label} style={{ '--i': i, '--w': `${(item.value / max) * 100}%`, '--c': item.color ?? color } as CSSProperties} title={item.note}>
          <span className="barlist__label">{item.label}</span>
          <span className="barlist__value mono">{format(item.value)}</span>
          <span className="barlist__track">
            <i />
          </span>
        </li>
      ))}
    </ol>
  )
}
