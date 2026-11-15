/** Revisão do envio: o que a tela edita vira o que o servidor grava. Funções puras. */

import type { DocSheet, SheetCondition, SheetSensor, Spec, SpecColumn, SpecTable, Vocabulary } from '@/api/types'

export function blank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value)) || String(value).trim() === ''
}

const text = (value: unknown): string | null => (blank(value) ? null : String(value))
const number = (value: unknown): number | null => (blank(value) || Number.isNaN(Number(value)) ? null : Number(value))

/**
 * A ficha como vai para o servidor: linhas em que só as caixas de marcar foram mexidas não são itens,
 * campos vazios viram nulos e um objetivo sem texto sai. Linhas novas não têm evidência — a validação
 * acusa, e é isso mesmo: sem trecho citado, nada entra na ficha.
 */
export function cleanSheet(sheet: DocSheet | null | undefined): DocSheet {
  const goal = sheet?.objetivo
  const conditions: SheetCondition[] = (sheet?.condicoes ?? [])
    .filter((c) => ![c.atributo, c.valor, c.minimo, c.maximo, c.unidade].every(blank))
    .map((c) => ({
      ...c,
      atributo: text(c.atributo),
      valor: text(c.valor),
      minimo: number(c.minimo),
      maximo: number(c.maximo),
      unidade: text(c.unidade),
      planejado: !!c.planejado,
      confirmado: !!c.confirmado,
      evidencia: c.evidencia ?? {},
    }))
  const sensors: SheetSensor[] = (sheet?.sensores ?? [])
    .filter((s) => ![s.nome, s.mede, s.grandeza].every(blank))
    .map((s) => ({ ...s, nome: text(s.nome), mede: text(s.mede), grandeza: text(s.grandeza), planejado: !!s.planejado, confirmado: !!s.confirmado, evidencia: s.evidencia ?? {} }))
  return {
    objetivo: goal && !blank(goal.texto) ? { ...goal, confirmado: !!goal.confirmado } : null,
    condicoes: conditions,
    sensores: sensors,
  }
}

/** Quantos itens a ficha tem (objetivo, sensores e condições), contando os desmarcados. */
export function sheetSize(sheet: DocSheet | null | undefined): number {
  return (sheet?.objetivo ? 1 : 0) + (sheet?.sensores?.length ?? 0) + (sheet?.condicoes?.length ?? 0)
}

/** Itens desmarcados: não vão ser gravados. */
export function sheetPending(sheet: DocSheet | null | undefined): number {
  const items = [...(sheet?.objetivo ? [sheet.objetivo] : []), ...(sheet?.sensores ?? []), ...(sheet?.condicoes ?? [])]
  return items.filter((item) => !item.confirmado).length
}

/** Colunas inferidas pela IA, sem fonte escrita, que ainda esperam a confirmação de quem revisa. */
export function pendingColumns(table: SpecTable): string[] {
  return table.colunas.filter((c) => c.natureza !== 'IGNORAR' && !c.confirmado).map((c) => c.origem)
}

export function specialValues(column: SpecColumn): string {
  return (column.valores_especiais ?? []).map((v) => `${v.valor} → ${v.significado}`).join('; ')
}

/** A especificação como vai para o servidor: cautelas sem texto saem, as novas nascem como inferência. */
export function cleanSpec(spec: Spec): Spec {
  return {
    ...spec,
    investigacao: {
      ...spec.investigacao,
      cautelas: (spec.investigacao.cautelas ?? []).filter((c) => !blank(c.texto)).map((c) => ({ texto: c.texto, evidencia: c.evidencia ?? { tipo: 'inferido' } })),
    },
    tabelas: spec.tabelas.map((table) => ({
      ...table,
      fontes: table.fontes.map((s) => ({ ...s, linha_cabecalho: Math.max(1, Math.round(Number(s.linha_cabecalho) || 1)), rotulo: text(s.rotulo) })),
      colunas: table.colunas.map((c) => ({ ...c, unidade: text(c.unidade), atributo: text(c.atributo), grandeza: text(c.grandeza), confirmado: !!c.confirmado })),
    })),
    ficha: sheetSize(spec.ficha) ? cleanSheet(spec.ficha) : spec.ficha,
  }
}

type Option = { value: string; label: string }
const labelled = (entry: { chave: string; rotulo: string; unidade: string | null }): Option => ({
  value: entry.chave,
  label: entry.unidade ? `${entry.rotulo} (${entry.unidade})` : entry.rotulo,
})
const EMPTY: Option = { value: '', label: '—' }

/** As listas fechadas da revisão, prontas para os seletores. */
export function options(vocabulary: Vocabulary) {
  const attributes = vocabulary.atributos.map(labelled)
  return {
    natures: vocabulary.naturezas.map((value) => ({ value, label: value })),
    types: vocabulary.tipos.map((value) => ({ value, label: value })),
    attributes: [EMPTY, ...attributes],
    conditionAttributes: [EMPTY, ...attributes.filter((a) => vocabulary.atributos_condicao.includes(a.value))],
    quantities: [EMPTY, ...vocabulary.grandezas.map(labelled)],
  }
}
