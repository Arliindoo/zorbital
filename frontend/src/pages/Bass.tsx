import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, useMemo, useState } from 'react'
import { queries } from '@/shared/api/client'
import { useScreen } from '@/features/assistant/store'
import { BarList } from '@/shared/charts/BarList'
import { scatterBy } from '@/shared/charts/build'
import { DOMAIN_ORDER, domainColors } from '@/shared/charts/colors'
import { Strip } from '@/shared/charts/Strip'
import { XYChart } from '@/shared/charts/XYChart'
import { DataTable } from '@/shared/ui/DataTable'
import { CheckboxGroup, RangeFilter } from '@/shared/ui/filters'
import { AlertsTable, InvestigationHeader } from '@/features/studies/components/investigation'
import { SidebarFilters } from '@/app/Layout'
import { SimFrame, ViewSwitch } from '@/features/studies/components/StudyView'
import { Callout, Grid, Metric, Metrics, Section } from '@/shared/ui/ui'
import { IconLayers, IconPulse, IconScatter } from '@/shared/icons/index'
import { extent, groupBy, inRange, omit, type Range, uniqueSorted } from '@/shared/lib/data'
import { span } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { usePageState } from '@/shared/lib/usePageState'
import { useStudyView } from '@/features/studies/useStudyView'

const LABELS: Record<string, string> = t(
  {
    teste_id: 'Test',
    pesquisador: 'Investigator',
    material_original: 'Material (source)',
    geometria: 'Geometry',
    o2_inicial_pct: 'Initial O2 (% vol)',
    delta_co2_pp: 'ΔCO2 (percentage points)',
    material_categoria: 'Material',
  },
  {
    teste_id: 'Teste',
    pesquisador: 'Pesquisador',
    material_original: 'Material (fonte)',
    geometria: 'Geometria',
    o2_inicial_pct: 'O2 inicial (% vol)',
    delta_co2_pp: 'ΔCO2 (pontos percentuais)',
    material_categoria: 'Material',
  },
)

// a cena 3D só é baixada quando alguém abre a vista de simulação
const BassSim = lazy(() => import('@/visualization/views/BassSim'))

