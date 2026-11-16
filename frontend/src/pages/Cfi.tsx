import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, useMemo, useState } from 'react'
import { queries } from '@/shared/api/client'
import { useScreen } from '@/features/assistant/store'
import { scatterBy } from '@/shared/charts/build'
import { DOMAIN_ORDER } from '@/shared/charts/colors'
import { Heatmap } from '@/shared/charts/Heatmap'
import { Ridge } from '@/shared/charts/Ridge'
import { XYChart } from '@/shared/charts/XYChart'
import { DataTable } from '@/shared/ui/DataTable'
import { CheckboxGroup, RangeFilter, Toggle } from '@/shared/ui/filters'
import { AlertsTable, InvestigationHeader } from '@/features/studies/components/investigation'
import { SidebarFilters } from '@/app/Layout'
import { SimFrame, ViewSwitch } from '@/features/studies/components/StudyView'
import { Callout, Expander, Grid, Metric, Metrics, Section } from '@/shared/ui/ui'
import { IconDrop, IconFlame, IconPulse, IconScan } from '@/shared/icons/index'
import { extent, groupBy, inRangeOrNull, omit, type Range, uniqueSorted } from '@/shared/lib/data'
import { flamesLong } from '@/shared/lib/flames'
import { g } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { usePageState } from '@/shared/lib/usePageState'
import { useStudyView } from '@/features/studies/useStudyView'

const LABELS: Record<string, string> = t(
  {
    teste_id: 'Test',
    pressao_atm: 'Pressure (atm)',
    dext_mm: 'Extinction diameter (mm)',
    tipo_chama: 'Flame',
    d0_mm: 'D0 (mm)',
    dext_quente_mm: 'Hot-flame extinction (mm)',
    combustivel: 'Fuel',
  },
  {
    teste_id: 'Ensaio',
    pressao_atm: 'Pressão (atm)',
    dext_mm: 'Diâmetro de extinção (mm)',
    tipo_chama: 'Chama',
    d0_mm: 'D0 (mm)',
    dext_quente_mm: 'Extinção da chama quente (mm)',
    combustivel: 'Combustível',
  },
)

// a cena 3D só é baixada quando alguém abre a vista de simulação
const CfiSim = lazy(() => import('@/visualization/views/CfiSim'))

