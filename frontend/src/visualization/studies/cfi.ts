/** CFI (PSI-39): chama quente e chama fria de gotas no CIR da ISS. */

import type { CfiRow, Row } from '@/shared/api/types'
import { fixed, g } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { afterBurning, burnTime, type StageInput } from '@/visualization/replay/droplet'
import type { Diagnostic } from '@/visualization/scenes/lab'
import type { DropletRun, Ending } from '@/visualization/scenes/droplet'
import type { Readout, SimRun, SimStudy, Tone } from '@/visualization/types'
import { blockedRun, dropletRun, dropletStage, NOTES_DROPLET } from '@/visualization/studies/droplets'
import { flightStages } from '@/visualization/studies/flight'
import { td } from '@/shared/lib/i18n-data'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const pct = (v: number | null) => (v === null ? '—' : fixed(v * 100, 0))

/** Colunas da tabela de câmeras que são "ligado/desligado" e viram pacotes acesos no rack. */
const CAMERAS = ['HIBMS', 'LLL', 'HIBMS-2', 'IPSU-4'] as const

function conditions(r: CfiRow): Readout[] {
  const helium = num(r.helio_fracao)
  const power = num(r.ignicao_potencia_w)
  const ms = num(r.ignicao_tempo_ms)
  const reign = num(r.reignicoes)
  const rad = num(r.rad_pico_chama_quente)
  const out: Readout[] = [
    { label: t('Fuel', 'Combustível'), value: r.combustivel },
    { label: t('Pressure', 'Pressão'), value: g(r.pressao_atm), unit: 'atm' },
    { label: t('Oxygen', 'Oxigênio'), value: pct(num(r.oxigenio_fracao)), unit: '%' },
    { label: t('Diluent', 'Diluente'), value: helium ? `${td(r.diluente)} · He ${pct(helium)} %` : td(r.diluente) },
    { label: t('Initial diameter', 'Diâmetro inicial'), value: r.d0_mm === null ? '—' : fixed(r.d0_mm, 2), unit: 'mm' },
    { label: t('Support', 'Suporte'), value: r.fibra === true ? t('fiber', 'fibra') : r.fibra === false ? t('free droplet', 'gota livre') : '—' },
  ]
  if (power !== null && ms !== null) out.push({ label: t('Ignition', 'Ignição'), value: `${g(power)} W · ${g(ms / 1000)} s` })
  if (reign) out.push({ label: t('Reignitions', 'Reignições'), value: g(reign), hint: t('How many times the flame reignited; the source does not say when.', 'Quantas vezes a chama reacendeu; a fonte não diz quando.') })
  if (rad !== null) out.push({ label: t('Peak radiometry', 'Radiometria de pico'), value: fixed(rad, 1), hint: t('Radiometer peak in the hot flame. The source does not state the unit; here it sets the flame brightness.', 'Pico do radiômetro na chama quente. A fonte não informa a unidade; aqui regula o brilho da chama.') })
  return out
}

function mix(r: CfiRow): SimRun['mix'] {
  return [
    { label: 'O2', value: num(r.oxigenio_fracao) ?? 0, tone: 'signal' },
    { label: 'N2', value: num(r.nitrogenio_fracao) ?? 0, tone: 'faint' },
    { label: 'He', value: num(r.helio_fracao) ?? 0, tone: 'violet' },
  ]
}

