import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { queries } from '@/api/client'
import type { Dataset, DictionaryRow, Row } from '@/api/types'
import { useScreen } from '@/assistant/store'
import { BarList } from '@/charts/BarList'
import { SERIES } from '@/charts/colors'
import { XYChart, type XYSeries } from '@/charts/XYChart'
import { DataTable } from '@/components/DataTable'
import { CheckboxGroup, RangeFilter, Select } from '@/components/filters'
import { AlertsTable, InvestigationHeader } from '@/components/investigation'
import { SidebarFilters } from '@/components/Layout'
import { Caption, Expander, Metric, Metrics, Section } from '@/components/ui'
import { IconArrowLeft, IconChecklist, IconCompare, IconDatabase, IconScatter } from '@/icons'
import { extent, groupBy, inRangeOrNull, omit, type Range, uniqueSorted } from '@/lib/data'
import { cell } from '@/lib/format'
import { evidenceLabel } from '@/lib/studies'
import { usePageState } from '@/lib/usePageState'

const MAX_CATEGORIES = 30
const NO_COLOR = '(nenhuma)'
const MEASURED = ['MEDIDO', 'SIMULADO', 'DERIVADO']
const PROVENANCE = ['fonte_arquivo', 'fonte_aba', 'linha_fonte']

type Filters = Record<string, Range | string[]>
const EMPTY: Dataset = { columns: [], rows: [] }

/** O que dá para filtrar, medir e colorir numa tabela, segundo o dicionário aprovado na revisão. */
function roles(data: Dataset, dictionary: readonly DictionaryRow[]) {
  const present = new Set(data.columns.map((c) => c.name))
  const cols = dictionary.filter((c) => present.has(c.coluna))
  const numeric = new Set(cols.filter((c) => c.tipo === 'numero').map((c) => c.coluna))
  const conditions = cols.filter((c) => c.natureza === 'CONDICAO').map((c) => c.coluna)
  const categorical = conditions.filter((c) => !numeric.has(c) && new Set(data.rows.map((r) => r[c])).size <= MAX_CATEGORIES)
  return {
    numeric,
    conditions,
    categorical,
    measures: MEASURED.flatMap((nature) => cols.filter((c) => c.natureza === nature && numeric.has(c.coluna)).map((c) => c.coluna)),
    identifiers: cols.filter((c) => c.natureza === 'IDENTIFICADOR').map((c) => c.coluna),
    unit: Object.fromEntries(cols.map((c) => [c.coluna, c.unidade])) as Record<string, string | null>,
  }
}

function scatter(rows: readonly Row[], x: string, y: string, color: string | null, hover: readonly string[]): XYSeries[] {
  const plotted = rows.filter((r) => typeof r[x] === 'number' && typeof r[y] === 'number')
  const groups = color ? groupBy(plotted, (r) => cell(r[color]) || '(vazio)') : new Map([[y, plotted]])
  return [...groups.entries()].slice(0, SERIES.length).map(([name, list], i) => ({
    name,
    color: SERIES[i]!,
    type: 'points',
    data: list.map((r) => ({ x: r[x] as number, y: r[y] as number, tip: hover.map((h) => [h, cell(r[h]) || '—'] as const) })),
  }))
}

