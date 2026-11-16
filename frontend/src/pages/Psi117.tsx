import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { queries } from '@/shared/api/client'
import type { Dataset } from '@/shared/api/types'
import { useScreen } from '@/features/assistant/store'
import { measuredModelByFuel, measuredVsModel, xyLines } from '@/shared/charts/build'
import { domainColors } from '@/shared/charts/colors'
import { Dumbbell } from '@/shared/charts/Dumbbell'
import { Gauge } from '@/shared/charts/Gauge'
import { XYChart } from '@/shared/charts/XYChart'
import { DataTable } from '@/shared/ui/DataTable'
import { Segmented } from '@/shared/ui/filters'
import { AlertsTable, InvestigationHeader } from '@/features/studies/components/investigation'
import { SimFrame, ViewSwitch } from '@/features/studies/components/StudyView'
import { Caption, Code, Expander, Grid, Section } from '@/shared/ui/ui'
import { IconArrowRightUp, IconDocument, IconFlame, IconGraph, IconPulse, IconRuler } from '@/shared/icons/index'
import { omit, uniqueSorted } from '@/shared/lib/data'
import { g } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { usePageState } from '@/shared/lib/usePageState'
import { useStudyView } from '@/features/studies/useStudyView'

// a chave é a coluna (estável, vai para o estado da página); o valor é o rótulo no idioma em uso
const VARIABLES = {
  diametro_mm: t('Droplet diameter (mm)', 'Diâmetro da gota (mm)'),
  t_max_k: t('Maximum temperature (K)', 'Temperatura máxima (K)'),
  d_d0_quadrado: '(D/D0)²',
  k_mm2_s: t('Burning rate K (mm²/s)', 'Taxa de queima K (mm²/s)'),
}
type Variable = keyof typeof VARIABLES
const VARIABLE_KEYS = Object.keys(VARIABLES) as Variable[]

const FLAMES = [
  ['dext_quente_mm', t('Hot flame', 'Chama quente')],
  ['dext_fria_mm', t('Cool flame', 'Chama fria')],
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
          title={t(`${flame} extinction by initial size`, `Extinção da ${flame.toLowerCase()} por tamanho inicial`)}
          caption={t('n-heptane, n-decane and n-dodecane in air. Measurement as points (each one is a droplet), model as a dashed line. Zeros in the source are left out.', 'n-heptano, n-decano e n-dodecano em ar. Medição em pontos (cada um é uma gota), modelo em linha tracejada. Zeros da fonte ficam de fora.')}
        >
          <XYChart
            series={series}
            xLabel="D0 (mm)"
            yLabel={t(`${flame} extinction (mm)`, `Extinção da ${flame.toLowerCase()} (mm)`)}
            height={340}
            label={t(`${flame} extinction at 1 atm by D0, by fuel`, `Extinção a 1 atm da ${flame.toLowerCase()} por D0, por combustível`)}
          />
        </Section>
      ))}
    </>
  )
}

function ModelSeries({ data, variable, onChange }: { data: Dataset; variable: Variable; onChange: (v: Variable) => void }) {
  const series = useMemo(() => xyLines(data.rows, { x: 't_s', y: variable, series: 'cenario', markers: false, area: true }), [data, variable])
  const name = VARIABLES[variable]
  const scenarios = uniqueSorted(data.rows.map((r) => r.cenario as string)).join(', ')
  return (
    <Section
      kind="chart"
      icon={IconPulse}
      tag={t('simulated', 'simulado')}
      title={t('Numerical model: evolution of an n-heptane droplet', 'Modelo numérico: evolução de uma gota de n-heptano')}
      caption={t(`Simulation result, not a measurement. Scenarios: ${scenarios}`, `Resultado de simulação, não medição. Cenários: ${scenarios}`)}
    >
      <Segmented
        label={t('Variable', 'Variável')}
        options={VARIABLE_KEYS.map((k) => VARIABLES[k])}
        value={name}
        onChange={(chosen) => onChange(VARIABLE_KEYS.find((k) => VARIABLES[k] === chosen) ?? variable)}
      />
      <XYChart
        key={variable}
        series={series}
        xLabel={t('Time (s)', 'Tempo (s)')}
        yLabel={name}
        height={400}
        label={t(`Numerical model: ${name} over time, one line per scenario`, `Modelo numérico: ${name} ao longo do tempo, uma linha por cenário`)}
      />
    </Section>
  )
}

