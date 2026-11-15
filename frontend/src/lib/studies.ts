/** Estudos: onde cada um abre, a busca sem acento e os textos de origem. Funções puras. */

import type { Evidence, Portal, StudyCard } from '@/api/types'
import { t } from '@/lib/i18n'
import type { Range } from './data'

/** Os estudos do catálogo têm página própria; os enviados abrem na página genérica. */
export const CATALOG_PAGES: Record<string, string> = {
  'PSI-69': '/flex',
  'PSI-25': '/bass',
  'PSI-39': '/cfi',
  'PSI-117': '/psi117',
  'PSI-142': '/psi142',
}

export const studyPath = (id: string): string => CATALOG_PAGES[id] ?? `/estudos/${encodeURIComponent(id)}`

/** "FLEX — Flame Extinguishment Experiment" → "FLEX". */
export const shortName = (name: string): string => name.split(' — ')[0] ?? name

/** Minúsculo e sem acento: 'Extinção' → 'extincao' (o mesmo `fold` do servidor). */
export function fold(text: unknown): string {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/**
 * Estudos que têm todas as palavras da busca → onde cada palavra apareceu (sem repetir).
 * Busca vazia devolve todos, sem motivo.
 */
export function searchStudies(cards: readonly Pick<StudyCard, 'id' | 'busca'>[], query: string): Map<string, string[]> {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const found = new Map<string, string[]>()
  for (const card of cards) {
    const hits: string[] = []
    const all = words.every((word) => {
      const hit = card.busca.find(([, text]) => fold(text).includes(word))
      if (hit) hits.push(hit[0])
      return !!hit
    })
    if (all) found.set(card.id, [...new Set(hits)])
  }
  return found
}

/** A faixa do estudo cruza a escolhida. Filtro aberto (null) deixa passar quem não tem o dado. */
export function overlaps(range: Range | null, chosen: Range | null): boolean {
  if (!chosen) return true
  return !!range && range[0] <= chosen[1] && range[1] >= chosen[0]
}

/** De onde saiu uma interpretação: documento (arquivo, página, trecho), cabeçalho ou inferência. */
export function evidenceLabel(evidence: Evidence | null | undefined): string {
  const kind = evidence?.tipo || 'inferido'
  if (kind === 'documento') {
    const where = [evidence?.arquivo ?? '', evidence?.pagina ? `p. ${evidence.pagina}` : ''].filter(Boolean).join(' ')
    const quote = evidence?.trecho ? ` · “${evidence.trecho}”` : ''
    return `${t('document', 'documento')} · ${where}${quote}`
  }
  return { cabecalho: t('table header', 'cabeçalho da tabela'), inferido: t('inferred by the AI', 'inferido pela IA') }[kind] ?? kind
}

/** '08-01-2007' e '07-31-2016' (mês-dia-ano, como no portal) → '2007–2016'. */
export function period(portal: Pick<Portal, 'inicio' | 'fim'>): string | null {
  const years = [portal.inicio, portal.fim].map((d) => d?.slice(-4)).filter((y): y is string => !!y && /^\d{4}$/.test(y))
  return [...new Set(years)].join('–') || null
}

/** Três algarismos significativos, como as etiquetas da ficha. */
export const sig3 = (value: number): string => String(Number(value.toPrecision(3)))

/** "12–30" ou "21" quando a faixa é um valor só. */
export const rangeText = (range: Range, factor = 1): string => {
  const [lo, hi] = [sig3(range[0] * factor), sig3(range[1] * factor)]
  return lo === hi ? lo : `${lo}–${hi}`
}

/** Perguntas longas não esticam a linha de cartões: corta na última palavra inteira. */
export function clip(text: string, max = 160): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 3)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 0)) || cut}…`
}