export default function Bass() {
  const { data } = useSuspenseQuery(queries.bass())
  const { investigacao: inv, testes, alertas } = data
  const rows = testes.rows

  const pis = useMemo(() => uniqueSorted(rows.map((r) => r.pesquisador)), [rows])
  const materials = useMemo(() => {
    const present = new Set(rows.map((r) => r.material_categoria))
    return DOMAIN_ORDER.material_categoria.filter((m) => present.has(m))
  }, [rows])
  const shapes = useMemo(() => uniqueSorted(rows.map((r) => r.geometria)), [rows])
  const oxygenBounds = useMemo(() => extent(rows.map((r) => r.o2_inicial_pct)), [rows])

  const [pi, setPi] = usePageState<string[]>('bass:pesquisador', pis)
  const [material, setMaterial] = usePageState<string[]>('bass:material', materials)
  const [shape, setShape] = usePageState<string[]>('bass:geometria', shapes)
  const [oxygen, setOxygen] = usePageState<Range | null>('bass:o2', oxygenBounds)
  const [mode, setMode] = useStudyView()
  const [simText, setSimText] = useState('')

  const view = useMemo(
    () =>
      rows.filter(
        (r) =>
          pi.includes(r.pesquisador) &&
          material.includes(r.material_categoria) &&
          shape.includes(r.geometria) &&
          inRange(r.o2_inicial_pct, oxygen),
      ),
    [rows, pi, material, shape, oxygen],
  )
  const withAlerts = useMemo(() => new Set(alertas.rows.map((a) => a.teste_id)), [alertas])

  const tested = useMemo(() => {
    const colors = domainColors('material_categoria')
    const groups = groupBy(view, (r) => `${r.material_categoria}\u0000${r.geometria}`)
    return [...groups.values()]
      .map((list) => ({
        label: `${list[0]!.material_categoria} · ${list[0]!.geometria}`,
        value: list.length,
        color: colors[list[0]!.material_categoria],
      }))
      .sort((x, y) => y.value - x.value)
  }, [view])
  const co2 = useMemo(
    () =>
      scatterBy(
        view.filter((r) => r.delta_co2_pp !== null),
        {
          x: 'o2_inicial_pct',
          y: 'delta_co2_pp',
          color: 'material_categoria',
          labels: LABELS,
          hover: ['teste_id', 'pesquisador', 'material_original', 'geometria'],
        },
      ),
    [view],
  )
  const oxygenByMaterial = useMemo(() => {
    const colors = domainColors('material_categoria')
    return materials
      .map((name) => ({
        name,
        color: colors[name] ?? 'var(--s1)',
        points: view
          .filter((r) => r.material_categoria === name && r.o2_inicial_pct !== null)
          .map((r) => ({ value: r.o2_inicial_pct as number, title: t(`Test ${r.teste_id}`, `Teste ${r.teste_id}`), tip: [[t('Geometry', 'Geometria'), r.geometria]] as const })),
      }))
      .filter((group) => group.points.length > 0)
  }, [view, materials])
  const combos = new Set(view.map((r) => `${r.material_categoria}\u0000${r.geometria}`)).size

  useScreen({
    pagina: 'bass',
    titulo: inv.nome,
    investigacao: 'PSI-25',
    filtros: {
      [t('investigator', 'pesquisador')]: pi,
      material,
      [t('geometry', 'geometria')]: shape,
      [t('Initial O2 (%)', 'O2 inicial (%)')]: oxygen,
    },
    graficos:
      mode === 'simulacao'
        ? [simText]
        : [
            t(
              'What was tested: horizontal bars with the number of tests per material · geometry.',
              'O que foi testado: barras horizontais com a contagem de testes por material · geometria.',
            ),
            t(
              'At which oxygen level each material was tested: one point per test along initial O2 (x), one band per material, median marked.',
              'Em que oxigênio cada material foi testado: um ponto por teste ao longo do O2 inicial (x), uma faixa por material, mediana marcada.',
            ),
            t(
              'Initial oxygen × CO2 produced: scatter of initial O2 (x) × ΔCO2 in percentage points (y), colored by material. Not a risk ranking.',
              'Oxigênio inicial × CO2 produzido: dispersão O2 inicial (x) × ΔCO2 em pontos percentuais (y), cor por material. Não é ranking de risco.',
            ),
          ],
    dados: omit(view, ['fonte_arquivo']),
    tabela_banco: 'bass_ensaios',
  })

  const dashboard = (
    <>
      <Metrics>
        <Metric label={t('Tests in filter', 'Testes no filtro')} value={view.length} />
        <Metric label={t('Materials × geometries', 'Materiais × geometrias')} value={combos} />
        <Metric label={t('Initial O2 (% vol)', 'O2 inicial (% vol)')} value={view.length ? span(extent(view.map((r) => r.o2_inicial_pct))) : '—'} />
        <Metric label={t('Tests with an alert', 'Testes com alerta')} value={view.filter((r) => withAlerts.has(r.teste_id)).length} />
      </Metrics>

      {view.length === 0 ? (
        <Callout>{t('No tests match these filters.', 'Nenhum teste com esses filtros.')}</Callout>
      ) : (
        <>
          <Grid>
            <Section
              span={5}
              spanMd={12}
              kind="chart"
              icon={IconLayers}
              tag={t('count', 'contagem')}
              title={t('What was tested', 'O que foi testado')}
              caption={t('Tests by material and geometry. A count of tests, not a measure of performance.', 'Testes por material e geometria. Contagem de ensaios, não medida de desempenho.')}
            >
              <BarList items={tested} label={t('Number of tests by material and geometry', 'Contagem de testes por material e geometria')} />
            </Section>
            <Section
              span={7}
              spanMd={12}
              kind="chart"
              icon={IconScatter}
              tag={t('scatter', 'dispersão')}
              title={t('Initial oxygen × CO2 produced', 'Oxigênio inicial × CO2 produzido')}
              caption={t(
                <>
                  ΔCO2 = final − initial in the chamber. It depends on the duration and protocol of each test:{' '}
                  <strong>it is not a risk ranking of the materials</strong>.
                </>,
                <>
                  ΔCO2 = final − inicial na câmara. Depende da duração e do protocolo de cada teste:{' '}
                  <strong>não é um ranking de risco dos materiais</strong>.
                </>,
              )}
            >
              <XYChart series={co2} xLabel={t('Initial O2 (% vol)', 'O2 inicial (% vol)')} yLabel={t('ΔCO2 (percentage points)', 'ΔCO2 (pontos percentuais)')} label={t('Initial O2 by change in CO2, colored by material', 'O2 inicial por variação de CO2, cor por material')} />
            </Section>
            <Section
              kind="chart"
              icon={IconPulse}
              tag={t('one point per test', 'um ponto por teste')}
              title={t('At which oxygen level each material was tested', 'Em que oxigênio cada material foi testado')}
              caption={t('The vertical mark is the median. It shows the coverage of the experiment, not the burning limit of the material.', 'O traço vertical é a mediana. Mostra a cobertura do experimento, não o limite de queima do material.')}
            >
              <Strip groups={oxygenByMaterial} xLabel={t('Initial O2 (% vol)', 'O2 inicial (% vol)')} height={Math.max(220, oxygenByMaterial.length * 64 + 50)} label={t('Initial O2 of each test, by material', 'O2 inicial de cada teste, por material')} />
            </Section>
          </Grid>

          <Section
            kind="table"
            tag="bass_ensaios"
            flush
            title={t('Tests', 'Testes')}
            caption={t('Fan and air: the text is what was noted on the panel, with the adjustments made during the test. These are not calibrated speeds.', 'Ventilador e ar: o texto é o que foi anotado no painel, com os ajustes feitos durante o teste. Não são velocidades calibradas.')}
          >
            <DataTable
              rows={view}
              columns={testes.columns}
              hide={['fonte_arquivo']}
              filename="bass_ensaios"
              config={{
                material_original: t('Material (source text)', 'Material (texto da fonte)'),
                material_categoria: 'Material',
                ajustes_durante_teste: t('Adjustments during test', 'Ajustes no teste'),
                ventilador_display_unico: {
                  label: t('Fan (single value)', 'Ventilador (valor único)'),
                  help: t('Filled in only when the cell had a single number.', 'Preenchido só quando a célula tinha um único número.'),
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
        <CheckboxGroup label={t('Investigator', 'Pesquisador')} options={pis} value={pi} onChange={setPi} />
        <CheckboxGroup label="Material" options={materials} value={material} onChange={setMaterial} />
        <CheckboxGroup label={t('Geometry', 'Geometria')} options={shapes} value={shape} onChange={setShape} />
        <RangeFilter label={t('Initial O2 (% vol)', 'O2 inicial (% vol)')} bounds={oxygenBounds} value={oxygen} onChange={setOxygen} digits={1} />
      </SidebarFilters>

      {mode === 'simulacao' ? (
        <SimFrame>
          <BassSim rows={view} onReport={setSimText} />
        </SimFrame>
      ) : (
        dashboard
      )}
    </>
  )
}
