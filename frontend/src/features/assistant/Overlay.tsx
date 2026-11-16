import { type CSSProperties, useEffect, useId, useState } from 'react'
import { IconCheck, KindIcon } from '@/features/assistant/icons'
import { type Box, boxOf, KIND_LABEL, type TargetEl, viewportBox, visiblePart } from '@/features/assistant/targets'

/**
 * A camada que transforma a página em palco: escurece o painel, deixa acesos os blocos que o agente lê
 * (cantoneiras, varredura, etiqueta) e desenha os feixes que saem deles e convergem para o núcleo.
 * Tudo em SVG, sem sombra: a luz é traço fino sobre traço largo e translúcido.
 */
export type OverlayPhase = 'ler' | 'estudos' | 'consultar' | 'compor' | 'peek'

interface Item {
  id: string
  kind: string
  label: string
  box: Box
  radius: number
  whole: boolean
}

interface Geometry {
  vw: number
  vh: number
  items: Item[]
  core: { x: number; y: number; r: number } | null
  dock: Box | null
  /** Painel e barra do agente: ficam fora do véu. */
  holes: (Box & { r: number })[]
  lateral: boolean
}

const radii = new WeakMap<Element, number>()
function radiusOf(el: Element): number {
  let r = radii.get(el)
  if (r === undefined) {
    r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
    radii.set(el, r)
  }
  return r
}

const round = (n: number) => Math.round(n * 2) / 2

function measure(targets: readonly TargetEl[], fallbackLabel: string, withFallback: boolean): Geometry {
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  const panelEl = document.querySelector('[data-agent-panel]')
  const panel = panelEl ? boxOf(panelEl) : null
  const free = viewportBox(panel)
  const lateral = !panel || (panel.h > vh * 0.6 && panel.x > vw * 0.35)

  const items: Item[] = []
  for (const t of targets) {
    if (!t.el.isConnected) continue
    const full = boxOf(t.el)
    const part = visiblePart(full, free)
    if (!part) continue
    items.push({
      id: t.id,
      kind: t.kind,
      label: t.label,
      box: { x: round(part.x), y: round(part.y), w: round(part.w), h: round(part.h) },
      radius: radiusOf(t.el),
      whole: part.h >= full.h - 1 && part.w >= full.w - 1,
    })
  }
  // página sem blocos marcados (ou todos fora da vista): o palco inteiro vira a fonte
  if (items.length === 0 && withFallback && free.w > 160 && free.h > 160) {
    const pad = 14
    items.push({
      id: '__palco',
      kind: 'screen',
      label: fallbackLabel,
      box: { x: round(free.x + pad), y: round(free.y + pad), w: round(free.w - pad * 2), h: round(free.h - pad * 2 - (lateral ? 120 : 0)) },
      radius: 16,
      whole: true,
    })
  }

  const coreEl = document.querySelector('[data-agent-core]')
  let core: Geometry['core'] = null
  if (coreEl) {
    const c = boxOf(coreEl)
    if (c.w > 8) core = { x: round(c.x + c.w / 2), y: round(c.y + c.h / 2), r: round((c.w / 2) * (56 / 60)) }
  }
  const dockEl = document.querySelector('[data-agent-dock-bar]')
  const dock = dockEl ? boxOf(dockEl) : null
  const holes: Geometry['holes'] = []
  if (panelEl && panel) holes.push({ ...panel, r: radiusOf(panelEl) })
  if (dockEl && dock) holes.push({ ...dock, r: radiusOf(dockEl) })
  return { vw, vh, items, core, dock, holes, lateral }
}

function useGeometry(targets: readonly TargetEl[], fallbackLabel: string, withFallback: boolean): Geometry | null {
  const [geo, setGeo] = useState<Geometry | null>(null)
  useEffect(() => {
    let frame = 0
    let last = ''
    const tick = () => {
      const next = measure(targets, fallbackLabel, withFallback)
      const key = JSON.stringify(next)
      if (key !== last) {
        last = key
        setGeo(next)
      }
      frame = window.requestAnimationFrame(tick)
    }
    tick()
    return () => window.cancelAnimationFrame(frame)
  }, [targets, fallbackLabel, withFallback])
  return geo
}

