/** O que os três estudos de voo (FLEX, CFI, BASS-II) têm em comum: órbita e laboratório. */

import { locale, t } from '@/shared/lib/i18n'
import type { Renderer } from '@/visualization/engine/renderer'
import { type Diagnostic, LAB_FACTS, labScene, type RackKind } from '@/visualization/scenes/lab'
import { orbitScene } from '@/visualization/scenes/orbit'
import type { Readout, SimRun, StageDef } from '@/visualization/types'

const ORBIT_FACTS: readonly Readout[] = [
  { label: 'Altitude', value: '≈ 400', unit: 'km' },
  { label: t('Speed', 'Velocidade'), value: t('≈ 7.66', '≈ 7,66'), unit: 'km/s' },
  { label: t('One orbit', 'Uma volta'), value: '≈ 92', unit: 'min' },
  { label: t('Inclination', 'Inclinação'), value: t('51.6', '51,6'), unit: '°' },
]

const date = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replaceAll('.', '')
}

export interface FlightOptions<S> {
  rack: RackKind
  /** nome do experimento, para os textos */
  experiment: string
  /** id da cena do experimento */
  next: string
  glow: 'hot' | 'cool'
  /** data do ensaio selecionado (ISO), para a ficha da órbita */
  dateOf: (run: SimRun<S>) => string | null
  noun: string
  diagnostics?: (run: SimRun<S> | null) => readonly Diagnostic[]
  rackFacts: readonly Readout[]
}

export function flightStages<S>(o: FlightOptions<S>): StageDef<S>[] {
  const rackName = o.rack === 'cir' ? 'CIR' : 'MSG'
  return [
    {
      id: 'orbita',
      label: t('Orbit', 'Órbita'),
      scale: 'ISS · ≈ 400 km',
      title: t('International Space Station', 'Estação Espacial Internacional'),
      blurb: t(`${o.experiment} flew here. In continuous free fall there is no buoyancy: hot gas does not rise, and the flame no longer has an "up".`, `O ${o.experiment} voou aqui. Em queda livre contínua não há empuxo: o gás quente não sobe, e a chama deixa de ter "para cima".`),
      facts: (run) => [...ORBIT_FACTS, ...(run ? [{ label: t('Test date', `Data do ${o.noun}`), value: date(o.dateOf(run)) }] : [])],
      experiment: false,
      sceneKey: 'orbita',
      view: 'main',
      scene: (r: Renderer) => orbitScene<S>(r, { next: 'laboratorio', sub: t(`US laboratory · home of the ${rackName}`, `Laboratório dos EUA · onde fica o ${rackName}`) }),
    },
    {
      id: 'laboratorio',
      label: `Destiny · ${rackName}`,
      scale: t('laboratory · 8.5 m', 'laboratório · 8,5 m'),
      title: o.rack === 'cir' ? 'Combustion Integrated Rack' : 'Microgravity Science Glovebox',
      blurb:
        o.rack === 'cir'
          ? t('A whole rack dedicated to combustion: a sealed chamber with windows, an optics bench with the cameras, and gas bottles to build the atmosphere of each test.', 'Um rack inteiro dedicado à combustão: câmara selada com janelas, bancada óptica com as câmeras e garrafas de gás para montar a atmosfera de cada ensaio.')
          : t('A sealed bench with gloves: the astronaut swaps the samples by hand, and whatever burns stays contained in the work volume.', 'Uma bancada selada com luvas: o astronauta troca as amostras à mão, e o que queima fica contido no volume de trabalho.'),
      facts: () => [...LAB_FACTS, ...o.rackFacts],
      experiment: false,
      sceneKey: `laboratorio:${o.rack}`,
      view: 'main',
      scene: (r: Renderer) => labScene<S>(r, { rack: o.rack, next: o.next, diagnostics: o.diagnostics, glow: o.glow }),
    },
  ]
}

export { date as shortDate }
