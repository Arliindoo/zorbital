/** O que os três estudos de voo (FLEX, CFI, BASS-II) têm em comum: órbita e laboratório. */

import type { Renderer } from '../engine/renderer'
import { type Diagnostic, LAB_FACTS, labScene, type RackKind } from '../scenes/lab'
import { orbitScene } from '../scenes/orbit'
import type { Readout, SimRun, StageDef } from '../types'

const ORBIT_FACTS: readonly Readout[] = [
  { label: 'Altitude', value: '≈ 400', unit: 'km' },
  { label: 'Velocidade', value: '≈ 7,66', unit: 'km/s' },
  { label: 'Uma volta', value: '≈ 92', unit: 'min' },
  { label: 'Inclinação', value: '51,6', unit: '°' },
]

const date = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replaceAll('.', '')
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
      label: 'Órbita',
      scale: 'ISS · ≈ 400 km',
      title: 'Estação Espacial Internacional',
      blurb: `O ${o.experiment} voou aqui. Em queda livre contínua não há empuxo: o gás quente não sobe, e a chama deixa de ter "para cima".`,
      facts: (run) => [...ORBIT_FACTS, ...(run ? [{ label: `Data do ${o.noun}`, value: date(o.dateOf(run)) }] : [])],
      experiment: false,
      sceneKey: 'orbita',
      view: 'main',
      scene: (r: Renderer) => orbitScene<S>(r, { next: 'laboratorio', sub: `Laboratório dos EUA · onde fica o ${rackName}` }),
    },
    {
      id: 'laboratorio',
      label: `Destiny · ${rackName}`,
      scale: 'laboratório · 8,5 m',
      title: o.rack === 'cir' ? 'Combustion Integrated Rack' : 'Microgravity Science Glovebox',
      blurb:
        o.rack === 'cir'
          ? 'Um rack inteiro dedicado à combustão: câmara selada com janelas, bancada óptica com as câmeras e garrafas de gás para montar a atmosfera de cada ensaio.'
          : 'Uma bancada selada com luvas: o astronauta troca as amostras à mão, e o que queima fica contido no volume de trabalho.',
      facts: () => [...LAB_FACTS, ...o.rackFacts],
      experiment: false,
      sceneKey: `laboratorio:${o.rack}`,
      view: 'main',
      scene: (r: Renderer) => labScene<S>(r, { rack: o.rack, next: o.next, diagnostics: o.diagnostics, glow: o.glow }),
    },
  ]
}

export { date as shortDate }
