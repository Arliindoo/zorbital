/** PSI-117: medição × modelo numérico de gotas, em solo. Uma condição (ou a série do modelo) = uma reprodução. */

import type { Dataset, Psi117Comparison, Row } from '@/api/types'
import { fixed, g } from '@/lib/format'
import { locate, type ModelRun, modelScene, sample } from '../scenes/model'
import type { Readout, SimRun, SimStudy, StageDef, Tone } from '../types'
import { groundStage } from './ground'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : String(v))

/** Condições de uma tabela da investigação, como estão no ReadMe (texto, sem interpretar). */
function fromReadme(table: Row | undefined): Readout[] {
  if (!table) return []
  const hint = 'Como está no ReadMe da investigação.'
  const out: Readout[] = [
    { label: 'Combustível', value: text(table.combustivel), hint },
    { label: 'D0 (ReadMe)', value: text(table.d0_mm_texto), unit: 'mm', hint },
    { label: 'XO2 (ReadMe)', value: text(table.xo2_texto), hint },
    { label: 'XN2 (ReadMe)', value: text(table.xn2_texto), hint },
  ]
  if (table.outro_gas) out.push({ label: text(table.outro_gas), value: text(table.outro_gas_valor_texto), hint })
  return out
}

function twinRun(row: Psi117Comparison, all: readonly Psi117Comparison[], table: Row | undefined, worst: number): SimRun<ModelRun> {
  const hot = row.tipo_chama === 'Chama quente'
  const tone: Tone = hot ? 'hot' : 'cool'
  const measured = row.medido_mm ?? 0
  const model = row.modelo_mm ?? 0
  const lo = num(row.limite_inferior_mm)
  const hi = num(row.limite_superior_mm)
  const band = lo !== null && hi !== null ? ([lo, hi] as const) : null
  const diff = num(row.diferenca_mm) ?? model - measured
  const d0 = Number.parseFloat(String(table?.d0_mm_texto ?? '').replace(',', '.')) || 4
  const same = all.filter((r) => r.tipo_chama === row.tipo_chama).sort((a, b) => a.pressao_atm - b.pressao_atm)
  const verdict: SimRun['verdict'] =
    row.modelo_na_faixa === true
      ? { label: 'Modelo dentro da faixa', detail: `modelo − medido = ${fixed(diff, 2, true)} mm; faixa informada de ${fixed(lo, 2)} a ${fixed(hi, 2)} mm`, tone: 'signal' }
      : row.modelo_na_faixa === false
        ? { label: 'Modelo fora da faixa', detail: `modelo − medido = ${fixed(diff, 2, true)} mm; faixa informada de ${fixed(lo, 2)} a ${fixed(hi, 2)} mm`, tone: 'red' }
        : { label: 'Sem faixa de incerteza', detail: `modelo − medido = ${fixed(diff, 2, true)} mm; a fonte só informa incerteza para a chama fria`, tone: 'dim' }
  return {
    id: `${row.tipo_chama}|${row.pressao_atm}`,
    label: `${g(row.pressao_atm)} atm`,
    title: `${row.tipo_chama} · medido × modelo`,
    group: row.tipo_chama,
    tone,
    toneLabel: row.tipo_chama,
    level: worst > 0 ? Math.abs(diff) / worst : 0.5,
    playable: true,
    start: 0,
    duration: 100,
    wall: 8,
    clock: { label: 'Andamento (ilustrativo)', unit: '%', digits: 0, note: 'A tabela só traz o diâmetro de extinção: o caminho até ele, na cena, é ilustrativo.' },
    phases: [
      { id: 'queima', label: `${row.tipo_chama} até a extinção`, t0: 0, t1: 82, tone },
      { id: 'leitura', label: 'Leitura final', t0: 82, t1: 100, tone: 'dim' },
    ],
    conditions: [
      { label: 'Chama', value: row.tipo_chama },
      { label: 'Pressão', value: g(row.pressao_atm), unit: 'atm' },
      { label: 'Nº de medições', value: g(row.n_medicoes), hint: 'Com duas medições na mesma pressão, o valor medido é a média.' },
      ...fromReadme(table),
    ],
    telemetry: () => [
      { label: 'Medido', value: fixed(measured, 2), unit: 'mm' },
      { label: 'Modelo', value: fixed(model, 2), unit: 'mm', tone: 'magenta' },
      { label: 'Modelo − medido', value: fixed(diff, 2, true), unit: 'mm' },
      { label: 'Faixa informada', value: band ? `${fixed(band[0], 2)}–${fixed(band[1], 2)}` : '—', unit: band ? 'mm' : undefined, tone: band ? 'signal' : undefined },
    ],
    phaseAt: (t) => (t < 82 ? { label: `${row.tipo_chama} · até a extinção`, tone } : { label: verdict.label, tone: verdict.tone }),
    verdict,
    chart: {
      xLabel: 'pressão (atm)',
      yLabel: '⌀ de extinção (mm): medido (branco) × modelo (magenta)',
      yZero: true,
      series: [
        { tone: 'ink', points: same.map((r) => [r.pressao_atm, r.medido_mm ?? 0] as const), dots: true },
        { tone: 'magenta', points: same.map((r) => [r.pressao_atm, r.modelo_mm ?? 0] as const), dots: true, dashed: true },
      ],
      cursor: () => [row.pressao_atm, measured],
    },
    notes: [
      'Da fonte: o diâmetro de extinção medido, o do modelo e a faixa de incerteza (que só existe para a chama fria).',
      'Anel branco: medição. Anel magenta tracejado: modelo. Anéis verdes: os limites da faixa de incerteza. Anel cinza tracejado: D0, do ReadMe.',
      'A tabela só traz o diâmetro em que a chama se apagou. O encolhimento das gotas na cena é ilustrativo, e a chama também.',
      'Medição e modelo são evidências diferentes. A "medição" desta tabela pode vir dos mesmos voos do CFI: compará-los não é validação independente.',
      ...(measured === 0 ? ['A fonte registra 0 para a medição nesta pressão.'] : []),
    ],
    state: { kind: 'twin', flame: hot ? 'hot' : 'cool', d0, measured, model, band },
  }
}

