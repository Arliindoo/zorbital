/**
 * Gráfico cartesiano em SVG, por camadas: pontos, linhas (cheias ou tracejadas, com área opcional),
 * barras agrupadas e faixas verticais (incerteza). Um eixo y só; x numérico ou por categoria.
 */

import { type PointerEvent, useMemo, useState } from 'react'
import { g } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { legendItems } from '@/shared/charts/legend'
import { Frame, Legend } from '@/shared/charts/kit'
import { delay, linePath, nice, scale, smoothPath, tick, useSvgId } from '@/shared/charts/scale'
import { td } from '@/shared/lib/i18n-data'

export interface XYPoint {
  x: number | string
  y: number | null
  lo?: number | null
  hi?: number | null
  /** Linhas extras do tooltip. */
  tip?: readonly (readonly [string, string])[]
}

export interface XYSeries {
  name: string
  color: string
  type: 'points' | 'line' | 'bars' | 'band'
  dashed?: boolean
  area?: boolean
  smooth?: boolean
  /** Marcadores sobre a linha. */
  markers?: boolean
  symbol?: 'circle' | 'diamond' | 'square'
  size?: number
  opacity?: number
  data: readonly XYPoint[]
}

export interface XYChartProps {
  series: readonly XYSeries[]
  label: string
  xLabel?: string
  yLabel?: string
  height?: number
  zeroY?: boolean
  yDomain?: readonly [number, number]
  xDomain?: readonly [number, number]
  xFormat?: (value: number | string) => string
  yFormat?: (value: number) => string
  legend?: boolean
  /** Controle externo de séries escondidas (painéis lado a lado com uma legenda só). */
  hidden?: ReadonlySet<string>
  onToggle?: (name: string) => void
  title?: string
}

interface Hit {
  px: number
  py: number
  series: XYSeries
  point: XYPoint
}

function Symbol({ kind = 'circle', x, y, r, ...rest }: { kind?: XYSeries['symbol']; x: number; y: number; r: number } & React.SVGProps<SVGElement>) {
  if (kind === 'diamond')
    return <path d={`M${x},${y - r * 1.25}L${x + r * 1.25},${y}L${x},${y + r * 1.25}L${x - r * 1.25},${y}Z`} {...(rest as React.SVGProps<SVGPathElement>)} />
  if (kind === 'square')
    return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1.5} {...(rest as React.SVGProps<SVGRectElement>)} />
  return <circle cx={x} cy={y} r={r} {...(rest as React.SVGProps<SVGCircleElement>)} />
}

