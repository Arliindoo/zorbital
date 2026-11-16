import { t } from '@/shared/lib/i18n'

/**
 * A página como palco: os blocos marcados com `data-agent-target` (gráficos, métricas, tabelas…) são o que
 * o agente "lê". Aqui eles são achados no DOM e medidos; quem desenha é o Overlay.
 */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface TargetEl {
  el: HTMLElement
  id: string
  kind: string
  label: string
}

const KIND_WEIGHT: Record<string, number> = { chart: 5, flow: 4, table: 3, metric: 2, card: 1 }
/** Nome de cada tipo de bloco, como aparece na etiqueta do palco e nos ramos da linha do tempo. */
export const KIND_LABEL: Record<string, string> = {
  chart: t('chart', 'gráfico'),
  metric: t('metric', 'métrica'),
  table: t('table', 'tabela'),
  flow: t('flow', 'fluxo'),
  card: t('block', 'bloco'),
  screen: t('screen', 'tela'),
}
export const MAX_TARGETS = 8

export function stageElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-agent-stage]')
}

function cssPx(name: string): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) ? value : 0
}

/** Área da janela onde o conteúdo da página aparece (sem o trilho, a barra do topo e o painel do agente). */
export function viewportBox(panel?: Box | null): Box {
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  const stage = stageElement()?.getBoundingClientRect()
  const left = stage ? Math.max(0, stage.left) : 0
  const top = stage ? Math.max(stage.top, cssPx('--topbar'), 0) : 0
  let right = stage ? Math.min(vw, stage.right) : vw
  let bottom = vh
  if (panel) {
    const lateral = panel.h > vh * 0.6 && panel.x > vw * 0.35
    if (lateral) right = Math.min(right, panel.x)
    else bottom = Math.min(bottom, panel.y)
  }
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }
}

/** Todos os blocos marcados da página; quando um bloco contém outros, ficam só os de dentro. */
export function collectTargets(): TargetEl[] {
  const root: ParentNode = stageElement() ?? document
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-agent-target]'))
  return nodes
    .filter((el) => !el.closest('[data-agent-ui]') && !el.querySelector('[data-agent-target]'))
    .map((el, i) => {
      const name = el.dataset.agentTarget
      const label = el.dataset.agentLabel?.trim() || el.getAttribute('aria-label')?.trim() || name || t('Block', 'Bloco')
      return { el, id: `${name || 'bloco'}#${i}`, kind: el.dataset.agentKind || 'card', label }
    })
}

export function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const r = Math.min(a.x + a.w, b.x + b.w)
  const bt = Math.min(a.y + a.h, b.y + b.h)
  return r - x > 0 && bt - y > 0 ? { x, y, w: r - x, h: bt - y } : null
}

export function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/** O pedaço visível de um bloco, ou null se ele está (quase) fora da vista. */
export function visiblePart(box: Box, free: Box): Box | null {
  const part = intersect(box, free)
  if (!part || part.w < 72 || part.h < 40) return null
  const share = (part.w * part.h) / Math.max(1, box.w * box.h)
  return share >= 0.3 || part.h >= 140 ? part : null
}

/** Os blocos à vista, no máximo MAX_TARGETS: primeiro gráficos e tabelas, depois os maiores; em ordem de leitura. */
export function pickVisible(all: readonly TargetEl[], free: Box, max = MAX_TARGETS): TargetEl[] {
  const seen = all
    .map((t) => ({ t, part: visiblePart(boxOf(t.el), free) }))
    .filter((v): v is { t: TargetEl; part: Box } => v.part !== null)
  seen.sort(
    (a, b) =>
      (KIND_WEIGHT[b.t.kind] ?? 1) - (KIND_WEIGHT[a.t.kind] ?? 1) || b.part.w * b.part.h - a.part.w * a.part.h,
  )
  return seen
    .slice(0, max)
    .sort((a, b) => Math.round(a.part.y / 24) - Math.round(b.part.y / 24) || a.part.x - b.part.x)
    .map((v) => v.t)
}

export function findTarget(id: string): HTMLElement | null {
  return collectTargets().find((t) => t.id === id)?.el ?? null
}
