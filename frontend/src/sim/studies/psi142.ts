/** PSI-142: chamas em contrafluxo, em bancada. Uma série de um conjunto = uma reprodução. */

import type { AlertRow, Psi142Point, Psi142Set } from '@/api/types'
import { fixed, g } from '@/lib/format'
import { t as tr } from '@/lib/i18n'
import { type BurnerRun, burnerScene, type Instrument } from '../scenes/burner'
import type { Readout, SimRun, SimStudy, StageDef, Tone } from '../types'
import { groundStage } from './ground'

const SAMPLES = 128

/** Interpolação linear numa curva ordenada por x. */
function at(xs: readonly number[], ys: readonly number[], x: number): number {
  if (x <= xs[0]!) return ys[0]!
  const last = xs.length - 1
  if (x >= xs[last]!) return ys[last]!
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid]! <= x) lo = mid
    else hi = mid
  }
  const span = xs[hi]! - xs[lo]! || 1
  return ys[lo]! + ((ys[hi]! - ys[lo]!) * (x - xs[lo]!)) / span
}

function thin(xs: readonly number[], ys: readonly number[], max: number): [number, number][] {
  const step = Math.max(1, Math.ceil(xs.length / max))
  const out: [number, number][] = []
  for (let i = 0; i < xs.length; i += step) out.push([xs[i]!, ys[i]!])
  if ((xs.length - 1) % step) out.push([xs.at(-1)!, ys.at(-1)!])
  return out
}

const clean = (name: string) => name.replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim()