// a cena 3D só é baixada quando alguém abre a vista de simulação
const Psi117Sim = lazy(() => import('@/visualization/views/Psi117Sim'))

export default function Psi117() {
  const { data } = useSuspenseQuery(queries.psi117())
  const { investigacao: inv, pontos, comparacao, extincao_1atm, series_modelo, tabelas, alertas } = data
  const [stored, setVariable] = usePageState<Variable>('psi117:variavel', 't_max_k')
  // o estado guardado pode ser de antes de a chave virar a coluna
  const variable: Variable = stored in VARIABLES ? stored : 't_max_k'
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
  if (extincao_1atm) extra.push(t('Extinction at 1 atm: D0 (x) × extinction diameter (y), by fuel and measurement/model.', 'Extinção a 1 atm: D0 (x) × diâmetro de extinção (y), por combustível e medição/modelo.'))
  if (series_modelo) extra.push(t(`Model time series: time (x) × ${VARIABLES[variable]} (y), one line per scenario.`, `Série temporal do modelo: tempo (x) × ${VARIABLES[variable]} (y), uma linha por cenário.`))
  useScreen({
    pagina: 'psi117',
    titulo: inv.nome,
    investigacao: 'PSI-117',
    graficos:
      mode === 'simulacao'
        ? [simText]
        : [
            t(
              'Extinction diameter (y, mm) by pressure (x, atm): measurement as points, model as diamonds with a dashed line, cool-flame uncertainty range as a light vertical bar. Orange = hot flame, blue = cool flame.',
              'Diâmetro de extinção (y, mm) por pressão (x, atm): medição em pontos, modelo em losangos com linha tracejada, faixa de incerteza da chama fria como barra vertical clara. Cor laranja = chama quente, azul = chama fria.',
            ),
            t(
              'Gauge: at how many pressures the model falls within the reported uncertainty range.',
              'Medidor: em quantas pressões o modelo cai dentro da faixa de incerteza informada.',
            ),
            t(
              'Dumbbells: distance between measurement (circle) and model (diamond) at each pressure.',
              'Halteres: distância entre medição (círculo) e modelo (losango) em cada pressão.',
            ),
            t(
              'Measured vs. model table by pressure, with the difference and whether the model falls within the range.',
              'Tabela medido × modelo por pressão, com diferença e se o modelo cai dentro da faixa.',
            ),
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
          tag={t('measured vs. model', 'medido × modelo')}
          title={t('Extinction diameter by pressure', 'Diâmetro de extinção por pressão')}
          caption={t('Points: measurement · dashed diamonds: model · light capsule: uncertainty reported in the source (only exists for the cool flame). Each flame type has its own color.', 'Pontos: medição · losangos tracejados: modelo · cápsula clara: incerteza informada na fonte (só existe para a chama fria). Cada tipo de chama tem sua cor.')}
        >
          <XYChart series={main} xLabel={t('Pressure (atm)', 'Pressão (atm)')} yLabel={t('Extinction diameter (mm)', 'Diâmetro de extinção (mm)')} zeroY height={430} label={t('Extinction diameter by pressure, measurement and model by flame type', 'Diâmetro de extinção por pressão, medição e modelo por tipo de chama')} />
        </Section>
        <Section
          span={4}
          spanMd={12}
          kind="chart"
          icon={IconRuler}
          tag={t('cool flame', 'chama fria')}
          title={t('Does the model fall within the range?', 'O modelo cai na faixa?')}
          caption={t('Pressures at which the model stays within the reported uncertainty, among those that have a range.', 'Pressões em que o modelo fica dentro da incerteza informada, entre as que têm faixa.')}
        >
          <Gauge value={judged.filter((r) => r.modelo_na_faixa === true).length} total={judged.length} caption={t('pressures in range', 'pressões na faixa')} label={t('Pressures at which the model falls within the uncertainty range', 'Pressões em que o modelo cai dentro da faixa de incerteza')} height={300} ticks={Math.max(12, judged.length * 6)} />
        </Section>
        <Section
          kind="chart"
          icon={IconRuler}
          tag="mm"
          title={t('Distance between measurement and model', 'Distância entre medição e modelo')}
          caption={t('Each row is a pressure: the circle is the measurement, the diamond is the model, and the line between them is how far apart they are.', 'Cada linha é uma pressão: o círculo é a medição, o losango é o modelo, e o traço entre eles é o quanto se afastam.')}
        >
          <Dumbbell rows={gaps} aLabel={t('Measurement', 'Medição')} bLabel={t('Model', 'Modelo')} xLabel={t('Extinction diameter (mm)', 'Diâmetro de extinção (mm)')} height={Math.max(240, gaps.length * 34 + 50)} label={t('Measurement and model by pressure and flame type', 'Medição e modelo por pressão e tipo de chama')} />
        </Section>
      </Grid>

      <Section
        kind="table"
        tag="v_psi117_comparacao"
        flush
        title={t('Measured vs. model, side by side', 'Medido × modelo, lado a lado')}
        caption={t('Where there are two measurements at the same pressure, the Measured column is the mean and No. of measurements shows how many there are. “Model within range” compares the model with the reported uncertainty range.', 'Onde há duas medições na mesma pressão, a coluna Medido é a média e Nº medições mostra quantas são. “Modelo dentro da faixa” compara o modelo com a faixa de incerteza informada.')}
      >
        <DataTable
          rows={comparacao.rows}
          columns={comparacao.columns}
          filename="psi117_comparacao"
          config={{
            tipo_chama: t('Flame', 'Chama'),
            pressao_atm: t('Pressure (atm)', 'Pressão (atm)'),
            medido_mm: { label: t('Measured (mm)', 'Medido (mm)'), digits: 2 },
            n_medicoes: t('No. of measurements', 'Nº medições'),
            modelo_mm: { label: t('Model (mm)', 'Modelo (mm)'), digits: 2 },
            limite_inferior_mm: { label: t('Range: min. (mm)', 'Faixa: mín. (mm)'), digits: 2 },
            limite_superior_mm: { label: t('Range: max. (mm)', 'Faixa: máx. (mm)'), digits: 2 },
            diferenca_mm: { label: t('Model − measured (mm)', 'Modelo − medido (mm)'), digits: 2, signed: true },
            modelo_na_faixa: t('Model within range', 'Modelo dentro da faixa'),
          }}
        />
      </Section>

      <Expander title={t('Points as they are in the source', 'Pontos como estão na fonte')}>
        <DataTable rows={omit(pontos.rows, ['fonte_arquivo'])} filename="psi117_extincao" />
      </Expander>
      <Link to="/comparacao" className="link-arrow">
        {t('Compare with the CFI flight tests', 'Comparar com os ensaios de voo do CFI')} <IconArrowRightUp size={16} />
      </Link>

      <Grid>
        {extincao_1atm && <OneAtm data={extincao_1atm} />}
        {series_modelo && <ModelSeries data={series_modelo} variable={variable} onChange={setVariable} />}
      </Grid>

      {tabelas && (
        <Expander title={t('Tables of this investigation (according to the ReadMe)', 'Tabelas desta investigação (segundo o ReadMe)')} icon={IconDocument}>
          <Caption>
            {t(
              <>
                {present} of {tabelas.rows.length} are in <Code>dados/</Code>.
              </>,
              <>
                {present} de {tabelas.rows.length} estão em <Code>dados/</Code>.
              </>,
            )}
          </Caption>
          <DataTable rows={tabelas.rows} columns={tabelas.columns} filename="psi117_tabelas" config={{ presente_em_dados: t('In dados/', 'Em dados/') }} />
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