function seriesRun(data: Dataset, table: Row | undefined): SimRun<ModelRun> | null {
  const rows = data.rows.filter((r) => num(r.t_s) !== null && num(r.diametro_mm) !== null).sort((a, b) => (a.t_s as number) - (b.t_s as number))
  if (rows.length < 2) return null
  const n = rows.length
  const t = new Float32Array(n)
  const d = new Float32Array(n)
  const tmax = new Float32Array(n)
  const k = new Float32Array(n)
  const dT = new Float32Array(n)
  const dOH = new Float32Array(n)
  rows.forEach((r, i) => {
    t[i] = r.t_s as number
    d[i] = r.diametro_mm as number
    tmax[i] = num(r.t_max_k) ?? 0
    k[i] = num(r.k_mm2_s) ?? 0
    dT[i] = (num(r.razao_d_tmax_d_gota) ?? 0) * d[i]!
    dOH[i] = (num(r.razao_d_ohmax_d_gota) ?? 0) * d[i]!
  })
  const end = t[n - 1]!
  const step = Math.max(1, Math.ceil(n / 220))
  const curve: [number, number][] = []
  for (let i = 0; i < n; i += step) curve.push([t[i]!, tmax[i]!])
  const scenario = text(rows[0]!.cenario)
  return {
    id: 'serie',
    label: 'série',
    title: `${scenario} · saída do modelo`,
    group: 'Modelo numérico',
    tone: 'violet',
    toneLabel: 'Série do modelo',
    level: 0.75,
    playable: true,
    start: 0,
    duration: end,
    wall: 18,
    clock: { label: 'Tempo simulado', unit: 's', digits: 3 },
    phases: [{ id: 'serie', label: scenario, t0: 0, t1: end, tone: 'cool' }],
    conditions: [{ label: 'Natureza', value: 'simulado', hint: 'Resultado de simulação, não medição.' }, { label: 'Amostras', value: g(n) }, ...fromReadme(table)],
    telemetry: (time) => {
      const i = locate(t, time)
      return [
        { label: 'Diâmetro da gota', value: fixed(sample(d, i), 3), unit: 'mm' },
        { label: 'T máxima', value: fixed(sample(tmax, i), 0), unit: 'K', tone: sample(tmax, i) > 880 ? 'hot' : 'cool' },
        { label: 'K', value: fixed(sample(k, i), 3), unit: 'mm²/s' },
        { label: '⌀ de T máxima', value: fixed(sample(dT, i), 2), unit: 'mm' },
        { label: '⌀ de OH máximo', value: fixed(sample(dOH, i), 2), unit: 'mm', tone: 'violet' },
      ]
    },
    phaseAt: (time) => (time >= end ? { label: 'Fim da série', tone: 'violet' } : { label: scenario, tone: 'cool' }),
    verdict: { label: 'Fim da série', detail: `gota em ⌀ ${fixed(d[n - 1]!, 3)} mm depois de ${fixed(end, 2)} s simulados`, tone: 'violet' },
    chart: { xLabel: 'tempo (s)', yLabel: 'T máxima (K)', series: [{ tone: 'cool', points: curve }], cursor: (time) => [Math.min(time, end), sample(tmax, locate(t, time))] },
    notes: [
      'Tudo aqui é saída do modelo numérico, como está na fonte (natureza: SIMULADO). Não há medição nesta série.',
      'A casca luminosa é a superfície onde a temperatura é máxima (diâmetro = razão da fonte × diâmetro da gota); a cor segue a temperatura: azul nas temperaturas de chama fria, laranja acima de ~880 K.',
      'O anel violeta tracejado é onde o OH é máximo. Os traçadores entre a gota e a casca são ilustrativos.',
    ],
    state: { kind: 'series', t, d, tmax, dT, dOH },
  }
}