function toRun(set: Psi142Set, serie: string, yName: string, points: readonly Psi142Point[], scale: number, suspect: string | null): SimRun<BurnerRun> | null {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  if (sorted.length < 2) return null
  const xs = sorted.map((p) => p.x)
  const ys = sorted.map((p) => p.y)
  const xName = sorted[0]!.x_nome
  const xUnit = (sorted[0]!.x_unidade as string | null) ?? ''
  const yUnit = (sorted[0]!.y_unidade as string | null) ?? ''
  const [x0, x1] = [xs[0]!, xs.at(-1)!]
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const profile = /distance|location/i.test(xName)
  const id = `${set.conjunto_id}|${yName}|${serie}`
  const progress = (t: number) => (t - x0) / (x1 - x0 || 1)
  const notes = [tr('From the source: the points of this series, digitized from the published figure — the precision is that of the digitization.', 'Da fonte: os pontos desta série, digitalizados da figura publicada — a precisão é a da digitalização.')]
  if (suspect) notes.push(tr(`Quality alert on this series: ${suspect}`, `Alerta de qualidade nesta série: ${suspect}`))
  const conditions: Readout[] = [
    { label: tr('Set', 'Conjunto'), value: `${set.conjunto_id} · ${set.descricao_planilha || set.descricao_csv || ''}` },
    { label: tr('Series', 'Série'), value: serie },
    { label: tr('Points', 'Pontos'), value: g(sorted.length) },
    { label: tr('x axis', 'Eixo x'), value: xName },
    { label: tr('y axis', 'Eixo y'), value: yName },
  ]
  if (set.figura) conditions.push({ label: tr('Figure', 'Figura'), value: String(set.figura) })

  if (profile) {
    const instrument: Instrument = /plif/i.test(yName) ? 'plif' : /temp/i.test(yName) ? 'sonda' : 'camera'
    const tone: Tone = instrument === 'plif' ? 'violet' : instrument === 'sonda' ? 'amber' : 'cyan'
    const samples = new Float32Array(SAMPLES)
    let peak = 0
    for (let i = 0; i < SAMPLES; i++) {
      samples[i] = (at(xs, ys, x0 + ((x1 - x0) * i) / (SAMPLES - 1)) - yMin) / (yMax - yMin || 1)
      if (samples[i]! > samples[peak]!) peak = i
    }
    const xPeak = xs[ys.indexOf(yMax)]!
    notes.push(
      tr('The curve is drawn in the gap between the nozzles itself and paints the band over the axis. The gap in the scene spans the profile (from the lowest to the highest x): the source gives neither the burner geometry nor which nozzle the distance is counted from.', 'A curva está desenhada no próprio vão entre os bocais e pinta a faixa sobre o eixo. O vão da cena tem a extensão do perfil (do menor ao maior x): a fonte não traz a geometria do queimador nem diz de que bocal a distância é contada.'),
      tr('The disc sits where the signal is highest. The burner, the tracers and the instruments are schematic.', 'O disco fica onde o sinal é máximo. O queimador, os traçadores e os instrumentos são esquemáticos.'),
    )
    return {
      id,
      label: serie,
      title: tr(`${clean(yName)} along the axis`, `${clean(yName)} ao longo do eixo`),
      group: tr(`set ${set.conjunto_id}`, `conjunto ${set.conjunto_id}`),
      tone: suspect ? 'amber' : tone,
      toneLabel: suspect ? tr('Suspect axis in the source', 'Eixo suspeito na fonte') : instrument === 'plif' ? tr('CH2O PLIF', 'PLIF de CH2O') : instrument === 'sonda' ? tr('Thermometry', 'Termometria') : tr('Chemiluminescence', 'Quimiluminescência'),
      level: scale > 0 ? Math.min(1, yMax / scale) : 0.6,
      playable: true,
      start: x0,
      duration: x1,
      wall: 11,
      clock: { label: tr(`Reading position (${clean(xName)})`, `Posição da leitura (${clean(xName)})`), unit: xUnit, digits: 2 },
      phases: [{ id: 'varredura', label: tr('Scan along the axis', 'Varredura ao longo do eixo'), t0: x0, t1: x1, tone }],
      conditions,
      telemetry: (t) => [
        { label: clean(yName), value: g(Number(at(xs, ys, t).toPrecision(4))), unit: yUnit, tone },
        { label: tr('Series maximum', 'Máximo da série'), value: g(Number(yMax.toPrecision(4))), unit: yUnit },
        { label: tr('Position of the maximum', 'Posição do máximo'), value: fixed(xPeak, 2), unit: xUnit },
      ],
      phaseAt: (t) => (t >= x1 ? { label: tr('Full profile', 'Perfil completo'), tone } : { label: tr('Reading the profile', 'Lendo o perfil'), tone }),
      verdict: { label: tr('Signal maximum', 'Máximo do sinal'), detail: tr(`${g(Number(yMax.toPrecision(4)))} ${yUnit} at ${fixed(xPeak, 2)} ${xUnit}`, `${g(Number(yMax.toPrecision(4)))} ${yUnit} em ${fixed(xPeak, 2)} ${xUnit}`).trim(), tone },
      chart: { xLabel: xName, yLabel: yName, series: [{ tone, points: thin(xs, ys, 180) }], cursor: (t) => [t, at(xs, ys, t)], yZero: yMin >= 0 },
      notes,
      state: { kind: 'perfil', tone, profile: samples, peak: peak / (SAMPLES - 1), instrument, progress, strain: () => 0.45, power: () => 0.85 },
    }
  }

  // curva de limite: cada ponto é uma condição em que a chama se apagou (ou a que temperatura ficou)
  const strainOnY = yUnit === '1/s'
  const strainOnX = xName.trim() === 'a'
  const temperature = yUnit === 'K'
  const hot = /HFE/i.test(yName) || /HFE/i.test(serie)
  const tone: Tone = hot ? 'hot' : 'cool'
  const digits = Math.abs(x1) < 10 ? 3 : 0
  notes.push(
    temperature
      ? tr('The scene travels along the curve: at each position, the flame appears with a vigor proportional to the reported maximum temperature.', 'A cena percorre a curva: a cada posição, a chama aparece com o vigor proporcional à temperatura máxima informada.')
      : tr('The scene travels along the curve: at each point the flame is at the limit where it goes out, and the tracers move at the strain rate of that point.', 'A cena percorre a curva: em cada ponto a chama está no limite em que se apaga, e os traçadores andam no ritmo do estiramento daquele ponto.'),
    tr('Between two digitized points the value is interpolated in a straight line (dashed underline). The limit is a strain rate (1/s): it is not comparable with the extinction diameter of a droplet.', 'Entre dois pontos digitalizados o valor é interpolado em linha reta (sublinhado em tracejado). O limite é uma taxa de estiramento (1/s): não se compara com o diâmetro de extinção de uma gota.'),
    tr('The burner, the tracers and the instruments are schematic: the source does not give the geometry of the apparatus.', 'O queimador, os traçadores e os instrumentos são esquemáticos: a fonte não traz a geometria do aparato.'),
  )
  return {
    id,
    label: serie,
    title: `${clean(yName)} × ${clean(xName)}`,
    group: tr(`set ${set.conjunto_id}`, `conjunto ${set.conjunto_id}`),
    tone: suspect ? 'amber' : tone,
    toneLabel: suspect ? tr('Suspect axis in the source', 'Eixo suspeito na fonte') : temperature ? tr('Maximum temperature', 'Temperatura máxima') : hot ? tr('Hot flame limit', 'Limite da chama quente') : tr('Cool flame limit', 'Limite da chama fria'),
    level: scale > 0 ? Math.min(1, yMax / scale) : 0.6,
    playable: true,
    start: x0,
    duration: x1,
    wall: 9,
    clock: { label: xName === 'a' ? tr('Strain rate a', 'Taxa de estiramento a') : tr(`Fuel fraction (${xName})`, `Fração de combustível (${xName})`), unit: xUnit || (strainOnX ? '1/s' : ''), digits },
    phases: [{ id: 'curva', label: temperature ? tr('Stabilized flame', 'Chama estabilizada') : tr('At the extinction limit', 'No limite de extinção'), t0: x0, t1: x1, tone }],
    conditions,
    telemetry: (t) => [
      { label: yName, value: g(Number(at(xs, ys, t).toPrecision(4))), unit: yUnit, tone, soft: !xs.includes(t) },
      { label: tr('Series range', 'Faixa da série'), value: `${g(Number(yMin.toPrecision(3)))}–${g(Number(yMax.toPrecision(3)))}`, unit: yUnit },
    ],
    phaseAt: (t) => (t >= x1 ? { label: tr('End of the curve', 'Fim da curva'), tone } : { label: temperature ? tr('Stabilized flame', 'Chama estabilizada') : tr('At the extinction limit', 'No limite de extinção'), tone }),
    verdict: {
      label: temperature ? tr('Maximum temperature range', 'Faixa de temperatura máxima') : tr('Extinction limit range', 'Faixa do limite de extinção'),
      detail: tr(`${yName} from ${g(Number(yMin.toPrecision(3)))} to ${g(Number(yMax.toPrecision(3)))} ${yUnit} for ${xName} from ${g(Number(x0.toPrecision(3)))} to ${g(Number(x1.toPrecision(3)))}`, `${yName} de ${g(Number(yMin.toPrecision(3)))} a ${g(Number(yMax.toPrecision(3)))} ${yUnit} para ${xName} de ${g(Number(x0.toPrecision(3)))} a ${g(Number(x1.toPrecision(3)))}`).replace(/\s+/g, ' '),
      tone,
    },
    chart: { xLabel: xName, yLabel: yName, series: [{ tone, points: thin(xs, ys, 60), dots: true, dashed: true }], cursor: (t) => [t, at(xs, ys, t)] },
    notes,
    state: {
      kind: 'limite',
      tone,
      profile: null,
      peak: 0.5,
      instrument: null,
      progress,
      strain: (t) => (strainOnY ? at(xs, ys, t) / 135 : strainOnX ? t / 135 : 0.5),
      power: (t) => (temperature ? (at(xs, ys, t) - 600) / 260 : 0.35 + 0.65 * progress(t)),
    },
  }
}

