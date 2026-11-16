/** FLEX (PSI-69): gotas de combustível no CIR da ISS. Um ensaio da tabela = uma reprodução. */

import type { FlexRow } from '@/shared/api/types'
import { fixed, g } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { afterBurning, type StageInput } from '@/visualization/replay/droplet'
import type { DropletRun, Ending } from '@/visualization/scenes/droplet'
import type { Readout, SimRun, SimStudy, Tone } from '@/visualization/types'
import { blockedRun, dropletRun, dropletStage, NOTES_DROPLET } from '@/visualization/studies/droplets'
import { flightStages } from '@/visualization/studies/flight'
import { td } from '@/shared/lib/i18n-data'

const OUTCOME: Record<string, { tone: Tone; ending: Ending }> = {
  Extinção: { tone: 'signal', ending: 'extincao' },
  'Queima completa': { tone: 'violet', ending: 'completa' },
  'Ruptura da gota': { tone: 'hot', ending: 'ruptura' },
}

const pct = (v: number | null) => (v === null ? '—' : fixed(v * 100, 0))

function conditions(r: FlexRow): Readout[] {
  const co = r.gas_co_rotulo_ambiguo_fracao as number | null
  const out: Readout[] = [
    { label: t('Fuel', 'Combustível'), value: r.combustivel },
    { label: t('Pressure', 'Pressão'), value: r.pressao_mmhg === null ? '—' : fixed(r.pressao_mmhg, 0), unit: 'mmHg', hint: r.pressao_mmhg === null ? undefined : `≈ ${fixed(r.pressao_mmhg / 760, 2)} atm` },
    { label: t('Oxygen', 'Oxigênio'), value: pct(r.oxigenio_fracao), unit: '%' },
    { label: t('Nitrogen', 'Nitrogênio'), value: pct(r.nitrogenio_fracao as number | null), unit: '%' },
  ]
  if (co) out.push({ label: t('"CO" (ambiguous label)', '"CO" (rótulo ambíguo)'), value: pct(co), unit: '%', hint: t('The source header lost the gas subscript. It is not necessarily CO2.', 'O cabeçalho da fonte perdeu o subscrito do gás. Não é necessariamente CO2.') })
  out.push({ label: t('Initial diameter', 'Diâmetro inicial'), value: r.diametro_inicial_mm === null ? '—' : fixed(r.diametro_inicial_mm, 2), unit: 'mm' })
  return out
}

function mix(r: FlexRow): SimRun['mix'] {
  return [
    { label: 'O2', value: r.oxigenio_fracao ?? 0, tone: 'signal' },
    { label: 'N2', value: (r.nitrogenio_fracao as number | null) ?? 0, tone: 'faint' },
    { label: '"CO"', value: (r.gas_co_rotulo_ambiguo_fracao as number | null) ?? 0, tone: 'amber' },
    { label: 'He', value: r.helio_fracao ?? 0, tone: 'violet' },
  ]
}

