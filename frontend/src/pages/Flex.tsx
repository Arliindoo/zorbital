import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, useMemo, useState } from 'react'
import { queries } from '@/api/client'
import { useScreen } from '@/assistant/store'
import { scatterBy } from '@/charts/build'
import { DOMAIN_ORDER } from '@/charts/colors'
import { XYChart } from '@/charts/XYChart'
import { DataTable } from '@/components/DataTable'
import { CheckboxGroup, RangeFilter } from '@/components/filters'
import { AlertsTable, InvestigationHeader } from '@/components/investigation'
import { SidebarFilters } from '@/components/Layout'
import { SimFrame, ViewSwitch } from '@/components/StudyView'
import { Callout, Columns, Metric, Metrics, Section } from '@/components/ui'
import { IconDrop, IconScatter } from '@/icons'
import { extent, inRangeOrNull, omit, type Range, uniqueSorted } from '@/lib/data'
import { span } from '@/lib/format'
import { usePageState } from '@/lib/usePageState'
import { useStudyView } from '@/lib/useStudyView'

const LABELS: Record<string, string> = {
  teste_id: 'Ensaio',
  identificador: 'Identificador',
  helio_fracao: 'Hélio (fração)',
  diametro_inicial_mm: 'Diâmetro inicial da gota (mm)',
  diametro_extincao_visivel_mm: 'Diâmetro na extinção visível (mm)',
  oxigenio_fracao: 'Oxigênio (fração molar)',
  pressao_mmhg: 'Pressão (mmHg)',
  desfecho: 'Desfecho',
}
const HOVER = ['teste_id', 'identificador', 'oxigenio_fracao', 'pressao_mmhg', 'helio_fracao']

// a cena 3D só é baixada quando alguém abre a vista de simulação
const FlexSim = lazy(() => import('@/sim/views/FlexSim'))

