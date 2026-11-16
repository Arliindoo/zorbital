/** O que os dois estudos em solo (PSI-117, PSI-142) têm em comum: a Terra vista de fora. */

import { t } from '@/shared/lib/i18n'
import type { Renderer } from '@/visualization/engine/renderer'
import { type GlobeOptions, globeScene } from '@/visualization/scenes/globe'
import type { StageDef } from '@/visualization/types'

export function groundStage<S>(o: GlobeOptions & { blurb: string }): StageDef<S> {
  return {
    id: 'terra',
    label: t('Earth', 'Terra'),
    scale: t('ground · 1 g', 'solo · 1 g'),
    title: t('Ground investigation', 'Investigação em solo'),
    blurb: o.blurb,
    facts: () => [
      { label: t('Gravity', 'Gravidade'), value: '1 g', hint: t('With gravity, hot gas rises: the flame is subject to buoyancy.', 'Com gravidade, o gás quente sobe: a chama sofre empuxo.') },
      { label: t('ISS orbit', 'Órbita da ISS'), value: '≈ 400', unit: 'km' },
      { label: t('Orbit inclination', 'Inclinação da órbita'), value: t('51.6', '51,6'), unit: '°' },
    ],
    experiment: false,
    sceneKey: `terra:${o.site?.name ?? 'sem-local'}`,
    view: 'main',
    scene: (r: Renderer) => globeScene<S>(r, o),
  }
}
