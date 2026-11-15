/** O que os dois estudos em solo (PSI-117, PSI-142) têm em comum: a Terra vista de fora. */

import type { Renderer } from '../engine/renderer'
import { type GlobeOptions, globeScene } from '../scenes/globe'
import type { StageDef } from '../types'

export function groundStage<S>(o: GlobeOptions & { blurb: string }): StageDef<S> {
  return {
    id: 'terra',
    label: 'Terra',
    scale: 'solo · 1 g',
    title: 'Investigação em solo',
    blurb: o.blurb,
    facts: () => [
      { label: 'Gravidade', value: '1 g', hint: 'Com gravidade, o gás quente sobe: a chama sofre empuxo.' },
      { label: 'Órbita da ISS', value: '≈ 400', unit: 'km' },
      { label: 'Inclinação da órbita', value: '51,6', unit: '°' },
    ],
    experiment: false,
    sceneKey: `terra:${o.site?.name ?? 'sem-local'}`,
    view: 'main',
    scene: (r: Renderer) => globeScene<S>(r, o),
  }
}
