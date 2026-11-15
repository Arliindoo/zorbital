/** BASS-II (PSI-25): materiais sólidos queimando num duto de escoamento, na MSG da ISS. */

import type { BassRow } from '@/api/types'
import { fixed, g } from '@/lib/format'
import { t as tr } from '@/lib/i18n'
import { type DuctRun, ductScene, type SampleShape } from '../scenes/duct'
import type { Readout, SimRun, SimStudy, StageDef, Tone } from '../types'
import { flightStages } from './flight'
import { td } from '@/lib/i18n-data'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

// a mesma ordem de cores do painel: o material tem a mesma cor nas duas vistas
const MATERIAL: Record<string, Tone> = {
  PMMA: 'signal',
  'SIBAL (tecido)': 'violet',
  'Não escrito na fonte': 'hot',
  'Nomex (tecido)': 'cool',
  'Cera (vela)': 'magenta',
}
const SHAPES: readonly SampleShape[] = ['Haste', 'Filme', 'Placa', 'Seção esférica', 'Vela', 'Tecido']

function sizeText(r: BassRow): string {
  const dia = num(r.diametro_mm)
  const wide = num(r.largura_cm)
  const thick = num(r.espessura_mm)
  if (dia !== null) return `⌀ ${g(dia)} mm`
  if (wide !== null && thick !== null) return `${g(wide * 10)} × ${g(thick)} mm`
  if (wide !== null) return tr(`${g(wide * 10)} mm wide`, `${g(wide * 10)} mm de largura`)
  if (thick !== null) return tr(`${g(thick)} mm thick`, `${g(thick)} mm de espessura`)
  return tr('dimensions not written in the source', 'medidas não escritas na fonte')
}

const signed = (v: number | null, digits: number) => (v === null ? '—' : fixed(v, digits, true))

function toRun(r: BassRow, o2Bounds: readonly [number, number]): SimRun<DuctRun> {
  const id = String(r.teste_id)
  const o2a = r.o2_inicial_pct ?? 0
  const o2b = num(r.o2_final_pct)
  const co2a = num(r.co2_inicial_pct)
  const co2b = num(r.co2_final_pct)
  const coa = num(r.co_inicial_ppm)
  const cob = num(r.co_final_ppm)
  const shape = (SHAPES.includes(r.geometria as SampleShape) ? r.geometria : 'Haste') as SampleShape
  const tone = MATERIAL[r.material_categoria] ?? 'dim'
  const at = (a: number | null, b: number | null, u: number) => (a === null ? null : b === null ? a : a + (b - a) * u)
  const read = (label: string, a: number | null, b: number | null, u: number, digits: number, unit: string): Readout => {
    const v = at(a, b, u)
    return { label, value: v === null ? '—' : fixed(v, digits), unit, soft: u > 0 && u < 1 && a !== null && b !== null }
  }

  const conditions: Readout[] = [
    { label: 'Material', value: td(r.material_categoria), hint: tr(`Source text: ${r.material_original}`, `Texto da fonte: ${r.material_original}`) },
    { label: tr('Geometry', 'Geometria'), value: td(r.geometria) },
    { label: tr('Dimensions', 'Medidas'), value: sizeText(r) },
    { label: tr('Initial O2', 'O2 inicial'), value: fixed(o2a, 1), unit: '% vol' },
    { label: tr('Researcher', 'Pesquisador'), value: r.pesquisador },
  ]
  const fanText = text(r.ventilador_display)
  const air = text(r.ar_display)
  if (fanText) conditions.push({ label: tr('Fan (panel)', 'Ventilador (painel)'), value: fanText, hint: tr('Panel reading, with the adjustments made during the test. Not a calibrated speed.', 'Leitura do painel, com os ajustes feitos durante o teste. Não é velocidade calibrada.') })
  if (air) conditions.push({ label: tr('Air (panel)', 'Ar (painel)'), value: air, hint: tr('Panel reading. Not a calibrated flow rate.', 'Leitura do painel. Não é vazão calibrada.') })
  if (r.ajustes_durante_teste === true) conditions.push({ label: tr('Adjustments during test', 'Ajustes no teste'), value: tr('yes', 'sim') })
  const frames = num(r.quadros_total)
  if (frames !== null) conditions.push({ label: tr('Frames recorded', 'Quadros gravados'), value: g(frames) })

  const dO2 = o2b === null ? null : o2b - o2a
  const dCO2 = co2a === null || co2b === null ? null : co2b - co2a
  const dCO = coa === null || cob === null ? null : cob - coa

  return {
    id,
    label: id,
    title: `${td(r.material_categoria)} · ${td(r.geometria)}`,
    group: r.pesquisador,
    tone,
    toneLabel: td(r.material_categoria),
    level: o2Bounds[1] > o2Bounds[0] ? (o2a - o2Bounds[0]) / (o2Bounds[1] - o2Bounds[0]) : 0.6,
    playable: true,
    start: 0,
    duration: 100,
    wall: 12,
    clock: { label: tr('Test progress', 'Andamento do teste'), unit: '%', digits: 0, note: tr('The source does not give the test duration: the clock runs from start (0) to end (100).', 'A fonte não traz a duração do teste: o relógio vai do começo (0) ao fim (100).') },
    phases: [{ id: 'teste', label: tr('From start to end of the test', 'Do começo ao fim do teste'), t0: 0, t1: 100, tone: 'hot' }],
    conditions,
    mix: [
      { label: 'O2', value: o2a / 100, tone: 'signal' },
      { label: tr('other gases', 'outros gases'), value: 1 - o2a / 100, tone: 'faint' },
    ],
    telemetry: (t) => {
      const u = t / 100
      return [read('O2', o2a, o2b, u, 1, '% vol'), read('CO2', co2a, co2b, u, 2, '% vol'), read('CO', coa, cob, u, 0, 'ppm')]
    },
    phaseAt: (t) => (t >= 100 ? { label: tr('Final readings', 'Leituras finais'), tone } : { label: tr('Sample burning', 'Amostra em chamas'), tone: 'hot' }),
    verdict: {
      label: tr('Final chamber readings', 'Leituras finais da câmara'),
      detail: tr(`ΔO2 ${signed(dO2, 1)} pp · ΔCO2 ${signed(dCO2, 2)} pp · ΔCO ${signed(dCO, 0)} ppm — they depend on duration and protocol, they are not the material's risk`, `ΔO2 ${signed(dO2, 1)} pp · ΔCO2 ${signed(dCO2, 2)} pp · ΔCO ${signed(dCO, 0)} ppm — dependem da duração e do protocolo, não são risco do material`),
      tone,
    },
    chart: {
      xLabel: tr('progress (%)', 'andamento (%)'),
      yLabel: tr('O2 in the chamber (% vol)', 'O2 na câmara (% vol)'),
      series: [{ tone: 'signal', points: [[0, o2a], [100, o2b ?? o2a]], dashed: true, dots: true }],
      cursor: (t) => [t, at(o2a, o2b, t / 100) ?? o2a],
    },
    notes: [
      tr('From the source: sample material, geometry and dimensions, O2/CO2/CO at the start and end of the test, and the panel readings (fan and air).', 'Da fonte: material, geometria e medidas da amostra, O2/CO2/CO no começo e no fim do teste, e as leituras do painel (ventilador e ar).'),
      tr('Between the initial and final readings, the gas values are a straight line: the source does not give what happened in between. They appear with a dashed underline.', 'Entre a leitura inicial e a final, os valores de gás são uma linha reta: a fonte não traz o que houve no meio. Aparecem sublinhados em tracejado.'),
      tr('The flame, the burn progress and the tracer speed are illustrative. The fan and air readings are from the panel, not calibrated speeds.', 'A chama, o avanço da queima e a velocidade dos traçadores são ilustrativos. As leituras de ventilador e ar são do painel, não velocidades calibradas.'),
      tr('This table has no risk label: the scene does not rank materials by safety.', 'Esta tabela não tem rótulo de risco: a cena não ranqueia materiais por segurança.'),
    ],
    state: { shape, width: num(r.largura_cm) === null ? null : num(r.largura_cm)! * 10, thickness: num(r.espessura_mm), diameter: num(r.diametro_mm), o2: [o2a, o2b], size: sizeText(r) },
  }
}

