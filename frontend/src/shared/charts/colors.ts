import { t } from '@/shared/lib/i18n'

/**
 * Cores dos gráficos. São referências aos tokens de styles/tokens.css (não valores fixos),
 * para que cada gráfico acompanhe a troca de tema sem redesenhar.
 */

// Paleta categórica em ordem fixa: a ordem garante a separação para daltônicos entre séries
// vizinhas (validada nos dois fundos), então não reordene nem gere um nono tom.
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'] as const
export const MAX_SERIES = SERIES.length
export const INK = { primary: 'var(--ink)', muted: 'var(--ink-2)', faint: 'var(--ink-3)', grid: 'var(--line)' }
export const STATUS = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--info)', idle: 'var(--ink-3)' }

// Categorias do domínio com cor fixa: a mesma categoria tem a mesma cor em toda página,
// e filtrar uma delas não repinta as outras.
export const DOMAIN_ORDER = {
  desfecho: ['Extinção', 'Queima completa', 'Ruptura da gota'],
  tipo_chama: ['Chama fria', 'Chama quente'],
  material_categoria: ['PMMA', 'SIBAL (tecido)', 'Não escrito na fonte', 'Nomex (tecido)', 'Cera (vela)'],
  // gotas: o n-dodecano tem a mesma cor no CFI, no PSI-117 e na comparação
  combustivel: [
    'n-dodecano',
    'n-dodecano/iso-dodecano 75/25',
    'n-dodecano/iso-dodecano 60/40',
    'Farnesano',
    'n-heptano',
    'n-decano',
  ],
} as const satisfies Record<string, readonly string[]>

export type DomainColumn = keyof typeof DOMAIN_ORDER

// chama fria é fria (azul), chama quente é quente (laranja): a cor ajuda a ler, não só a separar
const FIXED: Partial<Record<DomainColumn, Record<string, string>>> = {
  tipo_chama: { 'Chama fria': SERIES[3], 'Chama quente': SERIES[2] },
}
export const FLAME = { fria: SERIES[3], quente: SERIES[2] }

export function domainColors(column: DomainColumn): Record<string, string> {
  return FIXED[column] ?? Object.fromEntries(DOMAIN_ORDER[column].map((value, i) => [value, SERIES[i]!]))
}

/**
 * A cor segue a entidade: quem já tem cor mantém, quem entra pega a menor livre.
 * Assim, tirar uma série do filtro não repinta as que ficaram.
 */
export function assignSlots(entities: readonly string[], slots: Readonly<Record<string, number>>): Record<string, number> {
  if (entities.length > MAX_SERIES) throw new RangeError(t(`At most ${MAX_SERIES} series per chart.`, `No máximo ${MAX_SERIES} séries por gráfico.`))
  const kept: Record<string, number> = {}
  for (const [entity, slot] of Object.entries(slots)) if (entities.includes(entity)) kept[entity] = slot
  const used = new Set(Object.values(kept))
  const free = Array.from({ length: MAX_SERIES }, (_, i) => i).filter((i) => !used.has(i))
  for (const entity of entities) if (!(entity in kept)) kept[entity] = free.shift()!
  return kept
}
