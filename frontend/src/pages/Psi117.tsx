import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { queries } from '@/api/client'
import type { Dataset } from '@/api/types'
import { useScreen } from '@/assistant/store'
import { measuredModelByFuel, measuredVsModel, xyLines } from '@/charts/build'
import { domainColors } from '@/charts/colors'
import { Dumbbell } from '@/charts/Dumbbell'
import { Gauge } from '@/charts/Gauge'
import { XYChart } from '@/charts/XYChart'
import { DataTable } from '@/components/DataTable'
import { Segmented } from '@/components/filters'
import { AlertsTable, InvestigationHeader } from '@/components/investigation'
import { SimFrame, ViewSwitch } from '@/components/StudyView'
import { Caption, Code, Expander, Grid, Section } from '@/components/ui'
import { IconArrowRightUp, IconDocument, IconFlame, IconGraph, IconPulse, IconRuler } from '@/icons'
import { omit, uniqueSorted } from '@/lib/data'
import { g } from '@/lib/format'
import { usePageState } from '@/lib/usePageState'
import { useStudyView } from '@/lib/useStudyView'

const VARIABLES = {
  'Diâmetro da gota (mm)': 'diametro_mm',
  'Temperatura máxima (K)': 't_max_k',
  '(D/D0)²': 'd_d0_quadrado',
  'Taxa de queima K (mm²/s)': 'k_mm2_s',
} as const
type Variable = keyof typeof VARIABLES

const FLAMES = [
  ['dext_quente_mm', 'Chama quente'],
  ['dext_fria_mm', 'Chama fria'],
] as const

function OneAtm({ data }: { data: Dataset }) {
  const panels = useMemo(
    () =>
      FLAMES.map(([column, flame]) => ({
        flame,
        column,
        series: measuredModelByFuel(
          data.rows.filter((r) => typeof r[column] === 'number' && (r[column] as number) > 0),
          { x: 'd0_mm', y: column },
        ),
      })),
    [data],
  )
  return (
    <>
      {panels.map(({ flame, series }) => (
        <Section
          key={flame}
          span={6}
          kind="chart"
          icon={IconFlame}
          tag="1 atm"
          title={`Extinção da ${flame.toLowerCase()} por tamanho inicial`}
          caption="n-heptano, n-decano e n-dodecano em ar. Medição em pontos (cada um é uma gota), modelo em linha tracejada. Zeros da fonte ficam de fora."
        >
          <XYChart series={series} xLabel="D0 (mm)" yLabel={`Extinção da ${flame.toLowerCase()} (mm)`} height={340} label={`Extinção a 1 atm da ${flame.toLowerCase()} por D0, por combustível`} />
        </Section>
      ))}
    </>
  )
}

function ModelSeries({ data, variable, onChange }: { data: Dataset; variable: Variable; onChange: (v: Variable) => void }) {
  const series = useMemo(() => xyLines(data.rows, { x: 't_s', y: VARIABLES[variable], series: 'cenario', markers: false, area: true }), [data, variable])
  return (
    <Section
      kind="chart"
      icon={IconPulse}
      tag="simulado"
      title="Modelo numérico: evolução de uma gota de n-heptano"
      caption={`Resultado de simulação, não medição. Cenários: ${uniqueSorted(data.rows.map((r) => r.cenario as string)).join(', ')}`}
    >
      <Segmented label="Variável" options={Object.keys(VARIABLES) as Variable[]} value={variable} onChange={onChange} />
      <XYChart key={variable} series={series} xLabel="Tempo (s)" yLabel={variable} height={400} label={`Modelo numérico: ${variable} ao longo do tempo, uma linha por cenário`} />
    </Section>
  )
}

// a cena 3D só é baixada quando alguém abre a vista de simulação
const Psi117Sim = lazy(() => import('@/sim/views/Psi117Sim'))

