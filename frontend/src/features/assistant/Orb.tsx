import { useId } from 'react'
import { STAGE_COUNT, type StepState } from '@/features/assistant/run'

/**
 * O núcleo do agente: anéis de pontos (matriz circular) dentro de um aro dividido em arcos, um por
 * etapa. É o mesmo desenho em três tamanhos (barra, cabeçalho, palco); só o maior mostra o numeral.
 */
const C = 60
const RING_R = 56
const GAP_DEG = 9

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

function arc(r: number, from: number, to: number): string {
  const [x1, y1] = polar(r, from)
  const [x2, y2] = polar(r, to)
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const SLICE = 360 / STAGE_COUNT
const ARCS = Array.from({ length: STAGE_COUNT }, (_, i) => arc(RING_R, i * SLICE + GAP_DEG / 2, (i + 1) * SLICE - GAP_DEG / 2))

/** Anéis de pontos: raio, quantidade de pontos, espessura. Finos no núcleo grande, grossos nos pequenos. */
interface Ring {
  r: number
  n: number
  w: number
}
const FINE: readonly Ring[] = [
  { r: 47, n: 48, w: 1.7 },
  { r: 39, n: 36, w: 1.6 },
  { r: 31, n: 26, w: 1.5 },
  { r: 23, n: 16, w: 1.4 },
]
const COARSE: readonly Ring[] = [
  { r: 38, n: 12, w: 7.5 },
  { r: 22, n: 6, w: 6 },
]

function Rings({ rings, extra = 0, className }: { rings: readonly Ring[]; extra?: number; className: string }) {
  return (
    <g className={className}>
      {rings.map((ring) => (
        <circle
          key={ring.r}
          cx={C}
          cy={C}
          r={ring.r}
          strokeWidth={ring.w + extra}
          strokeDasharray={`0 ${((2 * Math.PI * ring.r) / ring.n).toFixed(3)}`}
        />
      ))}
    </g>
  )
}

const WEDGE = [0, 1, 2, 3, 4, 5, 6].map((i) => {
  const [x1, y1] = polar(64, -i * 14 - 14)
  const [x2, y2] = polar(64, -i * 14)
  return { d: `M${C} ${C}L${x1.toFixed(2)} ${y1.toFixed(2)}A64 64 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`, o: 1 - i * 0.14 }
})

export type OrbMood = 'idle' | 'ready' | 'working' | 'done' | 'error' | 'stopped'

export interface OrbProps {
  mood: OrbMood
  /** Estado de cada etapa; sem isso o aro fica neutro. */
  steps?: readonly StepState[]
  /** Numeral do centro (só aparece quando o núcleo está grande). */
  value?: string
  caption?: string
  className?: string
  /** `fine` é o núcleo grande, com numeral; `coarse` é a versão de barra e cabeçalho. */
  detail?: 'fine' | 'coarse'
  /** Muda a cada etapa: dispara um pulso que se abre a partir do aro. */
  pulse?: string | number
  /** Marca este núcleo como o destino dos feixes que saem da página. */
  anchor?: boolean
}

export function Orb({ mood, steps, value, caption, className, detail = 'coarse', pulse, anchor }: OrbProps) {
  const id = useId().replace(/:/g, '')
  return (
    <span className={`ag-orb ${className ?? ''}`} data-mood={mood} data-detail={detail} data-agent-core={anchor ? '' : undefined}>
      <svg viewBox="0 0 120 120" aria-hidden focusable="false">
        <defs>
          <mask id={`${id}-w`} maskUnits="userSpaceOnUse" x="-10" y="-10" width="140" height="140">
            {WEDGE.map((w, i) => (
              <path key={i} d={w.d} fill="#fff" opacity={w.o} />
            ))}
          </mask>
        </defs>

        {pulse !== undefined && <circle key={pulse} className="ag-orb__ping" cx={C} cy={C} r={RING_R} />}
        <g className="ag-orb__arcs">
          {ARCS.map((d, i) => (
            <g key={i} data-state={steps?.[i] ?? 'idle'}>
              <path className="ag-orb__arc-halo" d={d} />
              <path className="ag-orb__arc" d={d} />
              <path className="ag-orb__arc-run" d={d} pathLength={1} />
            </g>
          ))}
        </g>

        <Rings className="ag-orb__coarse" rings={COARSE} />
        <Rings className="ag-orb__fine" rings={FINE} />
        <g className="ag-orb__sweep" mask={`url(#${id}-w)`}>
          <Rings className="ag-orb__sweep-coarse" rings={COARSE} />
          <Rings className="ag-orb__sweep-fine" rings={FINE} extra={0.5} />
        </g>
        <circle className="ag-orb__eye-ring" cx={C} cy={C} r={14} />
        <circle className="ag-orb__eye" cx={C} cy={C} r={4.5} />
      </svg>
      <span className="ag-orb__center" aria-hidden>
        <span className="ag-orb__value">{value}</span>
        {caption && <span className="ag-orb__caption">{caption}</span>}
      </span>
    </span>
  )
}