export default function Flex() {
  const { data } = useSuspenseQuery(queries.flex())
  const { investigacao: inv, ensaios, alertas } = data
  const rows = ensaios.rows

  const fuels = useMemo(() => uniqueSorted(rows.map((r) => r.combustivel)), [rows])
  const pressureBounds = useMemo(() => extent(rows.map((r) => r.pressao_mmhg)), [rows])
  const oxygenBounds = useMemo(() => extent(rows.map((r) => r.oxigenio_fracao)), [rows])
  const [outcomes, setOutcomes] = usePageState<string[]>('flex:desfecho', [...DOMAIN_ORDER.desfecho])
  const [fuel, setFuel] = usePageState<string[]>('flex:combustivel', fuels)
  const [pressure, setPressure] = usePageState<Range | null>('flex:pressao', pressureBounds)
  const [oxygen, setOxygen] = usePageState<Range | null>('flex:o2', oxygenBounds)
  const [mode, setMode] = useStudyView()
  const [simText, setSimText] = useState('')

  const view = useMemo(
    () =>
      rows.filter(
        (r) =>
          outcomes.includes(r.desfecho) &&
          fuel.includes(r.combustivel) &&
          inRangeOrNull(r.pressao_mmhg, pressure) &&
          inRangeOrNull(r.oxigenio_fracao, oxygen),
      ),
    [rows, outcomes, fuel, pressure, oxygen],
  )
  const withExt = useMemo(
    () => view.filter((r) => r.diametro_inicial_mm !== null && r.diametro_extincao_visivel_mm !== null),
    [view],
  )
  const missing = view.length - withExt.length
  const conditions = useMemo(
    () => scatterBy(view, { x: 'oxigenio_fracao', y: 'pressao_mmhg', color: 'desfecho', labels: LABELS, hover: HOVER }),
    [view],
  )
  const sizes = useMemo(
    () =>
      scatterBy(withExt, {
        x: 'diametro_inicial_mm',
        y: 'diametro_extincao_visivel_mm',
        color: 'desfecho',
        labels: LABELS,
        hover: HOVER,
      }),
    [withExt],
  )

  useScreen({
    pagina: 'flex',
    titulo: inv.nome,
    investigacao: 'PSI-69',
    filtros: { desfecho: outcomes, combustível: fuel, 'pressão (mmHg)': pressure, 'oxigênio (fração)': oxygen },
    graficos:
      mode === 'simulacao'
        ? [simText]
        : [
            'Condições testadas: dispersão oxigênio (x) × pressão (y), um ponto por ensaio, cor por desfecho.',
            `Tamanho da gota: diâmetro inicial (x) × diâmetro na extinção visível (y), cor por desfecho; ${missing} ensaio(s) fora por diâmetro ausente.`,
          ],
    dados: omit(view, ['fonte_arquivo']),
    tabela_banco: 'flex_ensaios',
  })

  const dashboard = (
    <>
      <Metrics>
        <Metric label="Ensaios no filtro" value={view.length} />
        <Metric label="Extinções" value={view.filter((r) => r.desfecho === 'Extinção').length} accent="var(--s1)" />
        <Metric label="O2 (fração molar)" value={view.length ? span(extent(view.map((r) => r.oxigenio_fracao))) : '—'} />
        <Metric label="Pressão (mmHg)" value={view.length ? span(extent(view.map((r) => r.pressao_mmhg)), 0) : '—'} />
      </Metrics>

      {view.length === 0 ? (
        <Callout>Nenhum ensaio com esses filtros.</Callout>
      ) : (
        <>
          <Columns>
            <Section
              kind="chart"
              icon={IconScatter}
              tag={`${view.length} ensaios`}
              title="Condições testadas"
              caption="Cada ponto é um ensaio. Veja onde as condições se concentram antes de comparar desfechos."
            >
              <XYChart
                series={conditions}
                xLabel="Oxigênio (fração molar)"
                yLabel="Pressão (mmHg)"
                label="Dispersão de oxigênio por pressão, um ponto por ensaio, cor por desfecho"
              />
            </Section>
            <Section
              kind="chart"
              icon={IconDrop}
              tag={`${withExt.length} ensaios`}
              title="Tamanho da gota: início × extinção"
              caption={
                'Só ensaios com os dois diâmetros registrados' +
                (missing ? `; ${missing} ficaram de fora por diâmetro ausente na fonte.` : '.')
              }
            >
              <XYChart
                series={sizes}
                xLabel="Diâmetro inicial (mm)"
                yLabel="Diâmetro na extinção visível (mm)"
                label="Diâmetro inicial por diâmetro na extinção visível, cor por desfecho"
              />
            </Section>
          </Columns>

          <Section title="Ensaios" kind="table" tag="flex_ensaios" flush>
            <DataTable
              rows={view}
              columns={ensaios.columns}
              hide={['fonte_arquivo', 'desfecho_original']}
              filename="flex_ensaios"
              config={{
                gas_co_rotulo_ambiguo_fracao: {
                  label: '"CO" (rótulo ambíguo)',
                  help: 'O cabeçalho da fonte perdeu o subscrito do gás. Não é necessariamente CO2.',
                },
                taxa_queima_valor: {
                  label: 'Taxa de queima',
                  help: "Rótulo da fonte: 'Burning rate; mm'. Unidade a conferir no relatório.",
                },
              }}
            />
          </Section>
        </>
      )}
      <AlertsTable alerts={alertas} />
    </>
  )

  return (
    <>
      <InvestigationHeader inv={inv} rows={rows.length} compact={mode === 'simulacao'}>
        <ViewSwitch view={mode} onChange={setMode} />
      </InvestigationHeader>
      <SidebarFilters title="Filtros">
        <CheckboxGroup label="Desfecho" options={DOMAIN_ORDER.desfecho} value={outcomes} onChange={setOutcomes} />
        <CheckboxGroup label="Combustível" options={fuels} value={fuel} onChange={setFuel} />
        <RangeFilter label="Pressão (mmHg)" bounds={pressureBounds} value={pressure} onChange={setPressure} digits={0} />
        <RangeFilter label="Oxigênio (fração molar)" bounds={oxygenBounds} value={oxygen} onChange={setOxygen} digits={2} />
      </SidebarFilters>

      {mode === 'simulacao' ? (
        <SimFrame>
          <FlexSim rows={view} onReport={setSimText} />
        </SimFrame>
      ) : (
        dashboard
      )}
    </>
  )
}