function toRun(r: CfiRow, radMax: number): SimRun<DropletRun> {
  const id = String(r.teste_id)
  const title = `${r.combustivel} · ${g(r.pressao_atm)} atm`
  const base = { id, label: id, title, group: `${g(r.pressao_atm)} atm`, conditions: conditions(r), mix: mix(r) }
  const pending = r.analise_completa === false ? t(' The analysis of this test is not complete in the source.', ' A análise deste ensaio não está concluída na fonte.') : ''
  const d0 = r.d0_mm
  if (d0 === null) return blockedRun({ ...base, reason: t(`The source does not give the initial diameter of this test.${pending}`, `A fonte não traz o diâmetro inicial deste ensaio.${pending}`) })

  const kHot = num(r.k_quente_mm2_s)
  const kCool = num(r.k_fria_mm2_s)
  const tHot = num(r.tempo_chama_quente)
  const notes: string[] = [t('From the source: D0, extinction diameters of the hot and cool flames, hot flame time, K of each flame, pressure and gas.', 'Da fonte: D0, diâmetros de extinção das chamas quente e fria, tempo de chama quente, K de cada chama, pressão e gás.')]

  // ---- chama quente
  let hot: StageInput
  if (r.dext_quente_mm !== null && tHot !== null && tHot > 0) hot = { kind: 'hot', dEnd: r.dext_quente_mm, duration: tHot }
  else if (r.dext_quente_mm !== null && kHot !== null && kHot > 0 && r.dext_quente_mm < d0) {
    hot = { kind: 'hot', dEnd: r.dext_quente_mm, duration: burnTime(d0, r.dext_quente_mm, kHot), estimated: true }
    notes.push(t('No hot flame time in the source: the duration was computed from the reported K.', 'Sem o tempo de chama quente na fonte: a duração foi calculada com a K informada.'))
  } else if (tHot !== null && tHot > 0 && kHot !== null && kHot > 0) {
    hot = { kind: 'hot', dEnd: afterBurning(d0, kHot, tHot), duration: tHot, estimated: true }
    notes.push(t('No hot flame extinction diameter in the source: it was estimated by the d² law with the reported K. It appears dashed.', 'Sem o diâmetro de extinção da chama quente na fonte: ele foi estimado pela lei do d² com a K informada. Aparece em tracejado.'))
  } else return blockedRun({ ...base, reason: t(`The source does not give the hot flame extinction of this test.${pending}`, `A fonte não traz a extinção da chama quente deste ensaio.${pending}`) })
  const dHot = Math.min(d0, hot.dEnd)

  // ---- chama fria
  const stages: StageInput[] = [hot]
  let ending: Ending = 'extincao'
  let tone: Tone = 'hot'
  let toneLabel = t('Hot flame only', 'Só chama quente')
  let verdict: SimRun['verdict'] = {
    label: t('Hot flame extinction', 'Extinção da chama quente'),
    detail: t(`at ${hot.estimated && r.dext_quente_mm === null ? '≈ ' : ''}⌀ ${fixed(dHot, 2)} mm; the source records no cool flame in this test`, `em ${hot.estimated && r.dext_quente_mm === null ? '≈ ' : ''}⌀ ${fixed(dHot, 2)} mm; a fonte não registra chama fria neste ensaio`),
    tone: 'hot',
  }
  if (kCool !== null && kCool > 0) {
    const dCool = r.dext_fria_mm
    if (dCool !== null && dCool < dHot) {
      stages.push({ kind: 'cool', dEnd: dCool, duration: burnTime(dHot, dCool, kCool), estimated: r.dext_fria_extrapolado === true })
      tone = 'cool'
      toneLabel = t('Hot → cool', 'Quente → fria')
      verdict = { label: t('Cool flame extinction', 'Extinção da chama fria'), detail: t(`at ⌀ ${fixed(dCool, 2)} mm${r.dext_fria_extrapolado === true ? ' (value extrapolated in the source)' : ''}`, `em ⌀ ${fixed(dCool, 2)} mm${r.dext_fria_extrapolado === true ? ' (valor extrapolado na fonte)' : ''}`), tone: 'cool' }
      notes.push(t('The cool flame duration is not in the source: it is the time the cool flame K takes to go from one diameter to the other.', 'A duração da chama fria não está na fonte: é o tempo que a K da chama fria leva para ir de um diâmetro ao outro.'))
    } else if (r.dext_fria_zero_na_fonte === true) {
      stages.push({ kind: 'cool', dEnd: 0, duration: burnTime(dHot, 0, kCool) })
      ending = 'consumida'
      tone = 'violet'
      toneLabel = t('Consumed by the cool flame', 'Consumida pela chama fria')
      verdict = { label: t('Droplet consumed by the cool flame', 'Gota consumida pela chama fria'), detail: t('no visible extinction: the source records 0, which is not a diameter of 0 mm', 'sem extinção visível: a fonte registra 0, que não é um diâmetro de 0 mm'), tone: 'cool' }
      notes.push(t('The cool flame duration is not in the source: it is the time the cool flame K takes to consume the droplet.', 'A duração da chama fria não está na fonte: é o tempo que a K da chama fria leva para consumir a gota.'))
    } else if (dCool !== null) {
      notes.push(t(`The source gives ${fixed(dCool, 2)} mm for the cool flame extinction, larger than the hot flame's: this segment was not reconstructed.`, `A fonte dá ${fixed(dCool, 2)} mm para a extinção da chama fria, maior que o da chama quente: esse trecho não foi reconstruído.`))
    } else {
      // há K da chama fria, mas não onde ela acabou: mostra só o começo do trecho, em aberto
      const window = Math.min(hot.duration, burnTime(dHot, 0, kCool) * 0.35)
      stages.push({ kind: 'cool', dEnd: afterBurning(dHot, kCool, window), duration: window, open: true })
      ending = 'aberto'
      tone = 'cool'
      toneLabel = t('Hot → cool', 'Quente → fria')
      verdict = { label: t('Cool flame with no recorded end', 'Chama fria sem fim registrado'), detail: t('the source gives the cool flame K, but not the extinction diameter', 'a fonte traz a K da chama fria, mas não o diâmetro de extinção'), tone: 'dim' }
      notes.push(t('The cool flame of this test has a K, but no extinction diameter: the segment is left open and fades without marking an end.', 'A chama fria deste ensaio tem K, mas não tem diâmetro de extinção: o trecho aparece em aberto e some sem marcar um fim.'))
    }
  }
  if (r.analise_completa === false) notes.push(t('Analysis not complete in the source (Completed Analysis = No).', 'Análise não concluída na fonte (Completed Analysis = No).'))
  notes.push(...NOTES_DROPLET)

  const rad = num(r.rad_pico_chama_quente)
  return dropletRun({
    ...base,
    tone,
    toneLabel,
    level: Math.min(1, dHot / d0),
    d0,
    stages,
    ending,
    fiber: r.fibra as boolean | null,
    glow: rad !== null && radMax > 0 ? rad / radMax : 0.6,
    kSource: { hot: kHot, cool: kCool, unit: 'mm²/s' },
    verdict,
    notes,
    clockNote: t('The source does not state the unit of the hot flame time; here it is read as seconds.', 'A fonte não informa a unidade do tempo de chama quente; aqui ele é lido como segundos.'),
  })
}