const ductStage: StageDef<DuctRun> = {
  id: 'duto',
  label: tr('Duct', 'Duto'),
  scale: tr('sample · centimeters', 'amostra · centímetros'),
  title: tr('BASS flow duct', 'Duto de escoamento do BASS'),
  blurb: tr('A fan slowly pushes the gas past the burning sample. Without buoyancy, it is this draft that brings oxygen: the flame shapes itself to the flow, with its blue base facing it.', 'Um ventilador empurra o gás devagar pela amostra em chamas. Sem empuxo, é esse sopro que traz oxigênio: a chama se molda ao escoamento, com a base azul virada para ele.'),
  facts: () => [],
  experiment: true,
  sceneKey: 'duto',
  view: 'main',
  scene: ductScene,
}

export function bassStudy(rows: readonly BassRow[]): SimStudy<DuctRun> {
  const byId = new Map(rows.map((r) => [String(r.teste_id), r]))
  const o2 = rows.map((r) => r.o2_inicial_pct ?? 0)
  const bounds: [number, number] = rows.length ? [Math.min(...o2), Math.max(...o2)] : [0, 1]
  return {
    id: 'bass',
    gravity: 'µg',
    place: 'ISS · Destiny · MSG',
    noun: tr(['test', 'tests'], ['teste', 'testes']),
    stripMeasure: tr('Bar height: initial O2 (from lowest to highest in the filter)', 'Altura da barra: O2 inicial (do menor ao maior no filtro)'),
    stages: [
      ...flightStages<DuctRun>({
        rack: 'msg',
        experiment: 'BASS-II',
        next: ductStage.id,
        glow: 'hot',
        noun: tr('test', 'teste'),
        dateOf: (run) => (byId.get(run.id)?.data as string | null) ?? null,
        rackFacts: [{ label: tr('Work volume', 'Volume de trabalho'), value: '≈ 255', unit: 'L' }],
      }),
      ductStage,
    ],
    runs: rows.map((r) => toRun(r, bounds)),
  }
}
