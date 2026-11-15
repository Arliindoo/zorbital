/** Monta a reprodução de um ensaio de gota (FLEX, CFI) a partir dos extremos medidos. */

import { fixed } from '@/lib/format'
import { d2Curve, meanRate, plan as makePlan, type StageInput, stateAt } from '../replay/droplet'
import { type DropletRun, dropletScene, type Ending } from '../scenes/droplet'
import type { ChartSeries, Phase, Readout, SimRun, StageDef, Tone } from '../types'

export const FLAME_LABEL = { hot: 'Chama quente', cool: 'Chama fria' } as const
export const FLAME_TONE: Record<'hot' | 'cool', Tone> = { hot: 'hot', cool: 'cool' }

export interface DropletInput {
  id: string
  label: string
  title: string
  group?: string
  tone: Tone
  toneLabel: string
  level: number | null
  d0: number
  stages: readonly StageInput[]
  ending: Ending
  fiber: boolean | null
  glow: number
  conditions: readonly Readout[]
  mix?: SimRun['mix']
  /** taxa de queima como está na fonte, por chama (aparece ao lado da reconstruída) */
  kSource?: { hot?: number | null; cool?: number | null; unit: string; hint?: string }
  verdict: SimRun['verdict']
  notes: readonly string[]
  clockNote?: string
}

export function dropletRun(i: DropletInput): SimRun<DropletRun> {
  const plan = makePlan(i.d0, i.stages)
  const lead = Math.max(0.5, plan.duration * 0.075)
  const phases: Phase[] = [{ id: 'ignicao', label: 'Implantação e ignição', t0: -lead, t1: 0, tone: 'amber' }]
  const series: ChartSeries[] = []
  const curve = d2Curve(plan)
  plan.stages.forEach((stage, k) => {
    phases.push({ id: `${stage.kind}${k}`, label: FLAME_LABEL[stage.kind], t0: stage.t0, t1: stage.t1, tone: FLAME_TONE[stage.kind], open: stage.open })
    series.push({ tone: FLAME_TONE[stage.kind], points: [curve[k]!, curve[k + 1]!], dashed: stage.estimated || stage.open })
  })

  return {
    id: i.id,
    label: i.label,
    title: i.title,
    group: i.group,
    tone: i.tone,
    toneLabel: i.toneLabel,
    level: i.level,
    playable: true,
    start: -lead,
    duration: plan.duration,
    wall: Math.min(24, Math.max(9, 6 + plan.duration * 0.3)),
    clock: { label: 'Tempo de queima', unit: 's', digits: 2, note: i.clockNote },
    phases,
    conditions: i.conditions,
    mix: i.mix,
    telemetry(t) {
      const st = stateAt(plan, t)
      const out: Readout[] = [
        { label: 'Diâmetro da gota', value: fixed(st.d, 2), unit: 'mm', soft: t > 0 && st.stage !== null },
        { label: '(D/D0)²', value: fixed((st.d / plan.d0) ** 2, 3), soft: t > 0 && st.stage !== null },
      ]
      if (st.stage) {
        out.push({
          label: 'K do trecho',
          value: fixed(meanRate(st.stage), 3),
          unit: 'mm²/s',
          tone: FLAME_TONE[st.stage.kind],
          soft: true,
          hint: 'Taxa média entre o começo e o fim deste trecho (queda de D² dividida pelo tempo).',
        })
        const source = i.kSource?.[st.stage.kind]
        if (source !== null && source !== undefined) out.push({ label: 'K na fonte', value: fixed(source, 3), unit: i.kSource!.unit, hint: i.kSource!.hint })
      }
      return out
    },
    phaseAt(t) {
      if (t < 0) return { label: 'Implantação e ignição', tone: 'amber' }
      const st = stateAt(plan, t)
      if (st.stage) return { label: FLAME_LABEL[st.stage.kind], tone: FLAME_TONE[st.stage.kind] }
      return { label: i.verdict.label, tone: i.verdict.tone }
    },
    verdict: i.verdict,
    chart: {
      xLabel: 'tempo (s)',
      yLabel: '(D/D0)²',
      series,
      yZero: true,
      cursor: (t) => (t >= 0 ? [Math.min(t, plan.duration), (stateAt(plan, t).d / plan.d0) ** 2] : [0, 1]),
    },
    notes: i.notes,
    state: { plan, fiber: i.fiber, ending: i.ending, glow: i.glow },
  }
}

export interface BlockedInput {
  id: string
  label: string
  title: string
  group?: string
  reason: string
  conditions: readonly Readout[]
  mix?: SimRun['mix']
}

/** Ensaio que não dá para reproduzir: aparece na faixa, com o motivo. Nada é inventado. */
export function blockedRun(i: BlockedInput): SimRun<DropletRun> {
  return {
    id: i.id,
    label: i.label,
    title: i.title,
    group: i.group,
    tone: 'faint',
    toneLabel: 'Sem reconstrução',
    level: null,
    playable: false,
    blocked: i.reason,
    start: 0,
    duration: 1,
    wall: 1,
    clock: { label: 'Tempo', unit: 's', digits: 1 },
    phases: [],
    conditions: i.conditions,
    mix: i.mix,
    telemetry: () => [],
    phaseAt: () => ({ label: 'Sem reconstrução', tone: 'faint' }),
    verdict: { label: 'Sem reconstrução', detail: i.reason, tone: 'faint' },
    notes: [i.reason],
    state: { plan: makePlan(1, []), fiber: null, ending: 'aberto', glow: 0 },
  }
}

export const NOTES_DROPLET = [
  'Entre os diâmetros medidos, a curva é a lei do d² (o quadrado do diâmetro cai em linha reta): é uma reconstrução, não a curva medida.',
  'Posição e brilho da chama, o vapor e o movimento de agulhas e ignitores são ilustrativos: a tabela não traz o diâmetro da chama.',
] as const

export const dropletStage: StageDef<DropletRun> = {
  id: 'camara',
  label: 'Câmara',
  scale: 'gota · milímetros',
  title: 'Câmara de combustão',
  blurb: 'Duas agulhas formam a gota e recuam; os ignitores a acendem. Sem empuxo, a chama é uma esfera em volta da gota — e o que se mede é o diâmetro em que ela se apaga.',
  facts: () => [],
  experiment: true,
  sceneKey: 'gota',
  view: 'main',
  scene: dropletScene,
}