export default function Psi117() {
  const { data } = useSuspenseQuery(queries.psi117())
  const { investigacao: inv, pontos, comparacao, extincao_1atm, series_modelo, tabelas, alertas } = data
  const [variable, setVariable] = usePageState<Variable>('psi117:variavel', 'Temperatura máxima (K)')
  const [mode, setMode] = useStudyView()
  const [simText, setSimText] = useState('')

  const main = useMemo(() => measuredVsModel(pontos.rows, comparacao.rows), [pontos, comparacao])
  const flameColors = domainColors('tipo_chama')
  const gaps = comparacao.rows.map((r) => ({
    label: `${g(r.pressao_atm)} atm`,
    group: r.tipo_chama,
    color: flameColors[r.tipo_chama] ?? 'var(--s1)',
    a: r.medido_mm,
    b: r.modelo_mm,
    ok: r.modelo_na_faixa,
  }))
  const judged = comparacao.rows.filter((r) => r.modelo_na_faixa !== null)

  const extra: string[] = []
  if (extincao_1atm) extra.push('Extinção a 1 atm: D0 (x) × diâmetro de extinção (y), por combustível e medição/modelo.')
  if (series_modelo) extra.push(`Série temporal do modelo: tempo (x) × ${variable} (y), uma linha por cenário.`)
  useScreen({
    pagina: 'psi117',
    titulo: inv.nome,
    investigacao: 'PSI-117',
    graficos:
      mode === 'simulacao'
        ? [simText]
        : [
            'Diâmetro de extinção (y, mm) por pressão (x, atm): medição em pontos, modelo em losangos com linha tracejada, faixa de incerteza da chama fria como barra vertical clara. Cor laranja = chama quente, azul = chama fria.',
            'Medidor: em quantas pressões o modelo cai dentro da faixa de incerteza informada.',
            'Halteres: distância entre medição (círculo) e modelo (losango) em cada pressão.',
            'Tabela medido × modelo por pressão, com diferença e se o modelo cai dentro da faixa.',
            ...extra,
          ],
    dados: comparacao.rows,
    tabela_banco: 'v_psi117_comparacao',
  })

  const present = tabelas?.rows.filter((r) => r.presente_em_dados === true).length ?? 0

  const dashboard = (
    <>
      <Grid>
        <Section
          span={8}
          spanMd={12}
          kind="chart"
          icon={IconGraph}
          tag="medido × modelo"
          title="Diâmetro de extinção por pressão"
          caption="Pontos: medição · losangos tracejados: modelo · cápsula clara: incerteza informada na fonte (só existe para a chama fria). Cada tipo de chama tem sua cor."
        >
          <XYChart series={main} xLabel="Pressão (atm)" yLabel="Diâmetro de extinção (mm)" zeroY height={430} label="Diâmetro de extinção por pressão, medição e modelo por tipo de chama" />
        </Section>
        <Section
          span={4}
          spanMd={12}
          kind="chart"
          icon={IconRuler}
          tag="chama fria"
          title="O modelo cai na faixa?"
          caption="Pressões em que o modelo fica dentro da incerteza informada, entre as que têm faixa."
        >
          <Gauge value={judged.filter((r) => r.modelo_na_faixa === true).length} total={judged.length} caption="pressões na faixa" label="Pressões em que o modelo cai dentro da faixa de incerteza" height={300} ticks={Math.max(12, judged.length * 6)} />
        </Section>
        <Section
          kind="chart"
          icon={IconRuler}
          tag="mm"
          title="Distância entre medição e modelo"
          caption="Cada linha é uma pressão: o círculo é a medição, o losango é o modelo, e o traço entre eles é o quanto se afastam."
        >
          <Dumbbell rows={gaps} aLabel="Medição" bLabel="Modelo" xLabel="Diâmetro de extinção (mm)" height={Math.max(240, gaps.length * 34 + 50)} label="Medição e modelo por pressão e tipo de chama" />
        </Section>
      </Grid>

      <Section
        kind="table"
        tag="v_psi117_comparacao"
        flush
        title="Medido × modelo, lado a lado"
        caption="Onde há duas medições na mesma pressão, a coluna Medido é a média e Nº medições mostra quantas são. “Modelo dentro da faixa” compara o modelo com a faixa de incerteza informada."
      >
        <DataTable
          rows={comparacao.rows}
          columns={comparacao.columns}
          filename="psi117_comparacao"
          config={{
            tipo_chama: 'Chama',
            pressao_atm: 'Pressão (atm)',
            medido_mm: { label: 'Medido (mm)', digits: 2 },
            n_medicoes: 'Nº medições',
            modelo_mm: { label: 'Modelo (mm)', digits: 2 },
            limite_inferior_mm: { label: 'Faixa: mín. (mm)', digits: 2 },
            limite_superior_mm: { label: 'Faixa: máx. (mm)', digits: 2 },
            diferenca_mm: { label: 'Modelo − medido (mm)', digits: 2, signed: true },
            modelo_na_faixa: 'Modelo dentro da faixa',
          }}
        />
      </Section>

      <Expander title="Pontos como estão na fonte">
        <DataTable rows={omit(pontos.rows, ['fonte_arquivo'])} filename="psi117_extincao" />
      </Expander>
      <Link to="/comparacao" className="link-arrow">
        Comparar com os ensaios de voo do CFI <IconArrowRightUp size={16} />
      </Link>

      <Grid>
        {extincao_1atm && <OneAtm data={extincao_1atm} />}
        {series_modelo && <ModelSeries data={series_modelo} variable={variable} onChange={setVariable} />}
      </Grid>

      {tabelas && (
        <Expander title="Tabelas desta investigação (segundo o ReadMe)" icon={IconDocument}>
          <Caption>
            {present} de {tabelas.rows.length} estão em <Code>dados/</Code>.
          </Caption>
          <DataTable rows={tabelas.rows} columns={tabelas.columns} filename="psi117_tabelas" config={{ presente_em_dados: 'Em dados/' }} />
        </Expander>
      )}
      <AlertsTable alerts={alertas} />
    </>
  )

  return (
    <>
      <InvestigationHeader inv={inv} rows={pontos.rows.length} compact={mode === 'simulacao'}>
        <ViewSwitch view={mode} onChange={setMode} />
      </InvestigationHeader>

      {mode === 'simulacao' ? (
        <SimFrame>
          <Psi117Sim comparison={comparacao.rows} series={series_modelo} tables={tabelas} onReport={setSimText} />
        </SimFrame>
      ) : (
        dashboard
      )}
    </>
  )
}
