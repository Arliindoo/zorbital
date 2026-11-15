/**
 * Reconstrução da queima de uma gota a partir do que a fonte registra.
 *
 * A fonte dá os extremos de cada etapa (diâmetro inicial, diâmetro na extinção, duração ou taxa de
 * queima), não a curva. Entre os extremos usamos a lei do d² — o quadrado do diâmetro cai em linha
 * reta com o tempo —, que é o modelo clássico da queima de gotas em microgravidade. O que sai
 * daqui é uma reconstrução que passa pelos valores medidos; não é a curva medida.
 */

export type FlameKind = 'hot' | 'cool'

export interface BurnStage {
  kind: FlameKind
  t0: number
  t1: number
  dStart: number
  dEnd: number
  /** o diâmetro final deste trecho foi estimado (não está na fonte) */
  estimated: boolean
  /** o fim deste trecho não está registrado: o trecho é só indicativo */
  open: boolean
}

export interface DropletPlan {
  d0: number
  stages: BurnStage[]
  duration: number
}

/** Diâmetro pela lei do d² entre dois extremos, em u ∈ [0, 1]. */
export function d2(dStart: number, dEnd: number, u: number): number {
  const k = Math.min(1, Math.max(0, u))
  return Math.sqrt(Math.max(0, dStart * dStart - (dStart * dStart - dEnd * dEnd) * k))
}

/** Diâmetro depois de queimar `seconds` à taxa K (mm²/s) a partir de `dStart`. */
export function afterBurning(dStart: number, k: number, seconds: number): number {
  return Math.sqrt(Math.max(0, dStart * dStart - k * seconds))
}

/** Tempo para ir de `dStart` a `dEnd` à taxa K (mm²/s). */
export function burnTime(dStart: number, dEnd: number, k: number): number {
  return k > 0 ? Math.max(0, (dStart * dStart - dEnd * dEnd) / k) : 0
}

/** Taxa de queima média entre os extremos de um trecho (mm²/s). */
export function meanRate(stage: BurnStage): number {
  const dt = stage.t1 - stage.t0
  return dt > 0 ? (stage.dStart * stage.dStart - stage.dEnd * stage.dEnd) / dt : 0
}

export interface StageInput {
  kind: FlameKind
  dEnd: number
  duration: number
  estimated?: boolean
  open?: boolean
}

/** Encadeia os trechos: cada um começa no diâmetro em que o anterior terminou. */
export function plan(d0: number, inputs: readonly StageInput[]): DropletPlan {
  const stages: BurnStage[] = []
  let t = 0
  let d = d0
  for (const input of inputs) {
    if (!(input.duration > 0)) continue
    const dEnd = Math.min(d, Math.max(0, input.dEnd))
    stages.push({ kind: input.kind, t0: t, t1: t + input.duration, dStart: d, dEnd, estimated: input.estimated ?? false, open: input.open ?? false })
    t += input.duration
    d = dEnd
  }
  return { d0, stages, duration: t }
}

export interface DropletState {
  /** diâmetro da gota (mm) */
  d: number
  /** trecho em curso; nulo antes da ignição e depois do fim */
  stage: BurnStage | null
  /** progresso dentro do trecho, 0..1 */
  u: number
  flame: FlameKind | null
}

export function stateAt(p: DropletPlan, t: number): DropletState {
  if (t <= 0 || !p.stages.length) return { d: p.d0, stage: null, u: 0, flame: null }
  for (const stage of p.stages) {
    if (t < stage.t1) {
      const u = (t - stage.t0) / (stage.t1 - stage.t0)
      return { d: d2(stage.dStart, stage.dEnd, u), stage, u, flame: stage.kind }
    }
  }
  return { d: p.stages.at(-1)!.dEnd, stage: null, u: 1, flame: null }
}

/** Pontos (t, (D/D0)²) da reconstrução: um trecho reto por etapa. */
export function d2Curve(p: DropletPlan): [number, number][] {
  const points: [number, number][] = [[0, 1]]
  for (const stage of p.stages) points.push([stage.t1, (stage.dEnd / p.d0) ** 2])
  return points
}