const modelStage: StageDef<ModelRun> = {
  id: 'dominio',
  label: 'Modelo',
  scale: 'gota · milímetros',
  title: 'Gota medida × gota do modelo',
  blurb: 'À esquerda, o que foi medido; à direita, o que o modelo prevê para a mesma pressão. As duas encolhem até o diâmetro em que a chama se apaga, e os anéis mostram se o modelo cai dentro da faixa de incerteza. O último item da faixa reproduz uma série inteira do modelo.',
  facts: () => [],
  experiment: true,
  sceneKey: 'modelo',
  view: 'main',
  scene: modelScene,
}

export function psi117Study(comparison: readonly Psi117Comparison[], series: Dataset | null, tables: Dataset | null): SimStudy<ModelRun> {
  const find = (file: string) => tables?.rows.find((r) => r.arquivo === file)
  const worst = Math.max(0, ...comparison.map((r) => Math.abs(num(r.diferenca_mm) ?? 0)))
  const ordered = [...comparison].sort((a, b) => a.tipo_chama.localeCompare(b.tipo_chama) || a.pressao_atm - b.pressao_atm)
  const runs = ordered.map((row) => twinRun(row, comparison, find('PROCI_2023_C12_Extinction_Diameter_vs_pressure'), worst))
  const file = series?.rows[0]?.arquivo
  const extra = series ? seriesRun(series, find(typeof file === 'string' ? file.replace(/\.csv$/, '') : '')) : null
  if (extra) runs.push(extra)
  return {
    id: 'psi117',
    gravity: '1 g',
    place: 'Em solo · medição × modelo',
    noun: ['condição', 'condições'],
    stripMeasure: 'Altura da barra: distância entre o modelo e a medição',
    stages: [
      groundStage<ModelRun>({
        next: modelStage.id,
        label: 'Investigação em solo',
        sub: 'medição × modelo numérico · entrar',
        blurb: 'Aqui o experimento é uma conta: um modelo numérico de gota, comparado com medições. O modelo roda em solo; as gotas que ele tenta reproduzir queimaram em microgravidade, na órbita desenhada em volta.',
      }),
      modelStage,
    ],
    runs,
  }
}