function toRun(r: FlexRow): SimRun<DropletRun> {
  const id = String(r.teste_id)
  const title = `${r.combustivel} · O2 ${pct(r.oxigenio_fracao)} %`
  const base = { id, label: id, title, group: r.identificador ?? undefined, conditions: conditions(r), mix: mix(r) }
  const d0 = r.diametro_inicial_mm
  const time = r.tempo_queima_s as number | null
  const k = r.taxa_queima_valor as number | null
  if (d0 === null || time === null || !(time > 0)) return blockedRun({ ...base, reason: t('The source does not give the initial diameter (or the burn time) of this test.', 'A fonte não traz o diâmetro inicial (ou o tempo de queima) deste ensaio.') })

  const outcome = OUTCOME[r.desfecho] ?? { tone: 'dim' as Tone, ending: 'extincao' as Ending }
  const measured = r.diametro_extincao_visivel_mm
  let dEnd: number
  let estimated = false
  if (measured !== null) dEnd = measured
  else if (outcome.ending === 'completa') dEnd = 0
  else if (k !== null && k > 0) {
    dEnd = afterBurning(d0, k, time)
    estimated = true
  } else return blockedRun({ ...base, reason: t('The source gives neither the diameter at extinction nor the burning rate of this test.', 'A fonte não traz o diâmetro na extinção nem a taxa de queima deste ensaio.') })

  const stage: StageInput = { kind: 'hot', dEnd, duration: time, estimated }
  const diameter = `${estimated ? '≈ ' : ''}⌀ ${fixed(dEnd, 2)} mm`
  const verdict: SimRun['verdict'] =
    outcome.ending === 'completa'
      ? { label: t('Complete burn', 'Queima completa'), detail: t(`the droplet was consumed in ${g(time)} s`, `a gota foi consumida em ${g(time)} s`), tone: outcome.tone }
      : outcome.ending === 'ruptura'
        ? { label: t('Droplet rupture', 'Ruptura da gota'), detail: t(`at ${diameter}, at ${g(time)} s — this is the classification of the end of the test, not an explosion`, `em ${diameter}, aos ${g(time)} s — é a classificação do fim do ensaio, não uma explosão`), tone: outcome.tone }
        : { label: t('Visible flame extinction', 'Extinção da chama visível'), detail: t(`at ${diameter}, at ${g(time)} s`, `em ${diameter}, aos ${g(time)} s`), tone: outcome.tone }

  return dropletRun({
    ...base,
    tone: outcome.tone,
    toneLabel: td(r.desfecho),
    level: d0 > 0 ? Math.min(1, dEnd / d0) : null,
    d0,
    stages: [stage],
    ending: outcome.ending,
    fiber: null,
    glow: 0.75,
    kSource: { hot: k, unit: t('(source)', '(fonte)'), hint: t("Source label: 'Burning rate; mm'. Unit to be checked in the report.", "Rótulo da fonte: 'Burning rate; mm'. Unidade a conferir no relatório.") },
    verdict,
    notes: [
      t('From the source: initial diameter, diameter at visible extinction, burn time, pressure and gas composition.', 'Da fonte: diâmetro inicial, diâmetro na extinção visível, tempo de queima, pressão e composição do gás.'),
      ...(estimated ? [t('This test has no diameter at extinction: it was estimated by the d² law with the burning rate from the source, assuming mm²/s. It appears with “≈” and dashed.', 'Este ensaio não tem o diâmetro na extinção: ele foi estimado pela lei do d² com a taxa de queima da fonte, supondo mm²/s. Aparece com “≈” e em tracejado.')] : []),
      ...NOTES_DROPLET,
      t('The end of the visible flame does not prove that all combustion stopped: cool flames carry on unseen.', 'O fim da chama visível não prova que toda combustão parou: chamas frias seguem invisíveis.'),
    ],
  })
}

export function flexStudy(rows: readonly FlexRow[]): SimStudy<DropletRun> {
  const byId = new Map(rows.map((r) => [String(r.teste_id), r]))
  return {
    id: 'flex',
    gravity: 'µg',
    place: 'ISS · Destiny · CIR',
    noun: t(['test', 'tests'], ['ensaio', 'ensaios']),
    stripMeasure: t('Bar height: diameter at extinction ÷ initial diameter', 'Altura da barra: diâmetro na extinção ÷ diâmetro inicial'),
    stages: [
      ...flightStages<DropletRun>({
        rack: 'cir',
        experiment: 'FLEX',
        next: dropletStage.id,
        glow: 'hot',
        noun: t('test', 'ensaio'),
        dateOf: (run) => (byId.get(run.id)?.data as string | null) ?? null,
        rackFacts: [{ label: t('Chamber', 'Câmara'), value: t('≈ 100 L · 8 windows', '≈ 100 L · 8 janelas') }],
      }),
      dropletStage,
    ],
    runs: rows.map(toRun),
  }
}
