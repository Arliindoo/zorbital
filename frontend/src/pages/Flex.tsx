import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, useMemo, useState } from 'react'
import { queries } from '@/shared/api/client'
import { useScreen } from '@/features/assistant/store'
import { scatterBy } from '@/shared/charts/build'
import { DOMAIN_ORDER } from '@/shared/charts/colors'
import { XYChart } from '@/shared/charts/XYChart'
import { DataTable } from '@/shared/ui/DataTable'
import { CheckboxGroup, RangeFilter } from '@/shared/ui/filters'
import { AlertsTable, InvestigationHeader } from '@/features/studies/components/investigation'
import { SidebarFilters } from '@/app/Layout'
import { SimFrame, ViewSwitch } from '@/features/studies/components/StudyView'
import { Callout, Columns, Metric, Metrics, Section } from '@/shared/ui/ui'
import { IconDrop, IconScatter } from '@/shared/icons/index'
import { extent, inRangeOrNull, omit, type Range, uniqueSorted } from '@/shared/lib/data'
import { span } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { usePageState } from '@/shared/lib/usePageState'
import { useStudyView } from '@/features/studies/useStudyView'

const LABELS: Record<string, string> = t(
  {
    teste_id: 'Test',
    identificador: 'Identifier',
    helio_fracao: 'Helium (fraction)',
    diametro_inicial_mm: 'Initial droplet diameter (mm)',
    diametro_extincao_visivel_mm: 'Diameter at visible extinction (mm)',
    oxigenio_fracao: 'Oxygen (mole fraction)',
    pressao_mmhg: 'Pressure (mmHg)',
    desfecho: 'Outcome',
  },
  {
    teste_id: 'Ensaio',
    identificador: 'Identificador',
    helio_fracao: 'Hélio (fração)',
    diametro_inicial_mm: 'Diâmetro inicial da gota (mm)',
    diametro_extincao_visivel_mm: 'Diâmetro na extinção visível (mm)',
    oxigenio_fracao: 'Oxigênio (fração molar)',
    pressao_mmhg: 'Pressão (mmHg)',
    desfecho: 'Desfecho',
  },
)
const HOVER = ['teste_id', 'identificador', 'oxigenio_fracao', 'pressao_mmhg', 'helio_fracao']