export function cfiStudy(rows: readonly CfiRow[], cameras: readonly Row[]): SimStudy<DropletRun> {
  const byId = new Map(rows.map((r) => [String(r.teste_id), r]))
  const cams = new Map(cameras.map((c) => [String(c.teste_id), c]))
  const radMax = Math.max(0, ...rows.map((r) => num(r.rad_pico_chama_quente) ?? 0))
  const diagnostics = (run: SimRun<DropletRun> | null): Diagnostic[] => {
    const row = run ? cams.get(run.id) : undefined
    return CAMERAS.map((name) => ({ id: name, label: name, on: String(row?.[name] ?? '').toLowerCase() === 'yes' }))
  }
  return {
    id: 'cfi',
    gravity: 'µg',
    place: 'ISS · Destiny · CIR',
    noun: t(['test', 'tests'], ['ensaio', 'ensaios']),
    stripMeasure: t('Bar height: hot flame extinction diameter ÷ initial diameter', 'Altura da barra: diâmetro de extinção da chama quente ÷ diâmetro inicial'),
    stages: [
      ...flightStages<DropletRun>({
        rack: 'cir',
        experiment: 'CFI',
        next: dropletStage.id,
        glow: 'cool',
        noun: t('test', 'ensaio'),
        dateOf: (run) => (byId.get(run.id)?.data as string | null) ?? null,
        diagnostics,
        rackFacts: [
          { label: t('Chamber', 'Câmara'), value: t('≈ 100 L · 8 windows', '≈ 100 L · 8 janelas') },
          { label: t('Cameras of the test', 'Câmeras do ensaio'), value: t('lit on the rack', 'acesas no rack'), hint: t('The packages in cyan are the ones the camera table marks as on in this test.', 'Os pacotes em ciano são os que a tabela de câmeras marca como ligados neste ensaio.') },
        ],
      }),
      {
        ...dropletStage,
        blurb:
          t('The hot flame goes out early, with the droplet still large — and burning continues in a cool flame, invisible to the naked eye, down to a second extinction diameter. Here the cool flame is shown in blue.', 'A chama quente se apaga cedo, com a gota ainda grande — e a queima continua numa chama fria, invisível a olho nu, até um segundo diâmetro de extinção. Aqui a chama fria aparece em azul.'),
      },
    ],
    runs: rows.map((r) => toRun(r, radMax)),
  }
}

/** Os pacotes de diagnóstico de um ensaio, para a ficha do laboratório. */
export function cameraList(cameras: readonly Row[], id: string): Diagnostic[] {
  const row = cameras.find((c) => String(c.teste_id) === id)
  return [...CAMERAS, 'Downlink Video' as const].map((name) => ({ id: name, label: name, on: String(row?.[name] ?? '').toLowerCase() === 'yes' }))
}