export function XYChart({
  series,
  label,
  xLabel,
  yLabel,
  height = 380,
  zeroY = false,
  yDomain,
  xDomain,
  xFormat,
  yFormat = g,
  legend = true,
  hidden: hiddenProp,
  onToggle,
  title,
}: XYChartProps) {
  const [hiddenOwn, setHiddenOwn] = useState<ReadonlySet<string>>(new Set())
  const hidden = hiddenProp ?? hiddenOwn
  const toggle =
    onToggle ??
    ((name: string) =>
      setHiddenOwn((prev) => {
        const next = new Set(prev)
        if (!next.delete(name)) next.add(name)
        return next
      }))
  const [hit, setHit] = useState<Hit | null>(null)
  const id = useSvgId('xy')

  const shown = useMemo(() => series.filter((s) => !hidden.has(s.name)), [series, hidden])
  // domínios calculados com TODAS as séries: esconder uma não muda a escala das outras
  const dims = useMemo(() => {
    const xs: (number | string)[] = []
    const ys: number[] = []
    for (const s of series)
      for (const p of s.data) {
        xs.push(p.x)
        if (p.y !== null && Number.isFinite(p.y)) ys.push(p.y)
        if (typeof p.lo === 'number') ys.push(p.lo)
        if (typeof p.hi === 'number') ys.push(p.hi)
      }
    const numeric = xs.every((x) => typeof x === 'number')
    const hasBars = series.some((s) => s.type === 'bars')
    const categories = numeric && !hasBars ? [] : [...new Set(xs.map(String))]
    const xNums = xs.filter((x): x is number => typeof x === 'number')
    return {
      numeric: numeric && !hasBars,
      categories,
      xMin: xNums.length ? Math.min(...xNums) : 0,
      xMax: xNums.length ? Math.max(...xNums) : 1,
      yMin: ys.length ? Math.min(...ys) : 0,
      yMax: ys.length ? Math.max(...ys) : 1,
      hasBars,
    }
  }, [series])

  const fx = xFormat ?? ((v: number | string) => (typeof v === 'number' ? g(v) : v))
  const items = legendItems(series)

  return (
    <Frame
      label={label}
      height={height}
      legend={legend ? <Legend items={items} hidden={hidden} onToggle={series.length > 1 ? toggle : undefined} /> : undefined}
      focus={hit !== null}
      tip={
        hit && {
          x: hit.px,
          y: hit.py,
          title: td(hit.series.name),
          color: hit.series.color,
          rows: [
            ...(xLabel ? [[xLabel, fx(hit.point.x)] as const] : []),
            ...(hit.series.type === 'band'
              ? [[t('Range', 'Faixa'), `${yFormat(hit.point.lo ?? 0)} – ${yFormat(hit.point.hi ?? 0)}`] as const]
              : hit.point.y !== null
                ? [[yLabel ?? t('Value', 'Valor'), yFormat(hit.point.y)] as const]
                : []),
            ...(hit.point.tip ?? []),
          ],
        }
      }
    >
      {(width) => {
        const m = { l: 46, r: 14, t: yLabel || title ? 26 : 10, b: xLabel ? 44 : 26 }
        const W = Math.max(60, width - m.l - m.r)
        const H = Math.max(60, height - m.t - m.b)
        const yPad = (dims.yMax - dims.yMin) * 0.08
        const yn = yDomain
          ? nice(yDomain[0], yDomain[1], 5)
          : nice(zeroY || dims.hasBars ? Math.min(0, dims.yMin) : dims.yMin - yPad, dims.yMax + yPad, 5)
        const sy = scale(yn.lo, yn.hi, m.t + H, m.t)
        let sx: (x: number | string) => number
        let xTicks: { at: number; text: string }[]
        const step = dims.numeric ? 0 : W / Math.max(1, dims.categories.length)
        if (dims.numeric) {
          const pad = (dims.xMax - dims.xMin) * 0.04 || 1
          const xn = xDomain
            ? { lo: xDomain[0], hi: xDomain[1], ticks: nice(xDomain[0], xDomain[1], Math.max(3, Math.floor(W / 76))).ticks }
            : (() => {
                const n = nice(dims.xMin - pad, dims.xMax + pad, Math.max(3, Math.floor(W / 76)))
                return { lo: dims.xMin - pad, hi: dims.xMax + pad, ticks: n.ticks }
              })()
          const s = scale(xn.lo, xn.hi, m.l, m.l + W)
          sx = (x) => s(Number(x))
          xTicks = xn.ticks.filter((t) => t >= xn.lo && t <= xn.hi).map((t) => ({ at: s(t), text: fx(t) }))
        } else {
          const index = new Map(dims.categories.map((c, i) => [c, i]))
          sx = (x) => m.l + ((index.get(String(x)) ?? 0) + 0.5) * step
          const every = Math.max(1, Math.ceil(dims.categories.length / Math.max(2, Math.floor(W / 64))))
          xTicks = dims.categories
            .map((c, i) => ({ at: m.l + (i + 0.5) * step, text: fx(/^-?\d+(\.\d+)?$/.test(c) ? Number(c) : c), i }))
            .filter((t) => t.i % every === 0)
        }
        const baseline = sy(Math.max(yn.lo, Math.min(yn.hi, 0)))
        const barSeries = shown.filter((s) => s.type === 'bars')
        const barW = barSeries.length ? Math.max(2, Math.min(26, (step * 0.72) / barSeries.length)) : 0

        // tudo que responde ao ponteiro, já em pixels
        const hits: Hit[] = []
        for (const s of shown)
          for (const p of s.data) {
            if (s.type === 'band') {
              if (typeof p.lo === 'number' && typeof p.hi === 'number') hits.push({ px: sx(p.x), py: sy((p.lo + p.hi) / 2), series: s, point: p })
            } else if (p.y !== null && Number.isFinite(p.y)) {
              const off = s.type === 'bars' ? (barSeries.indexOf(s) - (barSeries.length - 1) / 2) * (barW + 2) : 0
              hits.push({ px: sx(p.x) + off, py: sy(p.y), series: s, point: p })
            }
          }
        const onMove = (event: PointerEvent<SVGSVGElement>) => {
          const box = event.currentTarget.getBoundingClientRect()
          const x = event.clientX - box.left
          const y = event.clientY - box.top
          let best: Hit | null = null
          let bestD = 34 ** 2
          for (const h of hits) {
            const dx = h.px - x
            const dy = h.series.type === 'bars' || h.series.type === 'band' ? 0 : h.py - y
            // faixas só vencem quando não há ponto por perto
            const d = dx * dx + dy * dy + (h.series.type === 'band' ? 400 : 0)
            if (d < bestD) {
              bestD = d
              best = h
            }
          }
          setHit((prev) => (prev?.point === best?.point && prev?.series === best?.series ? prev : best))
        }
        const total = Math.max(1, hits.length)
        const stagger = hits.length > 420 ? 0 : Math.min(18, 900 / total)

        return (
          <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHit(null)}>
            <defs>
              <clipPath id={`${id}-wipe`}>
                <rect className="a-grow-x" x={m.l - 8} y={m.t - 12} width={W + 16} height={H + 24} style={delay(250)} />
              </clipPath>
              {shown
                .filter((s) => s.area)
                .map((s) => (
                  <linearGradient key={s.name} id={`${id}-a${series.indexOf(s)}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" style={{ stopColor: s.color }} stopOpacity="0.32" />
                    <stop offset="1" style={{ stopColor: s.color }} stopOpacity="0" />
                  </linearGradient>
                ))}
            </defs>

            {yn.ticks.map((t) => (
              <g key={t}>
                <line className="gridline" x1={m.l} x2={m.l + W} y1={sy(t)} y2={sy(t)} />
                <text x={m.l - 10} y={sy(t)} dy="0.32em" textAnchor="end">
                  {tick(t)}
                </text>
              </g>
            ))}
            <line className="axisline" x1={m.l} x2={m.l + W} y1={m.t + H} y2={m.t + H} />
            {xTicks.map((t) => (
              <g key={`${t.at}`}>
                <line className="axisline" x1={t.at} x2={t.at} y1={m.t + H} y2={m.t + H + 4} />
                <text x={t.at} y={m.t + H + 17} textAnchor="middle">
                  {t.text.length > 12 ? `${t.text.slice(0, 11)}…` : t.text}
                </text>
              </g>
            ))}
            {(yLabel || title) && (
              <text className="t-title" x={0} y={10}>
                {title && <tspan className="t-ink">{title}</tspan>}
                {title && yLabel ? ' · ' : ''}
                {yLabel}
              </text>
            )}
            {xLabel && (
              <text className="t-title" x={m.l + W} y={height - 4} textAnchor="end">
                {xLabel} →
              </text>
            )}

            {shown.map((s) => {
              const si = series.indexOf(s)
              const hot = hit?.series === s || undefined
              if (s.type === 'band')
                return (
                  <g key={s.name} className="mark" data-hot={hot}>
                    {s.data.map((p, i) =>
                      typeof p.lo === 'number' && typeof p.hi === 'number' ? (
                        <g key={i} className="a-fade" style={delay(200 + i * 60)}>
                          <rect x={sx(p.x) - 6} y={sy(p.hi)} width={12} height={Math.max(2, sy(p.lo) - sy(p.hi))} rx={6} fill={s.color} opacity={0.2} />
                          <rect x={sx(p.x) - 6} y={sy(p.hi)} width={12} height={Math.max(2, sy(p.lo) - sy(p.hi))} rx={6} fill="none" stroke={s.color} strokeOpacity={0.55} />
                        </g>
                      ) : null,
                    )}
                  </g>
                )
              if (s.type === 'bars') {
                const bi = barSeries.indexOf(s)
                return (
                  <g key={s.name} className="mark" data-hot={hot}>
                    {s.data.map((p, i) => {
                      if (p.y === null || p.y === 0) return null
                      const x = sx(p.x) + (bi - (barSeries.length - 1) / 2) * (barW + 2) - barW / 2
                      const y0 = Math.min(sy(p.y), baseline)
                      const h = Math.max(1.5, Math.abs(baseline - sy(p.y)))
                      const r = Math.min(4, barW / 2, h)
                      const up = p.y >= 0
                      return (
                        <path
                          key={i}
                          className={`a-grow-y ${up ? '' : 'a-grow-top'}`}
                          style={delay(120 + i * Math.min(40, 700 / s.data.length) + bi * 60)}
                          d={
                            up
                              ? `M${x},${y0 + h}V${y0 + r}Q${x},${y0} ${x + r},${y0}H${x + barW - r}Q${x + barW},${y0} ${x + barW},${y0 + r}V${y0 + h}Z`
                              : `M${x},${y0}V${y0 + h - r}Q${x},${y0 + h} ${x + r},${y0 + h}H${x + barW - r}Q${x + barW},${y0 + h} ${x + barW},${y0 + h - r}V${y0}Z`
                          }
                          fill={s.color}
                          opacity={hit && hit.point !== p ? 0.55 : 1}
                        />
                      )
                    })}
                  </g>
                )
              }
              const pts = s.data.filter((p) => p.y !== null && Number.isFinite(p.y)).map((p) => [sx(p.x), sy(p.y as number)] as const)
              if (s.type === 'line') {
                const d = s.smooth ? smoothPath(pts) : linePath(pts)
                if (!pts.length) return null
                const area = `${d}L${pts.at(-1)![0]},${baseline}L${pts[0]![0]},${baseline}Z`
                return (
                  <g key={s.name} className="mark" data-hot={hot}>
                    {s.area && <path className="a-fade" style={delay(500)} d={area} fill={`url(#${id}-a${si})`} />}
                    {s.dashed ? (
                      <g clipPath={`url(#${id}-wipe)`}>
                        <path d={d} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray="5 5" strokeLinecap="round" />
                      </g>
                    ) : (
                      <>
                        <path className="a-draw" pathLength={1} style={delay(si * 90)} d={d} fill="none" stroke={s.color} strokeOpacity={0.16} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                        <path className="a-draw" pathLength={1} style={delay(si * 90)} d={d} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      </>
                    )}
                    {s.markers &&
                      pts.map(([x, y], i) => (
                        <Symbol key={i} kind={s.symbol} x={x} y={y} r={s.size ?? 3} className="a-pop" style={delay(300 + (i / pts.length) * 900)} fill="var(--panel)" stroke={s.color} strokeWidth={1.5} />
                      ))}
                  </g>
                )
              }
              const r = s.size ?? 4.5
              const body = pts.map(([x, y], i) => (
                <g key={i} className={stagger ? 'a-pop' : undefined} style={stagger ? delay(120 + ((x - m.l) / W) * 700 + i * stagger * 0.2) : undefined}>
                  <Symbol kind={s.symbol} x={x} y={y} r={r + 4} fill={s.color} opacity={0.14} />
                  <Symbol kind={s.symbol} x={x} y={y} r={r} fill={s.color} stroke="var(--panel)" strokeWidth={1.5} opacity={s.opacity ?? 0.95} />
                </g>
              ))
              return (
                <g key={s.name} className={`mark ${stagger ? '' : 'a-fade'}`} data-hot={hot}>
                  {body}
                </g>
              )
            })}

            {hit && (
              <g pointerEvents="none">
                <line className="cross" x1={hit.px} x2={hit.px} y1={m.t} y2={m.t + H} />
                {hit.series.type !== 'bars' && hit.series.type !== 'band' && (
                  <>
                    <line className="cross" x1={m.l} x2={m.l + W} y1={hit.py} y2={hit.py} />
                    <circle cx={hit.px} cy={hit.py} r={11} fill="none" stroke={hit.series.color} strokeOpacity={0.5} />
                    <circle cx={hit.px} cy={hit.py} r={5.5} fill={hit.series.color} stroke="var(--ink)" strokeWidth={1.5} />
                  </>
                )}
              </g>
            )}
          </svg>
        )
      }}
    </Frame>
  )
}
