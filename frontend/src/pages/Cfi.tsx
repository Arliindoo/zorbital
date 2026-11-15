import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, useMemo, useState } from 'react'
import { queries } from '@/api/client'
import { useScreen } from '@/assistant/store'
import { scatterBy } from '@/charts/build'
import { DOMAIN_ORDER } from '@/charts/colors'
import { Heatmap } from '@/charts/Heatmap'
import { Ridge } from '@/charts/Ridge'
import { XYChart } from '@/charts/XYChart'
import { DataTable } from '@/components/DataTable'
import { CheckboxGroup, RangeFilter, Toggle } from '@/components/filters'
import { AlertsTable, InvestigationHeader } from '@/components/investigation'
import { SidebarFilters } from '@/components/Layout'
import { SimFrame, ViewSwitch } from '@/components/StudyView'
import { Callout, Expander, Grid, Metric, Metrics, Section } from '@/components/ui'
import { IconDrop, IconFlame, IconPulse, IconScan } from '@/icons'
import { extent, groupBy, inRangeOrNull, omit, type Range, uniqueSorted } from '@/lib/data'
import { flamesLong } from '@/lib/flames'
import { g } from '@/lib/format'
import { usePageState } from '@/lib/usePageState'
import { useStudyView } from '@/lib/useStudyView'

const LABELS: Record<string, string> = {
  teste_id: 'Ensaio',
  pressao_atm: 'Pressão (atm)',
  dext_mm: 'Diâmetro de extinção (mm)',
  tipo_chama: 'Chama',
  d0_mm: 'D0 (mm)',
  dext_quente_mm: 'Extinção da chama quente (mm)',
  combustivel: 'Combustível',
}

// a cena 3D só é baixada quando alguém abre a vista de simulação
const CfiSim = lazy(() => import('@/sim/views/CfiSim'))

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
      combustível: fuel,
      diluente: diluent,
      'pressão (atm)': pressure,
      'D0 (mm)': d0,
      'só análise concluída': complete,
    },
    graficos:
      mode === 'simulacao'
        ? [simText]
        : [
            'Extinção por pressão: um ponto por ensaio, pressão (x) × diâmetro de extinção (y), cor por tipo de chama (azul = fria, laranja = quente).',
            'Tamanho inicial × extinção da chama quente: D0 (x) × Dext quente (y), cor por combustível.',
            'Distribuição da extinção quente por pressão: uma curva de densidade por pressão.',
            'Cobertura: matriz combustível × pressão com o número de ensaios em cada condição.',
          ],
    dados: omit(view, ['fonte_arquivo', 'comentario']),
    tabela_banco: 'cfi_ensaios',
  })

  const dashboard = (
    <>
      <Metrics>
        <Metric label="Ensaios no filtro" value={view.length} />
        <Metric label="Com extinção da chama quente" value={view.filter((r) => r.dext_quente_mm !== null).length} accent="var(--s3)" />
        <Metric label="Com extinção da chama fria" value={view.filter((r) => r.dext_fria_mm !== null).length} accent="var(--s4)" />
        <Metric
          label="Chama fria sem extinção visível"
          value={view.filter((r) => r.dext_fria_zero_na_fonte === true).length}
          help="Zero na fonte: a gota foi consumida pela chama fria sem extinção visível."
        />
      </Metrics>

      {view.length === 0 ? (
        <Callout>Nenhum ensaio com esses filtros.</Callout>
      ) : (
        <>
          <Grid>
            <Section
              span={6}
              kind="chart"
              icon={IconFlame}
              tag="um ponto por ensaio"
              title="Extinção por pressão"
              caption="Cada ponto é um ensaio. Ensaios sem extinção visível da chama fria não aparecem."
            >
              <XYChart series={byPressure} xLabel="Pressão (atm)" yLabel="Diâmetro de extinção (mm)" label="Diâmetro de extinção por pressão, cor por tipo de chama" />
            </Section>
            <Section
              span={6}
              kind="chart"
              icon={IconDrop}
              tag="dispersão"
              title="Tamanho inicial × extinção da chama quente"
              caption="O diâmetro de extinção cresce com a gota inicial: compare pressões com D0 parecido."
            >
              <XYChart series={bySize} xLabel="D0 (mm)" yLabel="Extinção da chama quente (mm)" label="D0 por diâmetro de extinção da chama quente, cor por combustível" />
            </Section>
            {ridges.length > 1 && (
              <Section
                span={7}
                spanMd={12}
                kind="chart"
                icon={IconPulse}
                tag="densidade"
                title="Como a extinção quente se distribui em cada pressão"
                caption="Uma curva por pressão (com 4 ensaios ou mais no filtro). A forma mostra onde os ensaios se concentram; não é uma tendência ajustada."
              >
                <Ridge groups={ridges} xLabel="Extinção da chama quente (mm)" height={Math.max(260, ridges.length * 46 + 90)} label="Distribuição do diâmetro de extinção da chama quente por pressão" />
              </Section>
            )}
            <Section
              span={ridges.length > 1 ? 5 : 12}
              spanMd={12}
              kind="chart"
              icon={IconScan}
              tag="ensaios"
              title="Cobertura: combustível × pressão"
              caption="Quantos ensaios há em cada condição. Células tracejadas não foram ensaiadas."
            >
              <Heatmap
                rows={matrix.rows}
                cols={matrix.cols}
                value={(row, col) => matrix.counts.get(`${row}|${col}`) ?? null}
                unit="Ensaios"
                height={Math.max(180, matrix.rows.length * 46 + 44)}
                label="Número de ensaios por combustível e pressão"
              />
            </Section>
          </Grid>

          <Section title="Resumo por condição" kind="table" tag="cfi_por_pressao" flush>
            <DataTable rows={summary} columns={resumo.columns} filename="cfi_por_pressao" />
          </Section>

          <Section title="Ensaios" kind="table" tag="cfi_ensaios" flush>
            <DataTable
              rows={view}
              columns={ensaios.columns}
              hide={['fonte_arquivo']}
              filename="cfi_ensaios"
              config={{
                dext_fria_zero_na_fonte: {
                  label: 'Chama fria sem extinção visível',
                  help: 'A fonte registra 0: gota consumida pela chama fria.',
                },
                dext_fria_extrapolado: 'Dext fria extrapolado',
                analise_completa: 'Análise concluída',
                comentario: { label: 'Comentário do operador', wide: true },
              }}
            />
          </Section>
          <Expander title="Câmeras de cada ensaio">
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
      <SidebarFilters title="Filtros">
        <CheckboxGroup label="Combustível" options={fuels} value={fuel} onChange={setFuel} />
        <CheckboxGroup label="Diluente" options={diluents} value={diluent} onChange={setDiluent} />
        <CheckboxGroup label="Pressão (atm)" options={pressures} value={pressure} onChange={setPressure} format={g} />
        <RangeFilter label="Diâmetro inicial D0 (mm)" bounds={d0Bounds} value={d0} onChange={setD0} digits={2} />
        <Toggle label="Só ensaios com análise concluída" checked={complete} onChange={setComplete} />
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
