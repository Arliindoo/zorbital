import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { postFile, queries } from '@/api/client'
import type { Dataset } from '@/api/types'
import { useScreen } from '@/assistant/store'
import { comparisonSeries } from '@/charts/build'
import { assignSlots, MAX_SERIES } from '@/charts/colors'
import { XYChart } from '@/charts/XYChart'
import { DataTable } from '@/components/DataTable'
import { MultiSelect, Select } from '@/components/filters'
import { SidebarFilters } from '@/components/Layout'
import { Loading } from '@/components/Loading'
import { PageHeader } from '@/components/PageHeader'
import { Callout, Expander, Section } from '@/components/ui'
import { IconClose, IconExplore, IconUpload } from '@/icons'
import { uniqueSorted } from '@/lib/data'
import { AGGREGATIONS, type Aggregation, categoryColumns, compare, isOrdered, numericColumns, summarize } from '@/lib/explore'

const EXAMPLE = 'Exemplo Gapminder'
const AGG_NAMES = Object.keys(AGGREGATIONS) as Aggregation[]

/** Escolhas da comparação; quando a tabela muda, valores que não existem mais caem no padrão. */
function Comparison({ data, sourceName, isUpload, tableName }: { data: Dataset; sourceName: string; isUpload: boolean; tableName: string }) {
  const categories = useMemo(() => categoryColumns(data), [data])
  const numbers = useMemo(() => numericColumns(data), [data])

  const [byChoice, setBy] = useState<string>()
  const by = byChoice && categories.includes(byChoice) ? byChoice : categories[0]!
  const values = useMemo(() => uniqueSorted(data.rows.map((r) => r[by] ?? null)).map(String), [data, by])
  const [entitiesChoice, setEntities] = useState<Record<string, string[]>>({})
  const entities = useMemo(() => entitiesChoice[by] ?? values.slice(0, 3), [entitiesChoice, by, values])

  const xOptions = data.columns.map((c) => c.name).filter((c) => c !== by)
  // Por padrão, a primeira coluna que dá uma linha (tempo ou número).
  const [xChoice, setX] = useState<string>()
  const x = xChoice && xOptions.includes(xChoice) ? xChoice : (xOptions.find((c) => isOrdered(data, c)) ?? xOptions[0]!)
  const measures = numbers.filter((c) => c !== x)
  const [measureChoice, setMeasure] = useState<string>()
  const measure = measureChoice && measures.includes(measureChoice) ? measureChoice : measures[0]
  const [agg, setAgg] = useState<Aggregation>('média')

  // A cor acompanha a entidade entre mudanças de filtro: tirar uma série não repinta as que ficaram.
  const [slotMemory, setSlotMemory] = useState<Record<string, Record<string, number>>>({})
  const slots = useMemo(() => assignSlots(entities, slotMemory[by] ?? {}), [entities, slotMemory, by])
  const chooseEntities = (next: string[]) => {
    setEntities((all) => ({ ...all, [by]: next }))
    setSlotMemory((memory) => ({ ...memory, [by]: assignSlots(next, slots) }))
  }

  const ordered = isOrdered(data, x)
  const table = useMemo(
    () => (measure ? compare(data.rows, { by, entities, x, measure, agg }) : []),
    [data, by, entities, x, measure, agg],
  )
  const summary = useMemo(() => (measure ? summarize(table, { by, x, measure }) : []), [table, by, x, measure])
  const figure = useMemo(
    () => (measure ? comparisonSeries(table, { x, measure, by, slots, ordered }) : null),
    [table, x, measure, by, slots, ordered],
  )
  const title = measure ? `${agg[0]!.toUpperCase()}${agg.slice(1)} de ${measure} por ${x}` : ''

  useScreen({
    pagina: 'explore',
    titulo: 'Explorar',
    filtros: { tabela: sourceName, 'comparar por': by, séries: entities, 'eixo X': x, medida: measure ?? null, agregação: agg },
    graficos: measure ? [`${title}, uma série por valor de ${by}.`] : [],
    dados: table,
    tabela_banco: isUpload ? null : tableName,
  })

  return (
    <>
      <SidebarFilters title="Comparação">
        <Select label="Comparar por" options={categories} value={by} onChange={setBy} />
        <MultiSelect
          label={`Séries (até ${MAX_SERIES})`}
          options={values}
          value={entities}
          max={MAX_SERIES}
          onChange={chooseEntities}
        />
        <Select label="Eixo X" options={xOptions} value={x} onChange={setX} />
        {measure && <Select label="Medida" options={measures} value={measure} onChange={setMeasure} />}
        <Select label="Agregação" options={AGG_NAMES} value={agg} onChange={setAgg} />
      </SidebarFilters>

      {!measure ? (
        <Callout tone="warning">Não sobrou coluna numérica para medir: escolha outro eixo X.</Callout>
      ) : !entities.length ? (
        <Callout>Escolha ao menos uma série na barra lateral.</Callout>
      ) : (
        <Section title={title} kind="chart" icon={IconExplore} tag={ordered ? 'linhas' : 'barras'}>
          {figure && <XYChart series={figure} xLabel={x} yLabel={measure} zeroY={!ordered} height={440} label={`${title}, uma série por valor de ${by}`} />}
          <Expander title="Ver como tabela">
            <DataTable rows={summary} filename="resumo" />
            <DataTable rows={table} filename="comparacao" />
          </Expander>
        </Section>
      )}
    </>
  )
}

