import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, useMemo, useState } from 'react'
import { queries } from '@/api/client'
import { useScreen } from '@/assistant/store'
import { BarList } from '@/charts/BarList'
import { scatterBy } from '@/charts/build'
import { DOMAIN_ORDER, domainColors } from '@/charts/colors'
import { Strip } from '@/charts/Strip'
import { XYChart } from '@/charts/XYChart'
import { DataTable } from '@/components/DataTable'
import { CheckboxGroup, RangeFilter } from '@/components/filters'
import { AlertsTable, InvestigationHeader } from '@/components/investigation'
import { SidebarFilters } from '@/components/Layout'
import { SimFrame, ViewSwitch } from '@/components/StudyView'
import { Callout, Grid, Metric, Metrics, Section } from '@/components/ui'
import { IconLayers, IconPulse, IconScatter } from '@/icons'
import { extent, groupBy, inRange, omit, type Range, uniqueSorted } from '@/lib/data'
import { span } from '@/lib/format'
import { usePageState } from '@/lib/usePageState'
import { useStudyView } from '@/lib/useStudyView'

const LABELS: Record<string, string> = {
  teste_id: 'Teste',
  pesquisador: 'Pesquisador',
  material_original: 'Material (fonte)',
  geometria: 'Geometria',
  o2_inicial_pct: 'O2 inicial (% vol)',
  delta_co2_pp: 'ΔCO2 (pontos percentuais)',
  material_categoria: 'Material',
}

// a cena 3D só é baixada quando alguém abre a vista de simulação
const BassSim = lazy(() => import('@/sim/views/BassSim'))

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
          .map((r) => ({ value: r.o2_inicial_pct as number, title: `Teste ${r.teste_id}`, tip: [['Geometria', r.geometria]] as const })),
      }))
      .filter((group) => group.points.length > 0)
  }, [view, materials])
  const combos = new Set(view.map((r) => `${r.material_categoria}\u0000${r.geometria}`)).size

  useScreen({
    pagina: 'bass',
    titulo: inv.nome,
    investigacao: 'PSI-25',
    filtros: { pesquisador: pi, material, geometria: shape, 'O2 inicial (%)': oxygen },
    graficos:
      mode === 'simulacao'
        ? [simText]
        : [
            'O que foi testado: barras horizontais com a contagem de testes por material · geometria.',
            'Em que oxigênio cada material foi testado: um ponto por teste ao longo do O2 inicial (x), uma faixa por material, mediana marcada.',
            'Oxigênio inicial × CO2 produzido: dispersão O2 inicial (x) × ΔCO2 em pontos percentuais (y), cor por material. Não é ranking de risco.',
          ],
    dados: omit(view, ['fonte_arquivo']),
    tabela_banco: 'bass_ensaios',
  })

  const dashboard = (
    <>
      <Metrics>
        <Metric label="Testes no filtro" value={view.length} />
        <Metric label="Materiais × geometrias" value={combos} />
        <Metric label="O2 inicial (% vol)" value={view.length ? span(extent(view.map((r) => r.o2_inicial_pct))) : '—'} />
        <Metric label="Testes com alerta" value={view.filter((r) => withAlerts.has(r.teste_id)).length} />
      </Metrics>

      {view.length === 0 ? (
        <Callout>Nenhum teste com esses filtros.</Callout>
      ) : (
        <>
          <Grid>
            <Section
              span={5}
              spanMd={12}
              kind="chart"
              icon={IconLayers}
              tag="contagem"
              title="O que foi testado"
              caption="Testes por material e geometria. Contagem de ensaios, não medida de desempenho."
            >
              <BarList items={tested} label="Contagem de testes por material e geometria" />
            </Section>
            <Section
              span={7}
              spanMd={12}
              kind="chart"
              icon={IconScatter}
              tag="dispersão"
              title="Oxigênio inicial × CO2 produzido"
              caption={
                <>
                  ΔCO2 = final − inicial na câmara. Depende da duração e do protocolo de cada teste:{' '}
                  <strong>não é um ranking de risco dos materiais</strong>.
                </>
              }
            >
              <XYChart series={co2} xLabel="O2 inicial (% vol)" yLabel="ΔCO2 (pontos percentuais)" label="O2 inicial por variação de CO2, cor por material" />
            </Section>
            <Section
              kind="chart"
              icon={IconPulse}
              tag="um ponto por teste"
              title="Em que oxigênio cada material foi testado"
              caption="O traço vertical é a mediana. Mostra a cobertura do experimento, não o limite de queima do material."
            >
              <Strip groups={oxygenByMaterial} xLabel="O2 inicial (% vol)" height={Math.max(220, oxygenByMaterial.length * 64 + 50)} label="O2 inicial de cada teste, por material" />
            </Section>
          </Grid>

          <Section
            kind="table"
            tag="bass_ensaios"
            flush
            title="Testes"
            caption="Ventilador e ar: o texto é o que foi anotado no painel, com os ajustes feitos durante o teste. Não são velocidades calibradas."
          >
            <DataTable
              rows={view}
              columns={testes.columns}
              hide={['fonte_arquivo']}
              filename="bass_ensaios"
              config={{
                material_original: 'Material (texto da fonte)',
                material_categoria: 'Material',
                ajustes_durante_teste: 'Ajustes no teste',
                ventilador_display_unico: {
                  label: 'Ventilador (valor único)',
                  help: 'Preenchido só quando a célula tinha um único número.',
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
        <CheckboxGroup label="Pesquisador" options={pis} value={pi} onChange={setPi} />
        <CheckboxGroup label="Material" options={materials} value={material} onChange={setMaterial} />
        <CheckboxGroup label="Geometria" options={shapes} value={shape} onChange={setShape} />
        <RangeFilter label="O2 inicial (% vol)" bounds={oxygenBounds} value={oxygen} onChange={setOxygen} digits={1} />
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
