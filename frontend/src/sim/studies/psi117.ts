/** PSI-117: medição × modelo numérico de gotas, em solo. Uma condição (ou a série do modelo) = uma reprodução. */

import type { Dataset, Psi117Comparison, Row } from '@/api/types'
import { fixed, g } from '@/lib/format'
import { t as tr } from '@/lib/i18n'
import { locate, type ModelRun, modelScene, sample } from '../scenes/model'
import type { Readout, SimRun, SimStudy, StageDef, Tone } from '../types'
import { groundStage } from './ground'
import { td } from '@/lib/i18n-data'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : String(v))

/** Condições de uma tabela da investigação, como estão no ReadMe (texto, sem interpretar). */
function fromReadme(table: Row | undefined): Readout[] {
  if (!table) return []
  const hint = tr('As written in the investigation ReadMe.', 'Como está no ReadMe da investigação.')
  const out: Readout[] = [
    { label: tr('Fuel', 'Combustível'), value: text(table.combustivel), hint },
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
      ? { label: tr('Model within the range', 'Modelo dentro da faixa'), detail: tr(`model − measured = ${fixed(diff, 2, true)} mm; reported range from ${fixed(lo, 2)} to ${fixed(hi, 2)} mm`, `modelo − medido = ${fixed(diff, 2, true)} mm; faixa informada de ${fixed(lo, 2)} a ${fixed(hi, 2)} mm`), tone: 'signal' }
      : row.modelo_na_faixa === false
        ? { label: tr('Model outside the range', 'Modelo fora da faixa'), detail: tr(`model − measured = ${fixed(diff, 2, true)} mm; reported range from ${fixed(lo, 2)} to ${fixed(hi, 2)} mm`, `modelo − medido = ${fixed(diff, 2, true)} mm; faixa informada de ${fixed(lo, 2)} a ${fixed(hi, 2)} mm`), tone: 'red' }
        : { label: tr('No uncertainty range', 'Sem faixa de incerteza'), detail: tr(`model − measured = ${fixed(diff, 2, true)} mm; the source only reports uncertainty for the cool flame`, `modelo − medido = ${fixed(diff, 2, true)} mm; a fonte só informa incerteza para a chama fria`), tone: 'dim' }
  return {
    id: `${row.tipo_chama}|${row.pressao_atm}`,
    label: `${g(row.pressao_atm)} atm`,
    title: tr(`${td(row.tipo_chama)} · measured vs. model`, `${row.tipo_chama} · medido × modelo`),
    group: td(row.tipo_chama),
    tone,
    toneLabel: td(row.tipo_chama),
    level: worst > 0 ? Math.abs(diff) / worst : 0.5,
    playable: true,
    start: 0,
    duration: 100,
    wall: 8,
    clock: { label: tr('Progress (illustrative)', 'Andamento (ilustrativo)'), unit: '%', digits: 0, note: tr('The table only gives the extinction diameter: the path to it, in the scene, is illustrative.', 'A tabela só traz o diâmetro de extinção: o caminho até ele, na cena, é ilustrativo.') },
    phases: [
      { id: 'queima', label: tr(`${td(row.tipo_chama)} until extinction`, `${row.tipo_chama} até a extinção`), t0: 0, t1: 82, tone },
      { id: 'leitura', label: tr('Final reading', 'Leitura final'), t0: 82, t1: 100, tone: 'dim' },
    ],
    conditions: [
      { label: tr('Flame', 'Chama'), value: td(row.tipo_chama) },
      { label: tr('Pressure', 'Pressão'), value: g(row.pressao_atm), unit: 'atm' },
      { label: tr('No. of measurements', 'Nº de medições'), value: g(row.n_medicoes), hint: tr('With two measurements at the same pressure, the measured value is the mean.', 'Com duas medições na mesma pressão, o valor medido é a média.') },
      ...fromReadme(table),
    ],
    telemetry: () => [
      { label: tr('Measured', 'Medido'), value: fixed(measured, 2), unit: 'mm' },
      { label: tr('Model', 'Modelo'), value: fixed(model, 2), unit: 'mm', tone: 'magenta' },
      { label: tr('Model − measured', 'Modelo − medido'), value: fixed(diff, 2, true), unit: 'mm' },
      { label: tr('Reported range', 'Faixa informada'), value: band ? `${fixed(band[0], 2)}–${fixed(band[1], 2)}` : '—', unit: band ? 'mm' : undefined, tone: band ? 'signal' : undefined },
    ],
    phaseAt: (t) => (t < 82 ? { label: tr(`${td(row.tipo_chama)} · until extinction`, `${row.tipo_chama} · até a extinção`), tone } : { label: verdict.label, tone: verdict.tone }),
    verdict,
    chart: {
      xLabel: tr('pressure (atm)', 'pressão (atm)'),
      yLabel: tr('Extinction ⌀ (mm): measured (white) vs. model (magenta)', '⌀ de extinção (mm): medido (branco) × modelo (magenta)'),
      yZero: true,
      series: [
        { tone: 'ink', points: same.map((r) => [r.pressao_atm, r.medido_mm ?? 0] as const), dots: true },
        { tone: 'magenta', points: same.map((r) => [r.pressao_atm, r.modelo_mm ?? 0] as const), dots: true, dashed: true },
      ],
      cursor: () => [row.pressao_atm, measured],
    },
    notes: [
      tr('From the source: the measured extinction diameter, the model one and the uncertainty range (which only exists for the cool flame).', 'Da fonte: o diâmetro de extinção medido, o do modelo e a faixa de incerteza (que só existe para a chama fria).'),
      tr('White ring: measurement. Dashed magenta ring: model. Green rings: the limits of the uncertainty range. Dashed gray ring: D0, from the ReadMe.', 'Anel branco: medição. Anel magenta tracejado: modelo. Anéis verdes: os limites da faixa de incerteza. Anel cinza tracejado: D0, do ReadMe.'),
      tr('The table only gives the diameter at which the flame went out. The shrinking of the droplets in the scene is illustrative, and so is the flame.', 'A tabela só traz o diâmetro em que a chama se apagou. O encolhimento das gotas na cena é ilustrativo, e a chama também.'),
      tr('Measurement and model are different evidence. The "measurement" in this table may come from the same CFI flights: comparing them is not independent validation.', 'Medição e modelo são evidências diferentes. A "medição" desta tabela pode vir dos mesmos voos do CFI: compará-los não é validação independente.'),
      ...(measured === 0 ? [tr('The source records 0 for the measurement at this pressure.', 'A fonte registra 0 para a medição nesta pressão.')] : []),
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
  const scenario = td(text(rows[0]!.cenario))
  return {
    id: 'serie',
    label: tr('series', 'série'),
    title: tr(`${scenario} · model output`, `${scenario} · saída do modelo`),
    group: tr('Numerical model', 'Modelo numérico'),
    tone: 'violet',
    toneLabel: tr('Model series', 'Série do modelo'),
    level: 0.75,
    playable: true,
    start: 0,
    duration: end,
    wall: 18,
    clock: { label: tr('Simulated time', 'Tempo simulado'), unit: 's', digits: 3 },
    phases: [{ id: 'serie', label: scenario, t0: 0, t1: end, tone: 'cool' }],
    conditions: [{ label: tr('Nature', 'Natureza'), value: tr('simulated', 'simulado'), hint: tr('Simulation result, not a measurement.', 'Resultado de simulação, não medição.') }, { label: tr('Samples', 'Amostras'), value: g(n) }, ...fromReadme(table)],
    telemetry: (time) => {
      const i = locate(t, time)
      return [
        { label: tr('Droplet diameter', 'Diâmetro da gota'), value: fixed(sample(d, i), 3), unit: 'mm' },
        { label: tr('Max T', 'T máxima'), value: fixed(sample(tmax, i), 0), unit: 'K', tone: sample(tmax, i) > 880 ? 'hot' : 'cool' },
        { label: 'K', value: fixed(sample(k, i), 3), unit: 'mm²/s' },
        { label: tr('⌀ of max T', '⌀ de T máxima'), value: fixed(sample(dT, i), 2), unit: 'mm' },
        { label: tr('⌀ of max OH', '⌀ de OH máximo'), value: fixed(sample(dOH, i), 2), unit: 'mm', tone: 'violet' },
      ]
    },
    phaseAt: (time) => (time >= end ? { label: tr('End of the series', 'Fim da série'), tone: 'violet' } : { label: scenario, tone: 'cool' }),
    verdict: { label: tr('End of the series', 'Fim da série'), detail: tr(`droplet at ⌀ ${fixed(d[n - 1]!, 3)} mm after ${fixed(end, 2)} simulated s`, `gota em ⌀ ${fixed(d[n - 1]!, 3)} mm depois de ${fixed(end, 2)} s simulados`), tone: 'violet' },
    chart: { xLabel: tr('time (s)', 'tempo (s)'), yLabel: tr('Max T (K)', 'T máxima (K)'), series: [{ tone: 'cool', points: curve }], cursor: (time) => [Math.min(time, end), sample(tmax, locate(t, time))] },
    notes: [
      tr('Everything here is output of the numerical model, as it is in the source (nature: SIMULADO). There is no measurement in this series.', 'Tudo aqui é saída do modelo numérico, como está na fonte (natureza: SIMULADO). Não há medição nesta série.'),
      tr('The glowing shell is the surface where the temperature is highest (diameter = ratio from the source × droplet diameter); the color follows the temperature: blue at cool flame temperatures, orange above ~880 K.', 'A casca luminosa é a superfície onde a temperatura é máxima (diâmetro = razão da fonte × diâmetro da gota); a cor segue a temperatura: azul nas temperaturas de chama fria, laranja acima de ~880 K.'),
      tr('The dashed violet ring is where OH is highest. The tracers between the droplet and the shell are illustrative.', 'O anel violeta tracejado é onde o OH é máximo. Os traçadores entre a gota e a casca são ilustrativos.'),
    ],
    state: { kind: 'series', t, d, tmax, dT, dOH },
  }
}

const modelStage: StageDef<ModelRun> = {
  id: 'dominio',
  label: tr('Model', 'Modelo'),
  scale: tr('droplet · millimeters', 'gota · milímetros'),
  title: tr('Measured droplet vs. model droplet', 'Gota medida × gota do modelo'),
  blurb: tr('On the left, what was measured; on the right, what the model predicts for the same pressure. Both shrink down to the diameter at which the flame goes out, and the rings show whether the model falls within the uncertainty range. The last item in the strip replays a whole model series.', 'À esquerda, o que foi medido; à direita, o que o modelo prevê para a mesma pressão. As duas encolhem até o diâmetro em que a chama se apaga, e os anéis mostram se o modelo cai dentro da faixa de incerteza. O último item da faixa reproduz uma série inteira do modelo.'),
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
    place: tr('Ground · measurement vs. model', 'Em solo · medição × modelo'),
    noun: tr(['condition', 'conditions'], ['condição', 'condições']),
    stripMeasure: tr('Bar height: distance between the model and the measurement', 'Altura da barra: distância entre o modelo e a medição'),
    stages: [
      groundStage<ModelRun>({
        next: modelStage.id,
        label: tr('Ground investigation', 'Investigação em solo'),
        sub: tr('measurement vs. numerical model · enter', 'medição × modelo numérico · entrar'),
        blurb: tr('Here the experiment is a calculation: a numerical droplet model, compared with measurements. The model runs on the ground; the droplets it tries to reproduce burned in microgravity, on the orbit drawn around it.', 'Aqui o experimento é uma conta: um modelo numérico de gota, comparado com medições. O modelo roda em solo; as gotas que ele tenta reproduzir queimaram em microgravidade, na órbita desenhada em volta.'),
      }),
      modelStage,
    ],
    runs,
  }
}
