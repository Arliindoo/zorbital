/** Contratos entre a tela da simulação, o diretor (laço de desenho) e cada estudo. */

import type { Pose, Renderer } from './engine/renderer'
import type { V3 } from './engine/vec'
import type { Tone } from './engine/wire'

export type { Tone }

/** Um par rótulo/valor do HUD. `soft` marca o que não é medição (estimado, ilustrativo). */
export interface Readout {
  label: string
  value: string
  unit?: string
  tone?: Tone
  hint?: string
  soft?: boolean
}

/** Trecho da linha do tempo de um ensaio. */
export interface Phase {
  id: string
  label: string
  t0: number
  t1: number
  tone: Tone
  /** o fim deste trecho não está registrado na fonte */
  open?: boolean
}

export interface ChartSeries {
  tone: Tone
  points: readonly (readonly [number, number])[]
  dashed?: boolean
  dots?: boolean
}

/** Gráfico pequeno do painel de telemetria, com um cursor que acompanha o relógio. */
export interface MiniChart {
  xLabel: string
  yLabel: string
  series: readonly ChartSeries[]
  cursor: (t: number) => readonly [number, number] | null
  yZero?: boolean
}

/** Uma unidade que se escolhe e se reproduz: um ensaio, uma condição, uma série de dados. */
export interface SimRun<S = unknown> {
  id: string
  /** identificador curto (número do ensaio) */
  label: string
  title: string
  group?: string
  /** cor na faixa de ensaios e o que ela quer dizer */
  tone: Tone
  toneLabel: string
  /** altura da barra na faixa, 0..1 (nulo = sem medida) */
  level: number | null
  playable: boolean
  /** por que não dá para reproduzir */
  blocked?: string
  /** começo e fim do relógio, na unidade dele */
  start: number
  duration: number
  /** segundos de tela para a reprodução inteira, em 1× */
  wall: number
  clock: { label: string; unit: string; digits: number; note?: string }
  phases: readonly Phase[]
  conditions: readonly Readout[]
  /** composição da atmosfera, em frações (barra empilhada) */
  mix?: readonly { label: string; value: number; tone: Tone }[]
  telemetry: (t: number) => readonly Readout[]
  phaseAt: (t: number) => { label: string; tone: Tone }
  verdict: { label: string; detail: string; tone: Tone }
  chart?: MiniChart
  /** o que é dado da fonte e o que é reconstrução ou ilustração */
  notes: readonly string[]
  state: S
}

/** Marcador sobre a cena, com rótulo em DOM ligado ao ponto por uma linha de chamada. */
export interface Hotspot {
  id: string
  at: V3
  label: string
  sub?: string
  /** cena de destino ao clicar */
  to?: string
  /** grupo de malhas que acende ao passar o ponteiro */
  tag?: string
  /** deslocamento do rótulo em px, a partir do ponto */
  dx: number
  dy: number
  minor?: boolean
  /** o ponto está à vista? (atrás de um planeta, por exemplo, o rótulo some) */
  shown?: () => boolean
}

/** Cota sobre a cena: um traço horizontal com a largura de uma medida, e o valor. */
export interface Dim {
  at: V3
  /** largura na unidade da cena */
  width: number
  text: string
  tone: Tone
  /** abaixo (padrão) ou acima do ponto */
  above?: boolean
  /** distância do ponto, em px (o padrão é meia largura + 12: a cota contorna uma esfera) */
  offset?: number
  /** em vez de `offset`: raio, na unidade da cena, que a cota deve deixar livre */
  clear?: number
}

export interface View {
  pose: Pose
  /** distância mínima e máxima da câmera */
  zoom: readonly [number, number]
  /** onde o alvo aparece, em fração do quadro */
  center?: readonly [number, number]
  /** parado, a câmera dá a volta inteira ('spin') ou só balança em torno da pose ('sway', o padrão) */
  idle?: 'spin' | 'sway'
  hotspots: readonly Hotspot[]
}

export interface Frame<S> {
  r: Renderer
  run: SimRun<S> | null
  /** relógio do ensaio */
  t: number
  /** a cena atual é a do experimento (o relógio anda) */
  live: boolean
  /** segundos de parede */
  now: number
  dt: number
  /** 0..1: progresso do desenho de entrada da cena */
  reveal: number
  /** opacidade geral (transições entre cenas) */
  alpha: number
  /** grupo de malhas em realce */
  focus: string | null
  still: boolean
}

export interface Scene<S> {
  /** raio aproximado, para a névoa de profundidade */
  radius: number
  near: number
  views: Record<string, View>
  draw(frame: Frame<S>): void
  dims?(frame: Frame<S>): readonly Dim[]
  dispose(): void
}

export interface StageDef<S> {
  id: string
  /** nome curto na trilha */
  label: string
  /** escala ou lugar, em poucas palavras */
  scale: string
  title: string
  blurb: string
  facts: (run: SimRun<S> | null) => readonly Readout[]
  /** é aqui que o ensaio é reproduzido */
  experiment: boolean
  /** cenas com a mesma chave compartilham a geometria (só a câmera muda) */
  sceneKey: string
  view: string
  scene: (r: Renderer) => Scene<S>
}

export interface SimStudy<S = unknown> {
  id: string
  gravity: 'µg' | '1 g'
  place: string
  stages: readonly StageDef<S>[]
  runs: readonly SimRun<S>[]
  /** como se chama uma unidade: ['ensaio', 'ensaios'] */
  noun: readonly [string, string]
  /** o que a altura da barra mostra na faixa */
  stripMeasure: string
}