export default function Cfi() {
  const { data } = useSuspenseQuery(queries.cfi())
  const { investigacao: inv, ensaios, resumo, cameras, alertas } = data
  const rows = ensaios.rows

  const fuels = useMemo(() => {
    const present = new Set(rows.map((r) => r.combustivel))
    return DOMAIN_ORDER.combustivel.filter((f) => present.has(f))
  }, [rows])
  const diluents = useMemo(() => uniqueSorted(rows.map((r) => r.diluente)), [rows])
  const pressures = useMemo(() => uniqueSorted(rows.map((r) => r.pressao_atm)), [rows])
  const d0Bounds = useMemo(() => extent(rows.map((r) => r.d0_mm)), [rows])

  const [fuel, setFuel] = usePageState<string[]>('cfi:combustivel', fuels.slice(0, 1))
  const [diluent, setDiluent] = usePageState<string[]>('cfi:diluente', diluents)
  const [pressure, setPressure] = usePageState<number[]>('cfi:pressao', pressures)
  const [d0, setD0] = usePageState<Range | null>('cfi:d0', d0Bounds)
  const [complete, setComplete] = usePageState('cfi:completa', false)
  const [mode, setMode] = useStudyView()
  const [simText, setSimText] = useState('')

  const view = useMemo(
    () =>
      rows.filter(
        (r) =>
          fuel.includes(r.combustivel) &&
          diluent.includes(r.diluente) &&
          r.pressao_atm !== null &&
          pressure.includes(r.pressao_atm) &&
          inRangeOrNull(r.d0_mm, d0) &&
          (!complete || r.analise_completa === true),
      ),
    [rows, fuel, diluent, pressure, d0, complete],
  )

  const byPressure = useMemo(
    () => scatterBy(flamesLong(view, ['teste_id', 'pressao_atm', 'd0_mm', 'combustivel']), {
      x: 'pressao_atm',
      y: 'dext_mm',
      color: 'tipo_chama',
      labels: LABELS,
      hover: ['teste_id', 'd0_mm', 'combustivel'],
    }),
    [view],
  )
  const bySize = useMemo(
    () =>
      scatterBy(
        view.filter((r) => r.d0_mm !== null && r.dext_quente_mm !== null),
        { x: 'd0_mm', y: 'dext_quente_mm', color: 'combustivel', labels: LABELS, hover: ['teste_id', 'pressao_atm'] },
      ),
    [view],
  )
  // distribuição da extinção quente em cada pressão (só pressões com ensaios suficientes para uma curva)
  const ridges = useMemo(
    () =>
      [...groupBy(view.filter((r) => r.dext_quente_mm !== null), (r) => r.pressao_atm as number).entries()]
        .filter(([, list]) => list.length >= 4)
        .sort((a, b) => a[0] - b[0])
        .map(([p, list]) => ({ name: `${g(p)} atm`, values: list.map((r) => r.dext_quente_mm as number) })),
    [view],
  )
  const matrix = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of view) counts.set(`${r.combustivel}|${g(r.pressao_atm)}`, (counts.get(`${r.combustivel}|${g(r.pressao_atm)}`) ?? 0) + 1)
    return {
      rows: fuels.filter((f) => view.some((r) => r.combustivel === f)),
      cols: uniqueSorted(view.map((r) => r.pressao_atm)).map((p) => g(p)),
      counts,
    }
  }, [view, fuels])
  const summary = useMemo(
    () =>
      resumo.rows.filter(
        (r) =>
          fuel.includes(r.combustivel as string) &&
          diluent.includes(r.diluente as string) &&
          pressure.includes(r.pressao_atm as number),
      ),
    [resumo, fuel, diluent, pressure],
  )

  useScreen({
    pagina: 'cfi',
    titulo: inv.nome,
    investigacao: 'PSI-39',
    filtros: {
      [t('fuel', 'combustível')]: fuel,
      [t('diluent', 'diluente')]: diluent,
      [t('pressure (atm)', 'pressão (atm)')]: pressure,
      'D0 (mm)': d0,
      [t('completed analysis only', 'só análise concluída')]: complete,
    },
    graficos:
      mode === 'simulacao'
        ? [simText]
        : [
            t(
              'Extinction by pressure: one point per test, pressure (x) × extinction diameter (y), colored by flame type (blue = cool, orange = hot).',
              'Extinção por pressão: um ponto por ensaio, pressão (x) × diâmetro de extinção (y), cor por tipo de chama (azul = fria, laranja = quente).',
            ),
            t(
              'Initial size × hot-flame extinction: D0 (x) × hot Dext (y), colored by fuel.',
              'Tamanho inicial × extinção da chama quente: D0 (x) × Dext quente (y), cor por combustível.',
            ),
            t(
              'Distribution of hot-flame extinction by pressure: one density curve per pressure.',
              'Distribuição da extinção quente por pressão: uma curva de densidade por pressão.',
            ),
            t(
              'Coverage: fuel × pressure matrix with the number of tests in each condition.',
              'Cobertura: matriz combustível × pressão com o número de ensaios em cada condição.',
            ),
          ],
    dados: omit(view, ['fonte_arquivo', 'comentario']),
    tabela_banco: 'cfi_ensaios',
  })

  const dashboard = (
    <>
      <Metrics>
        <Metric label={t('Tests in filter', 'Ensaios no filtro')} value={view.length} />
        <Metric label={t('With hot-flame extinction', 'Com extinção da chama quente')} value={view.filter((r) => r.dext_quente_mm !== null).length} accent="var(--s3)" />
        <Metric label={t('With cool-flame extinction', 'Com extinção da chama fria')} value={view.filter((r) => r.dext_fria_mm !== null).length} accent="var(--s4)" />
        <Metric
          label={t('Cool flame without visible extinction', 'Chama fria sem extinção visível')}
          value={view.filter((r) => r.dext_fria_zero_na_fonte === true).length}
          help={t('Zero in the source: the droplet was consumed by the cool flame without visible extinction.', 'Zero na fonte: a gota foi consumida pela chama fria sem extinção visível.')}
        />
      </Metrics>

      {view.length === 0 ? (
        <Callout>{t('No tests match these filters.', 'Nenhum ensaio com esses filtros.')}</Callout>
      ) : (
        <>
          <Grid>
            <Section
              span={6}
              kind="chart"
              icon={IconFlame}
              tag={t('one point per test', 'um ponto por ensaio')}
              title={t('Extinction by pressure', 'Extinção por pressão')}
              caption={t('Each point is a test. Tests without visible cool-flame extinction are not shown.', 'Cada ponto é um ensaio. Ensaios sem extinção visível da chama fria não aparecem.')}
            >
              <XYChart series={byPressure} xLabel={t('Pressure (atm)', 'Pressão (atm)')} yLabel={t('Extinction diameter (mm)', 'Diâmetro de extinção (mm)')} label={t('Extinction diameter by pressure, colored by flame type', 'Diâmetro de extinção por pressão, cor por tipo de chama')} />
            </Section>
            <Section
              span={6}
              kind="chart"
              icon={IconDrop}
              tag={t('scatter', 'dispersão')}
              title={t('Initial size × hot-flame extinction', 'Tamanho inicial × extinção da chama quente')}
              caption={t('The extinction diameter grows with the initial droplet: compare pressures with similar D0.', 'O diâmetro de extinção cresce com a gota inicial: compare pressões com D0 parecido.')}
            >
              <XYChart series={bySize} xLabel="D0 (mm)" yLabel={t('Hot-flame extinction (mm)', 'Extinção da chama quente (mm)')} label={t('D0 by hot-flame extinction diameter, colored by fuel', 'D0 por diâmetro de extinção da chama quente, cor por combustível')} />
            </Section>
            {ridges.length > 1 && (
              <Section
                span={7}
                spanMd={12}
                kind="chart"
                icon={IconPulse}
                tag={t('density', 'densidade')}
                title={t('How hot-flame extinction is distributed at each pressure', 'Como a extinção quente se distribui em cada pressão')}
                caption={t('One curve per pressure (with 4 or more tests in the filter). The shape shows where the tests cluster; it is not a fitted trend.', 'Uma curva por pressão (com 4 ensaios ou mais no filtro). A forma mostra onde os ensaios se concentram; não é uma tendência ajustada.')}
              >
                <Ridge groups={ridges} xLabel={t('Hot-flame extinction (mm)', 'Extinção da chama quente (mm)')} height={Math.max(260, ridges.length * 46 + 90)} label={t('Distribution of the hot-flame extinction diameter by pressure', 'Distribuição do diâmetro de extinção da chama quente por pressão')} />
              </Section>
            )}
            <Section
              span={ridges.length > 1 ? 5 : 12}
              spanMd={12}
              kind="chart"
              icon={IconScan}
              tag={t('tests', 'ensaios')}
              title={t('Coverage: fuel × pressure', 'Cobertura: combustível × pressão')}
              caption={t('How many tests there are in each condition. Dashed cells were not tested.', 'Quantos ensaios há em cada condição. Células tracejadas não foram ensaiadas.')}
            >
              <Heatmap
                rows={matrix.rows}
                cols={matrix.cols}
                value={(row, col) => matrix.counts.get(`${row}|${col}`) ?? null}
                unit={t('Tests', 'Ensaios')}
                height={Math.max(180, matrix.rows.length * 46 + 44)}
                label={t('Number of tests by fuel and pressure', 'Número de ensaios por combustível e pressão')}
              />
            </Section>
          </Grid>

          <Section title={t('Summary by condition', 'Resumo por condição')} kind="table" tag="cfi_por_pressao" flush>
            <DataTable rows={summary} columns={resumo.columns} filename="cfi_por_pressao" />
          </Section>

          <Section title={t('Tests', 'Ensaios')} kind="table" tag="cfi_ensaios" flush>
            <DataTable
              rows={view}
              columns={ensaios.columns}
              hide={['fonte_arquivo']}
              filename="cfi_ensaios"
              config={{
                dext_fria_zero_na_fonte: {
                  label: t('Cool flame without visible extinction', 'Chama fria sem extinção visível'),
                  help: t('The source records 0: droplet consumed by the cool flame.', 'A fonte registra 0: gota consumida pela chama fria.'),
                },
                dext_fria_extrapolado: t('Cool-flame Dext extrapolated', 'Dext fria extrapolado'),
                analise_completa: t('Analysis completed', 'Análise concluída'),
                comentario: { label: t('Operator comment', 'Comentário do operador'), wide: true },
              }}
            />
          </Section>
          <Expander title={t('Cameras for each test', 'Câmeras de cada ensaio')}>
            <DataTable rows={cameras.rows} columns={cameras.columns} filename="cfi_cameras" />
          </Expander>
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
        <CheckboxGroup label={t('Fuel', 'Combustível')} options={fuels} value={fuel} onChange={setFuel} />
        <CheckboxGroup label={t('Diluent', 'Diluente')} options={diluents} value={diluent} onChange={setDiluent} />
        <CheckboxGroup label={t('Pressure (atm)', 'Pressão (atm)')} options={pressures} value={pressure} onChange={setPressure} format={g} />
        <RangeFilter label={t('Initial diameter D0 (mm)', 'Diâmetro inicial D0 (mm)')} bounds={d0Bounds} value={d0} onChange={setD0} digits={2} />
        <Toggle label={t('Only tests with completed analysis', 'Só ensaios com análise concluída')} checked={complete} onChange={setComplete} />
      </SidebarFilters>

      {mode === 'simulacao' ? (
        <SimFrame>
          <CfiSim rows={view} cameras={cameras.rows} onReport={setSimText} />
        </SimFrame>
      ) : (
        dashboard
      )}
    </>
  )
}
