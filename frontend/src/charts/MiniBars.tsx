import { useInView } from '@/fx/useInView'

/** Histograma mínimo (sem eixos) para dentro de um bloco de número: mostra a forma da distribuição. */
export function MiniBars({ values, bins = 18, color = 'var(--signal)', height = 44, label }: { values: readonly number[]; bins?: number; color?: string; height?: number; label: string }) {
  const [ref, on] = useInView<SVGSVGElement>('0px')
  if (!values.length) return null
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const counts = Array.from({ length: bins }, () => 0)
  for (const v of values) counts[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo || 1)) * bins))]!++
  const max = Math.max(...counts, 1)
  const w = 100 / bins
  return (
    <svg ref={ref} className="chart minibars" data-on={on} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ height, width: '100%' }}>
      {counts.map((c, i) => {
        const h = Math.max(1, (c / max) * (height - 2))
        return <rect key={i} className="a-grow-y" style={{ '--d': i * 30 } as React.CSSProperties} x={i * w + w * 0.18} y={height - h} width={w * 0.64} height={h} rx={0.8} fill={color} fillOpacity={c ? 0.9 : 0.25} />
      })}
    </svg>
  )
}