// a cena 3D só é baixada quando alguém abre a vista de simulação
const FlexSim = lazy(() => import('@/visualization/views/FlexSim'))

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
    filtros: {
      [t('outcome', 'desfecho')]: outcomes,
      [t('fuel', 'combustível')]: fuel,
      [t('pressure (mmHg)', 'pressão (mmHg)')]: pressure,
      [t('oxygen (fraction)', 'oxigênio (fração)')]: oxygen,
    },
    graficos:
      mode === 'simulacao'
        ? [simText]
        : [
            t(
              'Conditions tested: scatter of oxygen (x) × pressure (y), one point per test, colored by outcome.',
              'Condições testadas: dispersão oxigênio (x) × pressão (y), um ponto por ensaio, cor por desfecho.',
            ),
            t(
              `Droplet size: initial diameter (x) × diameter at visible extinction (y), colored by outcome; ${missing} test(s) left out because of a missing diameter.`,
              `Tamanho da gota: diâmetro inicial (x) × diâmetro na extinção visível (y), cor por desfecho; ${missing} ensaio(s) fora por diâmetro ausente.`,
            ),
          ],
    dados: omit(view, ['fonte_arquivo']),
    tabela_banco: 'flex_ensaios',
  })

  const dashboard = (
    <>
      <Metrics>
        <Metric label={t('Tests in filter', 'Ensaios no filtro')} value={view.length} />
        <Metric label={t('Extinctions', 'Extinções')} value={view.filter((r) => r.desfecho === 'Extinção').length} accent="var(--s1)" />
        <Metric label={t('O2 (mole fraction)', 'O2 (fração molar)')} value={view.length ? span(extent(view.map((r) => r.oxigenio_fracao))) : '—'} />
        <Metric label={t('Pressure (mmHg)', 'Pressão (mmHg)')} value={view.length ? span(extent(view.map((r) => r.pressao_mmhg)), 0) : '—'} />
      </Metrics>

      {view.length === 0 ? (
        <Callout>{t('No tests match these filters.', 'Nenhum ensaio com esses filtros.')}</Callout>
      ) : (
        <>
          <Columns>
            <Section
              kind="chart"
              icon={IconScatter}
              tag={t(`${view.length} tests`, `${view.length} ensaios`)}
              title={t('Conditions tested', 'Condições testadas')}
              caption={t('Each point is a test. See where the conditions cluster before comparing outcomes.', 'Cada ponto é um ensaio. Veja onde as condições se concentram antes de comparar desfechos.')}
            >
              <XYChart
                series={conditions}
                xLabel={t('Oxygen (mole fraction)', 'Oxigênio (fração molar)')}
                yLabel={t('Pressure (mmHg)', 'Pressão (mmHg)')}
                label={t('Scatter of oxygen by pressure, one point per test, colored by outcome', 'Dispersão de oxigênio por pressão, um ponto por ensaio, cor por desfecho')}
              />
            </Section>
            <Section
              kind="chart"
              icon={IconDrop}
              tag={t(`${withExt.length} tests`, `${withExt.length} ensaios`)}
              title={t('Droplet size: start × extinction', 'Tamanho da gota: início × extinção')}
              caption={t(
                'Only tests with both diameters recorded' +
                  (missing ? `; ${missing} left out because the diameter is missing in the source.` : '.'),
                'Só ensaios com os dois diâmetros registrados' +
                  (missing ? `; ${missing} ficaram de fora por diâmetro ausente na fonte.` : '.'),
              )}
            >
              <XYChart
                series={sizes}
                xLabel={t('Initial diameter (mm)', 'Diâmetro inicial (mm)')}
                yLabel={t('Diameter at visible extinction (mm)', 'Diâmetro na extinção visível (mm)')}
                label={t('Initial diameter by diameter at visible extinction, colored by outcome', 'Diâmetro inicial por diâmetro na extinção visível, cor por desfecho')}
              />
            </Section>
          </Columns>

          <Section title={t('Tests', 'Ensaios')} kind="table" tag="flex_ensaios" flush>
            <DataTable
              rows={view}
              columns={ensaios.columns}
              hide={['fonte_arquivo', 'desfecho_original']}
              filename="flex_ensaios"
              config={{
                gas_co_rotulo_ambiguo_fracao: {
                  label: t('"CO" (ambiguous label)', '"CO" (rótulo ambíguo)'),
                  help: t('The source header lost the gas subscript. It is not necessarily CO2.', 'O cabeçalho da fonte perdeu o subscrito do gás. Não é necessariamente CO2.'),
                },
                taxa_queima_valor: {
                  label: t('Burning rate', 'Taxa de queima'),
                  help: t("Source label: 'Burning rate; mm'. Unit to be checked in the report.", "Rótulo da fonte: 'Burning rate; mm'. Unidade a conferir no relatório."),
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
      <SidebarFilters title={t('Filters', 'Filtros')}>
        <CheckboxGroup label={t('Outcome', 'Desfecho')} options={DOMAIN_ORDER.desfecho} value={outcomes} onChange={setOutcomes} />
        <CheckboxGroup label={t('Fuel', 'Combustível')} options={fuels} value={fuel} onChange={setFuel} />
        <RangeFilter label={t('Pressure (mmHg)', 'Pressão (mmHg)')} bounds={pressureBounds} value={pressure} onChange={setPressure} digits={0} />
        <RangeFilter label={t('Oxygen (mole fraction)', 'Oxigênio (fração molar)')} bounds={oxygenBounds} value={oxygen} onChange={setOxygen} digits={2} />
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