export default function Estudo() {
  const { id = '' } = useParams()
  const { data } = useSuspenseQuery(queries.submittedStudy(id))
  const { investigacao: inv, dicionario, tabelas, sugestoes, alertas } = data
  const tableNames = Object.keys(tabelas)
  const [tableChoice, setTable] = usePageState<string>(`estudo:${id}:tabela`, tableNames[0] ?? '')
  const table = tableNames.includes(tableChoice) ? tableChoice : (tableNames[0] ?? '')
  const frame = tabelas[table] ?? EMPTY
  const columns = useMemo(() => dicionario.filter((c) => c.tabela === table), [dicionario, table])
  const role = useMemo(() => roles(frame, columns), [frame, columns])

  const [filters, setFilters] = usePageState<Filters>(`estudo:${id}:${table}:filtros`, {})
  const view = useMemo(
    () =>
      frame.rows.filter((row) =>
        role.conditions.every((c) => {
          const chosen = filters[c]
          if (!chosen) return true
          if (role.numeric.has(c)) return inRangeOrNull(row[c], chosen as Range)
          return row[c] === null || row[c] === undefined || (chosen as string[]).includes(String(row[c]))
        }),
      ),
    [frame, role, filters],
  )

  const xOptions = [...role.conditions, ...role.measures].filter((c) => role.numeric.has(c))
  const [yChoice, setY] = usePageState<string>(`estudo:${id}:${table}:y`, '')
  const y = role.measures.includes(yChoice) ? yChoice : role.measures[0]
  const xFor = xOptions.filter((c) => c !== y)
  const [xChoice, setX] = usePageState<string>(`estudo:${id}:${table}:x`, '')
  const x = xFor.includes(xChoice) ? xChoice : (xFor[0] ?? role.measures.find((c) => c !== y))
  const [colorChoice, setColor] = usePageState<string>(`estudo:${id}:${table}:cor`, NO_COLOR)
  const color = role.categorical.includes(colorChoice) ? colorChoice : null
  const [groupChoice, setGroup] = usePageState<string>(`estudo:${id}:${table}:grupo`, '')
  const group = role.categorical.includes(groupChoice) ? groupChoice : role.categorical[0]

  const axis = (c: string) => `${c} (${role.unit[c] || '—'})`
  const series = useMemo(() => (x && y ? scatter(view, x, y, color, role.identifiers) : []), [view, x, y, color, role])
  const counts = useMemo(
    () =>
      group
        ? [...groupBy(view, (r) => cell(r[group]) || '(vazio)').entries()].map(([label, list]) => ({ label, value: list.length })).sort((a, b) => b.value - a.value)
        : [],
    [view, group],
  )
  const chartNote = x && y ? `Dispersão ${x} (x) × ${y} (y)${color ? `, cor por ${color}` : ''}` : group ? `Contagem de registros por ${group}` : ''

  const measured = useMemo(
    () =>
      columns.map((c) => ({
        coluna: c.coluna,
        natureza: c.natureza,
        unidade: c.unidade,
        descricao: c.descricao,
        origem: c.origem,
        confirmado: c.confirmado,
        evidencia: evidenceLabel({ tipo: c.evidencia_tipo, arquivo: c.evidencia_arquivo, pagina: c.evidencia_pagina, trecho: c.evidencia_trecho }),
      })),
    [columns],
  )

  useScreen({
    pagina: 'estudos',
    titulo: inv.nome,
    investigacao: inv.id,
    filtros: { tabela: table, ...Object.fromEntries(Object.entries(filters).filter(([c]) => role.conditions.includes(c))) },
    graficos: chartNote ? [chartNote] : [],
    dados: omit(view, ['fonte_arquivo']),
    tabela_banco: table,
  })

  return (
    <>
      <SidebarFilters title="Filtros">
        {tableNames.length > 1 && <Select label="Tabela" options={tableNames} value={table} onChange={setTable} />}
        {role.conditions.map((c) => {
          if (role.numeric.has(c)) {
            return <RangeFilter key={c} label={axis(c)} bounds={extent(frame.rows.map((r) => r[c]))} value={(filters[c] as Range | undefined) ?? null} onChange={(next) => setFilters((all) => ({ ...all, [c]: next }))} />
          }
          if (!role.categorical.includes(c)) return null
          const options = uniqueSorted(frame.rows.map((r) => r[c] ?? null)).map(String)
          return <CheckboxGroup key={c} label={c} options={options} value={(filters[c] as string[] | undefined) ?? options} onChange={(next) => setFilters((all) => ({ ...all, [c]: next }))} />
        })}
        {!role.conditions.length && <Caption>Este estudo não tem colunas de condição para filtrar.</Caption>}
      </SidebarFilters>

      <Link className="back-link label" to="/estudos">
        <IconArrowLeft size={15} /> Todos os estudos
      </Link>
      <InvestigationHeader inv={inv} rows={frame.rows.length} />

      <Metrics>
        <Metric label="Registros no filtro" value={view.length} />
        <Metric label="Colunas aferidas" value={columns.length} />
        <Metric label="Medidas numéricas" value={role.measures.length} />
        <Metric label="Alertas de qualidade" value={alertas.rows.length} />
      </Metrics>

      {x && y ? (
        <Section title={`${y} em função de ${x}`} kind="chart" icon={IconScatter} tag="dispersão" caption="Escolha a medida, o eixo e a cor. Um ponto por registro no filtro.">
          <div className="controls">
            <Select label="Medida (y)" options={role.measures} value={y} onChange={setY} />
            <Select label="Em função de (x)" options={xFor.length ? xFor : role.measures.filter((c) => c !== y)} value={x} onChange={setX} />
            <Select label="Cor" options={[NO_COLOR, ...role.categorical]} value={color ?? NO_COLOR} onChange={setColor} />
          </div>
          <XYChart series={series} xLabel={axis(x)} yLabel={axis(y)} height={420} label={chartNote} />
        </Section>
      ) : group ? (
        <Section title={`Registros por ${group}`} kind="chart" icon={IconScatter} tag="contagem" caption="Este estudo não tem medidas numéricas: o gráfico conta registros, não compara resultados.">
          {role.categorical.length > 1 && (
            <div className="controls">
              <Select label="Contar registros por" options={role.categorical} value={group} onChange={setGroup} />
            </div>
          )}
          <BarList items={counts} label={chartNote} />
        </Section>
      ) : null}

      <Section title="Dados aferidos" kind="table" icon={IconChecklist} tag={`${columns.length} colunas`} caption="O que cada coluna é, e de onde saiu essa interpretação. Inferências da IA só entram depois de confirmadas." flush>
        <DataTable
          rows={measured}
          filename={`${table}_colunas`}
          config={{ coluna: 'Coluna', natureza: 'Natureza', unidade: 'Unidade', descricao: { label: 'Descrição', wide: true }, origem: 'Cabeçalho na fonte', confirmado: 'Confirmado', evidencia: { label: 'De onde saiu', wide: true } }}
        />
      </Section>

      <Section title="Registros" kind="table" icon={IconDatabase} tag={table} flush>
        <DataTable rows={view} columns={frame.columns} filename={table} hide={PROVENANCE.filter((c) => c !== 'linha_fonte')} />
      </Section>

      {sugestoes && (
        <Expander title={`Comparações sugeridas pela IA (${sugestoes.rows.length})`} icon={IconCompare}>
          <Caption>Sugestões gravadas com o estudo, ainda não verificadas pelas regras de compatibilidade.</Caption>
          <DataTable rows={sugestoes.rows} columns={sugestoes.columns} filename={`${id}_sugestoes`} />
        </Expander>
      )}
      <AlertsTable alerts={alertas} />
    </>
  )
}