interface Beam {
  d: string
  sx: number
  sy: number
  ex: number
  ey: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MIN_GAP = 13

/**
 * Curva de cada bloco até o aro do núcleo. O ponto de chegada segue a direção de onde o bloco está
 * (limitada ao lado que dá para a página) e os vizinhos são afastados para os feixes não se sobreporem.
 */
function beams(geo: Geometry): Map<string, Beam> {
  const out = new Map<string, Beam>()
  const core = geo.core
  if (!core) return out
  // lateral: chegam pela esquerda do aro; folha (painel embaixo): chegam por cima
  const [lo, hi] = geo.lateral ? [114, 262] : [196, 344]
  const wall = geo.lateral && geo.holes[0] ? geo.holes[0].x - 8 : Infinity
  const starts = geo.items
    .map((it) => {
      const { x, y, w, h } = it.box
      const sx = geo.lateral ? x + w + 5 : x + w / 2
      const sy = geo.lateral ? y + Math.min(h / 2, 150) : y + h + 5
      const deg = ((Math.atan2(sy - core.y, sx - core.x) * 180) / Math.PI + 360) % 360
      return { id: it.id, sx, sy, deg: clamp(deg, lo, hi) }
    })
    .sort((a, b) => a.deg - b.deg || a.sy - b.sy)
  for (let i = 1; i < starts.length; i++) starts[i]!.deg = Math.max(starts[i]!.deg, starts[i - 1]!.deg + MIN_GAP)
  const over = starts.length ? Math.max(0, starts[starts.length - 1]!.deg - hi) : 0
  const R = core.r + 7
  const f = (v: number) => v.toFixed(1)
  for (const s of starts) {
    const a = ((s.deg - over) * Math.PI) / 180
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    const ex = core.x + R * ux
    const ey = core.y + R * uy
    const dist = Math.hypot(ex - s.sx, ey - s.sy)
    const pull = clamp(dist * 0.36, 28, 170)
    const reach = clamp(dist * 0.32, 30, 210)
    const c1x = geo.lateral ? Math.max(s.sx + 14, Math.min(s.sx + reach, wall)) : s.sx
    const c1y = geo.lateral ? s.sy : s.sy + reach
    out.set(s.id, {
      d: `M${f(s.sx)} ${f(s.sy)}C${f(c1x)} ${f(c1y)} ${f(ex + ux * pull)} ${f(ey + uy * pull)} ${f(ex)} ${f(ey)}`,
      sx: s.sx,
      sy: s.sy,
      ex,
      ey,
    })
  }
  return out
}

/** A pergunta sobe da barra de comando até o núcleo (só com o painel na lateral). */
function askBeam(geo: Geometry): Beam | null {
  if (!geo.core || !geo.dock || !geo.lateral) return null
  const sx = geo.dock.x + geo.dock.w - 56
  const sy = geo.dock.y - 3
  const a = (98 * Math.PI) / 180
  const R = geo.core.r + 7
  const ex = geo.core.x + R * Math.cos(a)
  const ey = geo.core.y + R * Math.sin(a)
  const dy = Math.abs(ey - sy)
  if (dy < 60) return null
  const f = (v: number) => v.toFixed(1)
  return {
    d: `M${f(sx)} ${f(sy)}C${f(sx)} ${f(sy - dy * 0.6)} ${f(ex + Math.cos(a) * Math.min(150, dy * 0.4))} ${f(ey + Math.sin(a) * Math.min(150, dy * 0.4))} ${f(ex)} ${f(ey)}`,
    sx,
    sy,
    ex,
    ey,
  }
}

function corners(b: Box, radius: number): string[] {
  const o = 5
  const x = b.x - o
  const y = b.y - o
  const r = x + b.w + o * 2
  const bt = y + b.h + o * 2
  const q = Math.min(radius + o, 22)
  const l = Math.max(q + 4, Math.min(26, b.w / 5, b.h / 4))
  return [
    `M${x} ${y + l}V${y + q}Q${x} ${y} ${x + q} ${y}H${x + l}`,
    `M${r - l} ${y}H${r - q}Q${r} ${y} ${r} ${y + q}V${y + l}`,
    `M${r} ${bt - l}V${bt - q}Q${r} ${bt} ${r - q} ${bt}H${r - l}`,
    `M${x + l} ${bt}H${x + q}Q${x} ${bt} ${x} ${bt - q}V${bt - l}`,
  ]
}

export function Overlay({
  phase,
  targets,
  fallbackLabel,
}: {
  phase: OverlayPhase
  targets: readonly TargetEl[]
  fallbackLabel: string
}) {
  const uid = useId().replace(/:/g, '')
  const peek = phase === 'peek'
  const geo = useGeometry(targets, fallbackLabel, !peek)
  if (!geo) return null
  const { vw, vh, items } = geo
  const lines = peek ? new Map<string, Beam>() : beams(geo)
  const question = peek ? null : askBeam(geo)

  return (
    <div className="ag-overlay" data-phase={phase} data-count={items.length} aria-hidden>
      <svg className="ag-veil" width={vw} height={vh}>
        <defs>
          <mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <rect width={vw} height={vh} fill="#fff" />
            {items.map((it) => (
              <rect
                key={it.id}
                x={it.box.x - 5}
                y={it.box.y - 5}
                width={it.box.w + 10}
                height={it.box.h + 10}
                rx={Math.min(it.radius + 5, 22)}
                fill="#000"
              />
            ))}
            {geo.holes.map((h, i) => (
              <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx={h.r} fill="#000" />
            ))}
          </mask>
        </defs>
        <rect className="ag-veil__fill" width={vw} height={vh} mask={`url(#${uid}-m)`} />
      </svg>

      <svg className="ag-beams" width={vw} height={vh}>
        <defs>
          <linearGradient id={`${uid}-scan`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--signal)', stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: 'var(--signal)', stopOpacity: 0.16 }} />
          </linearGradient>
          {items.map((it) => {
            const b = lines.get(it.id)
            return (
              b && (
                <linearGradient key={it.id} id={`${uid}-g-${it.id.replace(/[^\w-]/g, '_')}`} gradientUnits="userSpaceOnUse" x1={b.sx} y1={b.sy} x2={b.ex} y2={b.ey}>
                  <stop offset="0" style={{ stopColor: 'var(--signal)', stopOpacity: 0.18 }} />
                  <stop offset="0.6" style={{ stopColor: 'var(--signal)', stopOpacity: 0.7 }} />
                  <stop offset="1" style={{ stopColor: 'var(--signal-2)', stopOpacity: 1 }} />
                </linearGradient>
              )
            )
          })}
          {question && (
            <linearGradient id={`${uid}-q`} gradientUnits="userSpaceOnUse" x1={question.sx} y1={question.sy} x2={question.ex} y2={question.ey}>
              <stop offset="0" style={{ stopColor: 'var(--magenta)', stopOpacity: 0.9 }} />
              <stop offset="0.55" style={{ stopColor: 'var(--violet)', stopOpacity: 0.7 }} />
              <stop offset="1" style={{ stopColor: 'var(--signal-2)', stopOpacity: 0.9 }} />
            </linearGradient>
          )}
        </defs>

        {question && (
          <g className="ag-ask">
            <path className="ag-ask__halo" d={question.d} />
            <path className="ag-ask__line" d={question.d} pathLength={1} stroke={`url(#${uid}-q)`} />
            <path className="ag-ask__comet" d={question.d} pathLength={1} />
          </g>
        )}

        {items.map((it, i) => {
          const b = lines.get(it.id)
          const { x, y, w, h } = it.box
          return (
            <g key={it.id} className="ag-t" style={{ '--i': i } as CSSProperties}>
              <rect className="ag-t__edge" x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={Math.min(it.radius + 5, 22)} />
              <svg x={x - 4} y={y - 4} width={w + 8} height={h + 8} overflow="hidden">
                <g className="ag-t__scan" style={{ '--w': `${w + 8}px` } as CSSProperties}>
                  <rect x={-150} y={0} width={150} height={h + 8} fill={`url(#${uid}-scan)`} />
                  <rect className="ag-t__scan-line" x={-1.5} y={0} width={1.5} height={h + 8} />
                </g>
              </svg>
              {corners(it.box, it.radius).map((d, k) => (
                <path key={k} className="ag-t__corner" d={d} pathLength={1} />
              ))}
              {b && (
                <>
                  <path className="ag-beam__halo" d={b.d} />
                  <path className="ag-beam__line" d={b.d} pathLength={1} stroke={`url(#${uid}-g-${it.id.replace(/[^\w-]/g, '_')})`} />
                  <path className="ag-beam__comet" d={b.d} pathLength={1} />
                  <circle className="ag-beam__port" cx={b.sx} cy={b.sy} r={3} />
                  <circle className="ag-beam__dock" cx={b.ex} cy={b.ey} r={1.8} />
                </>
              )}
            </g>
          )
        })}
      </svg>

      {items.map((it, i) => (
        <span
          key={it.id}
          className="ag-tag"
          data-compact={it.box.w < 230 || undefined}
          style={{ left: it.box.x + 16, top: it.box.y - 5, maxWidth: Math.max(60, it.box.w - 32), '--i': i } as CSSProperties}
        >
          <span className="ag-tag__n">{String(i + 1).padStart(2, '0')}</span>
          <KindIcon kind={it.kind} size={12} />
          <span className="ag-tag__kind">{KIND_LABEL[it.kind] ?? it.kind}</span>
          <span className="ag-tag__label">{it.label}</span>
          <span className="ag-tag__state">
            <i className="ag-tag__dot" />
            <IconCheck size={11} />
          </span>
        </span>
      ))}
    </div>
  )
}