const benchStage: StageDef<BurnerRun> = {
  id: 'bancada',
  label: tr('Bench', 'Bancada'),
  scale: tr('laboratory · decimeters', 'laboratório · decímetros'),
  title: tr('Counterflow burner', 'Queimador de contrafluxo'),
  blurb: tr('Two opposed nozzles blow against each other and the flame is held, flat, where the jets meet. Increasing the flow stretches the flame until it goes out: that is the limit being measured.', 'Dois bocais opostos sopram um contra o outro e a chama fica presa, plana, onde os jatos se encontram. Aumentar a vazão estica a chama até ela se apagar: esse é o limite que se mede.'),
  facts: (run) => [
    { label: tr('Flow', 'Escoamento'), value: tr('counterflow', 'contrafluxo') },
    { label: tr('What is measured', 'O que se mede'), value: tr('extinction strain rate', 'estiramento de extinção'), unit: '1/s' },
    ...(run?.state.instrument ? [{ label: tr('Instrument of this series', 'Instrumento desta série'), value: { plif: tr('PLIF laser', 'laser de PLIF'), camera: tr('intensified camera', 'câmera intensificada'), sonda: tr('thermometry', 'termometria') }[run.state.instrument] }] : []),
  ],
  experiment: false,
  sceneKey: 'contrafluxo',
  view: 'bancada',
  scene: (r) => burnerScene(r, 'zona'),
}
const zoneStage: StageDef<BurnerRun> = {
  id: 'zona',
  label: tr('Reaction zone', 'Zona de reação'),
  scale: tr('flame · millimeters', 'chama · milímetros'),
  title: tr('Between the nozzles', 'Entre os bocais'),
  blurb: tr('The tracers show the two jets meeting and leaving sideways; the disc is the reaction zone. In the profiles, the measured curve appears in the gap itself; in the limit curves, the scene travels through the points where the flame goes out.', 'Os traçadores mostram os dois jatos se encontrando e saindo pelos lados; o disco é a zona de reação. Nos perfis, a curva medida aparece no próprio vão; nas curvas de limite, a cena percorre os pontos em que a chama se apaga.'),
  facts: () => [],
  experiment: true,
  sceneKey: 'contrafluxo',
  view: 'zona',
  scene: (r) => burnerScene(r, 'zona'),
}