/** Sem comparação na tela, o assistente ainda sabe qual tabela está aberta. */
function BareScreen({ table, dbTable }: { table: string; dbTable: string | null }) {
  useScreen({ pagina: 'explore', titulo: 'Explorar', filtros: { tabela: table }, tabela_banco: dbTable })
  return null
}

export default function Explore() {
  const sources = useQuery(queries.exploreSources())
  const [source, setSource] = useState<string>()
  const [file, setFile] = useState<{ name: string; data: Dataset } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const name = source ?? sources.data?.[0] ?? EXAMPLE
  const table = useQuery({ ...queries.exploreSource(name), enabled: !file && sources.isSuccess })
  const upload = useMutation({
    mutationFn: (f: File) => postFile<Dataset>('/api/explore/upload', f),
    onSuccess: (data, f) => setFile({ name: f.name, data }),
  })

  const data = file?.data ?? table.data
  const shownName = file?.name ?? name
  const comparable = data && categoryColumns(data).length > 0 && numericColumns(data).length > 0

  return (
    <>
      <SidebarFilters title="Dados">
        {sources.data && (
          <Select
            label="Tabela"
            options={sources.data}
            value={name}
            onChange={(v) => {
              setSource(v)
              setFile(null)
            }}
          />
        )}
        <div className="field">
          <span className="field__label">…ou envie um CSV/Parquet</span>
          <input
            ref={input}
            type="file"
            accept=".csv,.parquet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload.mutate(f)
              e.target.value = ''
            }}
          />
          {file ? (
            <span className="chip">
              {file.name}
              <button type="button" aria-label="Voltar para a tabela do banco" onClick={() => setFile(null)}>
                <IconClose size={13} />
              </button>
            </span>
          ) : (
            <button type="button" className="button" onClick={() => input.current?.click()} disabled={upload.isPending}>
              <IconUpload size={14} /> {upload.isPending ? 'Enviando…' : 'Escolher arquivo'}
            </button>
          )}
        </div>
      </SidebarFilters>

      <PageHeader eyebrow={['Ferramenta', data ? shownName : 'Explorador livre']} title="Explorar">
        {data
          ? `${data.rows.length.toLocaleString('pt-BR')} linhas · ${data.columns.length} colunas. Escolha o que comparar, o eixo e a medida no painel de filtros.`
          : 'Compare séries de qualquer tabela do banco, ou envie um CSV/Parquet.'}
      </PageHeader>

      {upload.isError && <Callout tone="error">{upload.error.message}</Callout>}
      {sources.isError && <Callout tone="error">{sources.error.message}</Callout>}
      {table.isError && !file && <Callout tone="error">{table.error.message}</Callout>}
      {!comparable && <BareScreen table={shownName} dbTable={file ? null : name} />}
      {!data ? (
        (sources.isPending || table.isPending) && <Loading label="Carregando dados…" />
      ) : comparable ? (
        <Comparison key={shownName} data={data} sourceName={shownName} isUpload={!!file} tableName={name} />
      ) : (
        <>
          <Callout tone="warning">
            Para comparar, a tabela precisa de uma coluna de texto (o que comparar) e uma numérica (a medida).
          </Callout>
          <Section title={shownName} kind="table" tag={`${data.rows.length} linhas`} flush>
            <DataTable rows={data.rows} columns={data.columns} filename={shownName} />
          </Section>
        </>
      )}
    </>
  )
}
