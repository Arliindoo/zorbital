/** Monta a reprodução de um ensaio de gota (FLEX, CFI) a partir dos extremos medidos. */

import { fixed } from '@/shared/lib/format'
import { t as tr } from '@/shared/lib/i18n'
import { d2Curve, meanRate, plan as makePlan, type StageInput, stateAt } from '@/visualization/replay/droplet'
import { type DropletRun, dropletScene, type Ending } from '@/visualization/scenes/droplet'
import type { ChartSeries, Phase, Readout, SimRun, StageDef, Tone } from '@/visualization/types'

export const FLAME_LABEL = { hot: tr('Hot flame', 'Chama quente'), cool: tr('Cool flame', 'Chama fria') } as const
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
  const phases: Phase[] = [{ id: 'ignicao', label: tr('Deployment and ignition', 'Implantação e ignição'), t0: -lead, t1: 0, tone: 'amber' }]
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
    clock: { label: tr('Burn time', 'Tempo de queima'), unit: 's', digits: 2, note: i.clockNote },
    phases,
    conditions: i.conditions,
    mix: i.mix,
    telemetry(t) {
      const st = stateAt(plan, t)
      const out: Readout[] = [
        { label: tr('Droplet diameter', 'Diâmetro da gota'), value: fixed(st.d, 2), unit: 'mm', soft: t > 0 && st.stage !== null },
        { label: '(D/D0)²', value: fixed((st.d / plan.d0) ** 2, 3), soft: t > 0 && st.stage !== null },
      ]
      if (st.stage) {
        out.push({
          label: tr('K of this segment', 'K do trecho'),
          value: fixed(meanRate(st.stage), 3),
          unit: 'mm²/s',
          tone: FLAME_TONE[st.stage.kind],
          soft: true,
          hint: tr('Mean rate between the start and end of this segment (drop in D² divided by time).', 'Taxa média entre o começo e o fim deste trecho (queda de D² dividida pelo tempo).'),
        })
        const source = i.kSource?.[st.stage.kind]
        if (source !== null && source !== undefined) out.push({ label: tr('K in the source', 'K na fonte'), value: fixed(source, 3), unit: i.kSource!.unit, hint: i.kSource!.hint })
      }
      return out
    },
    phaseAt(t) {
      if (t < 0) return { label: tr('Deployment and ignition', 'Implantação e ignição'), tone: 'amber' }
      const st = stateAt(plan, t)
      if (st.stage) return { label: FLAME_LABEL[st.stage.kind], tone: FLAME_TONE[st.stage.kind] }
      return { label: i.verdict.label, tone: i.verdict.tone }
    },
    verdict: i.verdict,
    chart: {
      xLabel: tr('time (s)', 'tempo (s)'),
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
    toneLabel: tr('No reconstruction', 'Sem reconstrução'),
    level: null,
    playable: false,
    blocked: i.reason,
    start: 0,
    duration: 1,
    wall: 1,
    clock: { label: tr('Time', 'Tempo'), unit: 's', digits: 1 },
    phases: [],
    conditions: i.conditions,
    mix: i.mix,
    telemetry: () => [],
    phaseAt: () => ({ label: tr('No reconstruction', 'Sem reconstrução'), tone: 'faint' }),
    verdict: { label: tr('No reconstruction', 'Sem reconstrução'), detail: i.reason, tone: 'faint' },
    notes: [i.reason],
    state: { plan: makePlan(1, []), fiber: null, ending: 'aberto', glow: 0 },
  }
}

export const NOTES_DROPLET = [
  tr('Between the measured diameters, the curve is the d² law (the square of the diameter falls in a straight line): it is a reconstruction, not the measured curve.', 'Entre os diâmetros medidos, a curva é a lei do d² (o quadrado do diâmetro cai em linha reta): é uma reconstrução, não a curva medida.'),
  tr('Flame position and brightness, the vapor and the movement of needles and igniters are illustrative: the table does not give the flame diameter.', 'Posição e brilho da chama, o vapor e o movimento de agulhas e ignitores são ilustrativos: a tabela não traz o diâmetro da chama.'),
] as const

export const dropletStage: StageDef<DropletRun> = {
  id: 'camara',
  label: tr('Chamber', 'Câmara'),
  scale: tr('droplet · millimeters', 'gota · milímetros'),
  title: tr('Combustion chamber', 'Câmara de combustão'),
  blurb: tr('Two needles form the droplet and retract; the igniters light it. Without buoyancy, the flame is a sphere around the droplet — and what is measured is the diameter at which it goes out.', 'Duas agulhas formam a gota e recuam; os ignitores a acendem. Sem empuxo, a chama é uma esfera em volta da gota — e o que se mede é o diâmetro em que ela se apaga.'),
  facts: () => [],
  experiment: true,
  sceneKey: 'gota',
  view: 'main',
  scene: dropletScene,
}