export function psi142Study(set: Psi142Set, points: readonly Psi142Point[], alerts: readonly AlertRow[]): SimStudy<BurnerRun> {
  // séries marcadas como de eixo suspeito ("conjunto 6 · nC10")
  const flagged = new Map<string, string>()
  const mention = new RegExp(String.raw`conjuntos? (?:[\d, e]*\b${set.conjunto_id}\b)`)
  for (const a of alerts) {
    if (a.tipo === 'eixo_suspeito' && a.teste_id && mention.test(a.teste_id) && a.teste_id.includes(' · ')) flagged.set(a.teste_id.split(' · ').slice(1).join(' · '), a.detalhe)
  }
  const groups = new Map<string, Psi142Point[]>()
  for (const p of points) {
    const key = `${p.y_nome}\u0000${p.serie}`
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }
  // a altura na faixa compara séries da mesma grandeza (as suspeitas ficam fora da régua)
  const scale = new Map<string, number>()
  for (const [key, list] of groups) {
    const [yName, serie] = key.split('\u0000') as [string, string]
    if (flagged.has(serie)) continue
    scale.set(yName, Math.max(scale.get(yName) ?? 0, ...list.map((p) => p.y)))
  }
  const runs: SimRun<BurnerRun>[] = []
  for (const [key, list] of groups) {
    const [yName, serie] = key.split('\u0000') as [string, string]
    const run = toRun(set, serie, yName, list, scale.get(yName) ?? 0, flagged.get(serie) ?? null)
    if (run) runs.push(run)
  }
  return {
    id: 'psi142',
    gravity: '1 g',
    place: tr('Ground bench · Princeton', 'Bancada em solo · Princeton'),
    noun: tr(['series', 'series'], ['série', 'séries']),
    stripMeasure: tr('Bar height: series maximum, among the series of the same quantity', 'Altura da barra: máximo da série, entre as séries da mesma grandeza'),
    stages: [
      groundStage<BurnerRun>({
        next: benchStage.id,
        site: { lat: 40.35, lon: -74.66, name: 'Princeton' },
        label: 'Princeton',
        sub: tr('counterflow bench · enter the laboratory', 'bancada de contrafluxo · entrar no laboratório'),
        blurb: tr('This investigation did not fly: these are counterflow flames measured on a bench, under normal gravity. The ISS orbit is there only for comparison with the flight studies.', 'Esta investigação não voou: são chamas de contrafluxo medidas em bancada, sob gravidade normal. A órbita da ISS está aí só para comparar com os estudos de voo.'),
      }),
      benchStage,
      zoneStage,
    ],
    runs,
  }
}
