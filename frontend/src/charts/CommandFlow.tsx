/**
 * O fluxo da página inicial: arquivos de `dados/` convergem para o núcleo (linhas carregadas) e
 * saem como investigações, separadas por ambiente. Tudo em SVG; partículas percorrem os traços.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useInView } from '@/fx/useInView'
import { int } from '@/lib/format'
import { delay, useSvgId } from './scale'
import { Orb } from './Orb'

export interface FlowSource {
  name: string
  rows: number
  investigation: string
}
export interface FlowInvestigation {
  id: string
  name: string
  category: string
  env: 'iss' | 'solo'
  rows: number
  unit: string
  alerts: number
  to?: string
}

const W = 1240
const H = 540
const CORE = { x: 668, y: 270, r: 84 }
const ENV = {
  iss: { label: 'Microgravidade · ISS', color: 'var(--signal)' },
  solo: { label: 'Investigação em solo', color: 'var(--violet)' },
} as const

const short = (name: string) => (name.length > 27 ? `${name.slice(0, 26)}…` : name)
const SRC_X = 240
const MERGE_X = 420

export function CommandFlow({
  sources,
  otherFiles,
  investigations,
  totalRows,
  totalAlerts,
}: {
  sources: readonly FlowSource[]
  otherFiles: number
  investigations: readonly FlowInvestigation[]
  totalRows: number
  totalAlerts: number
}) {
  const [view, on] = useInView<HTMLDivElement>('0px')
  const [hot, setHot] = useState<string | null>(null)
  const navigate = useNavigate()
  const id = useSvgId('flow')

  // ---- esquerda: um traço por arquivo carregado
  const top = 64
  const gap = Math.min(46, (H - 2 * top) / Math.max(1, sources.length - 1 + (otherFiles ? 1 : 0)))
  const maxSource = Math.max(...sources.map((s) => s.rows), 1)
  const left = sources.map((s, i) => {
    const y = top + i * gap
    return { ...s, y, d: `M${SRC_X},${y}C${SRC_X + 110},${y} ${MERGE_X - 96},${CORE.y} ${MERGE_X},${CORE.y}`, w: 1 + 5 * Math.sqrt(s.rows / maxSource) }
  })
  const otherY = top + sources.length * gap

  // ---- direita: tronco, dois ramos (ambiente) e uma ponta por investigação
  const groups = (['iss', 'solo'] as const)
    .map((env) => ({ env, items: investigations.filter((v) => v.env === env) }))
    .filter((group) => group.items.length)
  const maxRows = Math.max(...investigations.map((v) => v.rows), 1)
  const rowGap = Math.min(92, (H - 90) / Math.max(1, investigations.length - 1 + (groups.length - 1) * 0.5))
  const firstY = (H - (investigations.length - 1 + (groups.length - 1) * 0.5) * rowGap) / 2
  const branches = groups.map((group, gi) => {
    // posição da primeira ponta do ramo: as pontas anteriores mais meio intervalo entre ramos
    const before = groups.slice(0, gi).reduce((sum, prev) => sum + prev.items.length, 0)
    const ends = group.items.map((v, i) => ({ ...v, y: firstY + (before + i + gi * 0.5) * rowGap, w: 1.5 + 11 * Math.sqrt(v.rows / maxRows) }))
    const y = ends.reduce((sum, e) => sum + e.y, 0) / ends.length
    return { ...group, y, ends, w: Math.min(16, 2 + ends.reduce((sum, e) => sum + e.w, 0) * 0.7) }
  })
  const NODE_X = 914
  const END_X = 1040
  const exit = CORE.x + CORE.r * 1.08

  return (
    <div ref={view} className="chart flow" data-on={on} data-focus={hot !== null || undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Fluxo dos dados: ${sources.length} arquivos carregados, ${int(totalRows)} linhas, ${investigations.length} investigações`}>
        <defs>
          <linearGradient id={`${id}-in`} x1={SRC_X} x2={MERGE_X} gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--ink)' }} stopOpacity="0.5" />
            <stop offset="1" style={{ stopColor: 'var(--signal)' }} />
          </linearGradient>
          {branches.map((b) => (
            <linearGradient key={b.env} id={`${id}-${b.env}`} x1={exit} x2={END_X} gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'var(--signal)' }} />
              <stop offset="0.45" style={{ stopColor: ENV[b.env].color }} />
              <stop offset="1" style={{ stopColor: ENV[b.env].color }} stopOpacity="0.85" />
            </linearGradient>
          ))}
        </defs>

        {/* ---------- arquivos ---------- */}
        <text className="t-title" x={SRC_X - 14} y={24} textAnchor="end">
          Arquivos em dados/
        </text>
        {left.map((s, i) => (
          <g key={s.name} className="mark" data-hot={hot === null || hot === s.investigation || undefined}>
            <path id={`${id}-s${i}`} className="a-draw" pathLength={1} style={delay(i * 70)} d={s.d} fill="none" stroke={`url(#${id}-in)`} strokeOpacity={0.14} strokeWidth={s.w + 5} strokeLinecap="round" />
            <path className="a-draw" pathLength={1} style={delay(i * 70)} d={s.d} fill="none" stroke={`url(#${id}-in)`} strokeWidth={Math.max(1, s.w * 0.45)} strokeLinecap="round" />
            <g className="a-fade" style={delay(i * 70)}>
              <circle cx={SRC_X} cy={s.y} r={3.5} fill="var(--void)" stroke="var(--ink-2)" />
              <text className="t-ink2 t-sans" x={SRC_X - 14} y={s.y - 2} textAnchor="end">
                {short(s.name)}
              </text>
              <text x={SRC_X - 14} y={s.y + 11} textAnchor="end">
                {s.investigation} · {int(s.rows)} linhas
              </text>
            </g>
            {on && (
              <circle r={1.7} fill="var(--signal-2)">
                <animateMotion dur={`${3.2 + (i % 4) * 0.7}s`} begin={`${1.4 + i * 0.37}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.6 1">
                  <mpath href={`#${id}-s${i}`} />
                </animateMotion>
              </circle>
            )}
          </g>
        ))}
        {otherFiles > 0 && (
          <g className="a-fade" style={delay(sources.length * 70)}>
            <circle cx={SRC_X} cy={otherY} r={3.5} fill="none" stroke="var(--ink-4)" strokeDasharray="2 2" />
            <text x={SRC_X - 14} y={otherY + 4} textAnchor="end">
              +{otherFiles} fora do banco
            </text>
          </g>
        )}

        {/* ---------- núcleo ---------- */}
        <g className="a-fade" style={delay(700)}>
          <text className="t-big" x={MERGE_X + 14} y={CORE.y - 12}>
            {int(totalRows)}
          </text>
          <text className="t-title" x={MERGE_X + 14} y={CORE.y + 22}>
            Linhas
          </text>
          <circle cx={MERGE_X} cy={CORE.y} r={3} fill="var(--signal)" />
        </g>
        <Orb cx={CORE.x} cy={CORE.y} r={CORE.r} share={Math.min(0.4, (totalAlerts / Math.max(1, totalRows)) * 12)} start={600} />
        <g className="a-fade" style={delay(1100)}>
          <circle cx={CORE.x - 34} cy={CORE.y + CORE.r * 1.62 + 22} r={3} fill="var(--magenta)" />
          <text className="t-ink2" x={CORE.x - 24} y={CORE.y + CORE.r * 1.62 + 26}>
            {int(totalAlerts)} alertas de qualidade
          </text>
        </g>

        {/* ---------- investigações ---------- */}
        {branches.map((b, bi) => {
          const trunk = `M${exit},${CORE.y}C${exit + 70},${CORE.y} ${NODE_X - 90},${b.y} ${NODE_X},${b.y}`
          const env = ENV[b.env]
          return (
            <g key={b.env}>
              <path id={`${id}-t${bi}`} className="a-draw" pathLength={1} style={delay(1200 + bi * 120)} d={trunk} fill="none" stroke={`url(#${id}-${b.env})`} strokeOpacity={0.16} strokeWidth={b.w + 8} strokeLinecap="round" />
              <path className="a-draw" pathLength={1} style={delay(1200 + bi * 120)} d={trunk} fill="none" stroke={`url(#${id}-${b.env})`} strokeWidth={b.w} strokeLinecap="round" />
              {on &&
                [0, 1, 2].map((k) => (
                  <circle key={k} r={1.8} fill="var(--spark)">
                    <animateMotion dur="2.6s" begin={`${2.4 + k * 0.85 + bi * 0.4}s`} repeatCount="indefinite">
                      <mpath href={`#${id}-t${bi}`} />
                    </animateMotion>
                  </circle>
                ))}
              {b.ends.map((e, ei) => {
                const d = `M${NODE_X},${b.y}C${NODE_X + 62},${b.y} ${END_X - 64},${e.y} ${END_X},${e.y}`
                const active = hot === null || hot === e.id
                return (
                  <g
                    key={e.id}
                    className="mark flow__end"
                    data-hot={active || undefined}
                    role={e.to ? 'link' : undefined}
                    tabIndex={e.to ? 0 : undefined}
                    aria-label={`${e.name}: ${int(e.rows)} ${e.unit.toLowerCase()}, ${e.alerts} alertas`}
                    onPointerEnter={() => setHot(e.id)}
                    onPointerLeave={() => setHot(null)}
                    onFocus={() => setHot(e.id)}
                    onBlur={() => setHot(null)}
                    onClick={() => e.to && navigate(e.to)}
                    onKeyDown={(event) => {
                      if (e.to && (event.key === 'Enter' || event.key === ' ')) navigate(e.to)
                    }}
                  >
                    <path id={`${id}-e${bi}${ei}`} className="a-draw" pathLength={1} style={delay(1500 + ei * 110 + bi * 160)} d={d} fill="none" stroke={env.color} strokeOpacity={0.15} strokeWidth={e.w + 6} strokeLinecap="round" />
                    <path className="a-draw" pathLength={1} style={delay(1500 + ei * 110 + bi * 160)} d={d} fill="none" stroke={env.color} strokeWidth={Math.max(1.2, e.w * 0.6)} strokeLinecap="round" />
                    {on && (
                      <circle r={1.6} fill="var(--spark)">
                        <animateMotion dur={`${2.2 + ei * 0.5}s`} begin={`${3 + ei * 0.6 + bi * 0.3}s`} repeatCount="indefinite">
                          <mpath href={`#${id}-e${bi}${ei}`} />
                        </animateMotion>
                      </circle>
                    )}
                    <g className="a-fade" style={delay(1900 + ei * 110 + bi * 160)}>
                      <rect x={END_X - 4} y={e.y - 34} width={W - END_X + 4} height={68} fill="transparent" />
                      <circle cx={END_X} cy={e.y} r={4} fill="var(--void)" stroke={env.color} strokeWidth={1.5} />
                      <text className="t-big" x={END_X + 16} y={e.y + 2}>
                        {int(e.rows)}
                        <tspan className="t-title" dx={8} dy={-1} style={{ font: '500 10.5px var(--label)', fill: 'var(--ink-3)' }}>
                          {e.unit}
                        </tspan>
                      </text>
                      <text className="t-ink t-sans" x={END_X + 16} y={e.y + 21} style={{ fontWeight: 500 }}>
                        {e.name}
                        {e.to && <tspan fill="var(--signal)"> ↗</tspan>}
                      </text>
                      <text x={END_X + 16} y={e.y + 36}>
                        {e.id} · {e.alerts} alertas
                      </text>
                    </g>
                  </g>
                )
              })}
              <g className="a-pop" style={delay(1450 + bi * 120)}>
                <circle cx={NODE_X} cy={b.y} r={15} fill="var(--void)" stroke={env.color} strokeWidth={1.5} />
                <circle cx={NODE_X} cy={b.y} r={21} fill="none" stroke={env.color} strokeOpacity={0.25} />
                <text className="t-ink" x={NODE_X} y={b.y + 4} textAnchor="middle" style={{ font: '500 12px var(--mono)' }}>
                  {b.ends.length}
                </text>
              </g>
              <text className="t-title a-fade" style={delay(1500 + bi * 120)} x={NODE_X - 18} y={b.y + (b.y < CORE.y ? -30 : 38)} textAnchor="end">
                {env.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
