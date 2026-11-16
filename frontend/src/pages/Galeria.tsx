import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { queries } from '@/shared/api/client'
import { useScreen } from '@/features/assistant/store'
import { BarList } from '@/shared/charts/BarList'
import { measuredVsModel, scatterBy, xyLines } from '@/shared/charts/build'
import { DOMAIN_ORDER, domainColors, FLAME, SERIES, STATUS } from '@/shared/charts/colors'
import { Dumbbell } from '@/shared/charts/Dumbbell'
import { Gauge } from '@/shared/charts/Gauge'
import { Heatmap } from '@/shared/charts/Heatmap'
import { Iso } from '@/shared/charts/Iso'
import { MiniBars } from '@/shared/charts/MiniBars'
import { Orb } from '@/shared/charts/Orb'
import { Radial } from '@/shared/charts/Radial'
import { Ridge } from '@/shared/charts/Ridge'
import { Sankey, type SankeyLink, type SankeyNode } from '@/shared/charts/Sankey'
import { Strip } from '@/shared/charts/Strip'
import { Waffle } from '@/shared/charts/Waffle'
import { XYChart, type XYSeries } from '@/shared/charts/XYChart'
import { Segmented } from '@/shared/ui/filters'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Panel, type PanelProps } from '@/shared/ui/ui'
import { CountUp } from '@/shared/fx/CountUp'
import { useInView } from '@/shared/fx/useInView'
import {
  IconAtom,
  IconChecklist,
  IconCompare,
  IconCounterflow,
  IconDocument,
  IconDrop,
  IconFlame,
  IconGraph,
  IconLayers,
  IconPie,
  IconPulse,
  IconRuler,
  IconScan,
  IconScatter,
  IconSnowflake,
  IconStars,
} from '@/shared/icons/index'
import { groupBy, median, numbers, uniqueSorted } from '@/shared/lib/data'
import { fixed, g, int } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'

const F = {
  all: t('All', 'Todos'),
  flow: t('Flow', 'Fluxo'),
  relation: t('Relationship', 'Relação'),
  distribution: t('Distribution', 'Distribuição'),
  comparison: t('Comparison', 'Comparação'),
  part: t('Part and whole', 'Parte e todo'),
}
const FAMILIES = [F.all, F.flow, F.relation, F.distribution, F.comparison, F.part] as const
type Family = string

const STATUS_COLORS: Record<string, string> = {
  Carregado: STATUS.ok,
  'Não carregado': STATUS.warn,
  'Duplicata exata': SERIES[1],
  Documentação: STATUS.info,
  'Não reconhecido': STATUS.bad,
}

function Card({ family, active, ...panel }: PanelProps & { family: Family; active: Family }) {
  if (active !== F.all && active !== family) return null
  return <Panel kind="chart" {...panel} tag={panel.tag ?? family} />
}

/** O núcleo de pontos como carta: proporção de linhas com alerta. */
function Core({ share }: { share: number }) {
  const [ref, on] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className="chart" data-on={on} role="img" aria-label={t('Core of dots with the share of alerts highlighted', 'Núcleo de pontos com a proporção de alertas em destaque')}>
      <svg viewBox="0 0 300 260" style={{ height: 260 }}>
        <Orb cx={150} cy={130} r={74} share={share} />
      </svg>
    </div>
  )
}

export default function Galeria() {
  const { data: overview } = useSuspenseQuery(queries.overview())
  const { data: flex } = useSuspenseQuery(queries.flex())
  const { data: cfi } = useSuspenseQuery(queries.cfi())
  const { data: bass } = useSuspenseQuery(queries.bass())
  const { data: psi117 } = useSuspenseQuery(queries.psi117())
  const [family, setFamily] = useState<Family>(F.all)
  const tests = cfi.ensaios.rows
  const flames = domainColors('tipo_chama')
  const fuels = domainColors('combustivel')
  const materials = domainColors('material_categoria')

  // ---- fluxo: combustível → diluente → o que foi medido da chama fria
  const sankey = useMemo(() => {
    const measured = t('Cool extinction measured', 'Extinção fria medida')
    const notVisible = t('No visible cool extinction', 'Sem extinção fria visível')
    const notMeasured = t('No cool-flame measurement', 'Sem medida da chama fria')
    const outcome = (r: (typeof tests)[number]) => (r.dext_fria_zero_na_fonte === true ? notVisible : r.dext_fria_mm !== null ? measured : notMeasured)
    const fuelNames = DOMAIN_ORDER.combustivel.filter((f) => tests.some((r) => r.combustivel === f))
    const diluents = uniqueSorted(tests.map((r) => r.diluente))
    const outcomes = [measured, notVisible, notMeasured].filter((o) => tests.some((r) => outcome(r) === o))
    const nodes: SankeyNode[] = [
      ...fuelNames.map((f) => ({ id: `f:${f}`, label: f, column: 0, color: fuels[f]! })),
      ...diluents.map((d, i) => ({ id: `d:${d}`, label: d, column: 1, color: [SERIES[6], SERIES[4]][i % 2]! })),
      ...outcomes.map((o, i) => ({ id: `o:${o}`, label: o, column: 2, color: [FLAME.fria, SERIES[5], 'var(--ink-3)'][i]! })),
    ]
    const links: SankeyLink[] = []
    for (const [k, list] of groupBy(tests, (r) => `f:${r.combustivel}|d:${r.diluente}`)) links.push({ source: k.split('|')[0]!, target: k.split('|')[1]!, value: list.length })
    for (const [k, list] of groupBy(tests, (r) => `d:${r.diluente}|o:${outcome(r)}`)) links.push({ source: k.split('|')[0]!, target: k.split('|')[1]!, value: list.length })
    return { nodes, links }
  }, [tests, fuels])

  const scatter = useMemo(
    () =>
      scatterBy(flex.ensaios.rows, {
        x: 'oxigenio_fracao',
        y: 'pressao_mmhg',
        color: 'desfecho',
        labels: { teste_id: t('Test', 'Ensaio'), combustivel: t('Fuel', 'Combustível') },
        hover: ['teste_id', 'combustivel'],
      }),
    [flex],
  )
  const model = useMemo(() => measuredVsModel(psi117.pontos.rows, psi117.comparacao.rows), [psi117])
  const judged = psi117.comparacao.rows.filter((r) => r.modelo_na_faixa !== null)

  const iso = useMemo(
    () =>
      tests
        .filter((r) => r.pressao_atm !== null && r.d0_mm !== null && r.dext_quente_mm !== null)
        .map((r) => ({
          x: r.pressao_atm as number,
          z: r.d0_mm as number,
          h: r.dext_quente_mm as number,
          color: fuels[r.combustivel] ?? SERIES[0],
          title: t(`Test ${r.teste_id}`, `Ensaio ${r.teste_id}`),
          tip: [[t('Fuel', 'Combustível'), r.combustivel]] as const,
        })),
    [tests, fuels],
  )
  const ridges = useMemo(
    () =>
      [...groupBy(tests.filter((r) => r.dext_quente_mm !== null), (r) => r.pressao_atm as number).entries()]
        .filter(([, list]) => list.length >= 4)
        .sort((a, b) => a[0] - b[0])
        .map(([p, list]) => ({ name: `${g(p)} atm`, values: list.map((r) => r.dext_quente_mm as number) })),
    [tests],
  )
  const coverage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of tests) counts.set(`${r.combustivel}|${g(r.pressao_atm)}`, (counts.get(`${r.combustivel}|${g(r.pressao_atm)}`) ?? 0) + 1)
    return { rows: DOMAIN_ORDER.combustivel.filter((f) => tests.some((r) => r.combustivel === f)), cols: uniqueSorted(tests.map((r) => r.pressao_atm)).map((p) => g(p)), counts }
  }, [tests])

  // ---- faixa (mín–máx) e mediana da extinção por pressão, por tipo de chama
  const ranges = useMemo(() => {
    const out: XYSeries[] = []
    for (const [column, name, color] of [
      ['dext_quente_mm', t('Hot flame', 'Chama quente'), flames['Chama quente']!],
      ['dext_fria_mm', t('Cool flame', 'Chama fria'), flames['Chama fria']!],
    ] as const) {
      const byPressure = [...groupBy(tests.filter((r) => typeof r[column] === 'number' && (r[column] as number) > 0), (r) => r.pressao_atm as number).entries()].sort((a, b) => a[0] - b[0])
      out.push({
        name: t(`${name} · min–max`, `${name} · mín–máx`),
        color,
        type: 'band',
        data: byPressure.map(([p, list]) => {
          const values = numbers(list.map((r) => r[column]))
          return { x: g(p), y: null, lo: Math.min(...values), hi: Math.max(...values), tip: [[t('Tests', 'Ensaios'), String(values.length)]] as const }
        }),
      })
      out.push({
        name: t(`${name} · median`, `${name} · mediana`),
        color,
        type: 'points',
        size: 4,
        data: byPressure.map(([p, list]) => ({ x: g(p), y: median(numbers(list.map((r) => r[column]))) })),
      })
    }
    return out
  }, [tests, flames])

  const months = useMemo(() => {
    const byMonth = [...groupBy(tests.filter((r) => typeof r.data === 'string' && r.data >= '2017'), (r) => String(r.data).slice(0, 7)).entries()].sort((a, b) => a[0].localeCompare(b[0]))
    return DOMAIN_ORDER.combustivel
      .filter((f) => tests.some((r) => r.combustivel === f))
      .map(
        (fuel): XYSeries => ({
          name: fuel,
          color: fuels[fuel]!,
          type: 'bars',
          data: byMonth.map(([month, list]) => ({ x: month.slice(5) + '/' + month.slice(2, 4), y: list.filter((r) => r.combustivel === fuel).length })),
        }),
      )
  }, [tests, fuels])

  const curves = useMemo(
    () => (psi117.series_modelo ? xyLines(psi117.series_modelo.rows, { x: 't_s', y: 't_max_k', series: 'cenario', markers: false, area: true }) : []),
    [psi117],
  )
  const gaps = psi117.comparacao.rows.map((r) => ({
    label: `${g(r.pressao_atm)} atm`,
    group: r.tipo_chama,
    color: flames[r.tipo_chama] ?? SERIES[0],
    a: r.medido_mm,
    b: r.modelo_mm,
    ok: r.modelo_na_faixa,
  }))

  const bassRows = bass.testes.rows
  const tested = useMemo(
    () =>
      [...groupBy(bassRows, (r) => r.material_categoria).entries()]
        .map(([name, list]) => ({ label: name, value: list.length, color: materials[name] }))
        .sort((a, b) => b.value - a.value),
    [bassRows, materials],
  )
  const oxygen = useMemo(
    () =>
      DOMAIN_ORDER.material_categoria
        .map((name) => ({
          name,
          color: materials[name] ?? SERIES[0],
          points: bassRows
            .filter((r) => r.material_categoria === name && r.o2_inicial_pct !== null)
            .map((r) => ({ value: r.o2_inicial_pct as number, title: t(`Test ${r.teste_id}`, `Teste ${r.teste_id}`), tip: [[t('Geometry', 'Geometria'), r.geometria]] as const })),
        }))
        .filter((group) => group.points.length > 0),
    [bassRows, materials],
  )

  const totalRows = overview.investigacoes.reduce((sum, inv) => sum + inv.linhas, 0)
  const alertsByInv = overview.investigacoes
    .map((inv, i) => ({ label: inv.nome.split(' — ')[0] ?? inv.id, value: inv.alertas, color: SERIES[i]! }))
    .sort((a, b) => b.value - a.value)

  useScreen({
    pagina: 'overview',
    titulo: t('Chart gallery', 'Galeria de gráficos'),
    graficos: [
      t('Sankey: fuel → diluent → cool-flame measurement (CFI tests).', 'Sankey: combustível → diluente → medida da chama fria (ensaios do CFI).'),
      t(
        'FLEX scatter, PSI-117 measured vs. model, CFI isometric 3D, density curves by pressure, coverage matrix, min–max ranges, dumbbells, alert arcs, file waffle and materials ranking.',
        'Dispersão FLEX, medido × modelo do PSI-117, 3D isométrico do CFI, curvas de densidade por pressão, matriz de cobertura, faixas mín–máx, halteres, arcos de alertas, mosaico de arquivos e ranking de materiais.',
      ),
    ],
  })

  const tiles = [
    { label: t('Droplet D0 · CFI', 'D0 das gotas · CFI'), unit: 'mm', values: numbers(tests.map((r) => r.d0_mm)), color: 'var(--s4)' },
    { label: t('Hot extinction · CFI', 'Extinção quente · CFI'), unit: 'mm', values: numbers(tests.map((r) => r.dext_quente_mm)), color: 'var(--s3)' },
    { label: t('Initial O2 · BASS-II', 'O2 inicial · BASS-II'), unit: '% vol', values: numbers(bassRows.map((r) => r.o2_inicial_pct)), color: 'var(--s1)' },
    { label: 'ΔCO2 · BASS-II', unit: t('pp', 'p.p.'), values: numbers(bassRows.map((r) => r.delta_co2_pp)), color: 'var(--s2)' },
  ]

  return (
    <>
      <PageHeader eyebrow={[t('Tool', 'Ferramenta'), t('Visualization kit', 'Kit de visualização'), 'SVG']} title={t('Gallery', 'Galeria')} aside={t('of charts', 'de gráficos')}>
        {t(
          'Every chart type in the system, drawn in SVG and fed by the real data of the five investigations. Hover to read the values; click the legend to hide a series.',
          'Todos os tipos de gráfico do sistema, desenhados em SVG e alimentados pelos dados reais das cinco investigações. Passe o ponteiro para ler os valores; clique na legenda para esconder uma série.',
        )}
      </PageHeader>

      <Segmented label={t('Chart family', 'Família de gráfico')} options={FAMILIES} value={family} onChange={setFamily} />

      <div className="grid" key={family}>
        {(family === F.all || family === F.distribution) &&
          tiles.map((tile, i) => (
            <Panel key={tile.label} span={3} spanMd={6} kind="metric" label={tile.label} className="tile">
              <span className="label">{tile.label}</span>
              <span className="metric__value">
                <CountUp value={median([...tile.values]) ?? 0} digits={2} delay={i * 90} />
                <small>
                  {tile.unit} · {t('median', 'mediana')}
                </small>
              </span>
              <MiniBars values={tile.values} color={tile.color} label={t(`Distribution of ${tile.label}`, `Distribuição de ${tile.label}`)} />
              <span className="tile__range mono">
                <span>{fixed(Math.min(...tile.values), 2)}</span>
                <span>n = {int(tile.values.length)}</span>
                <span>{fixed(Math.max(...tile.values), 2)}</span>
              </span>
            </Panel>
          ))}

        <Card
          family={F.flow}
          active={family}
          span={8}
          spanMd={12}
          hud
          icon={IconCompare}
          tag="Sankey"
          title={t('From fuel to cool flame', 'Do combustível à chama fria')}
          caption={t('The 227 CFI tests: fuel → diluent → what could be measured of the cool flame. Ribbon width is the number of tests.', 'Os 227 ensaios do CFI: combustível → diluente → o que foi possível medir da chama fria. A largura da fita é o número de ensaios.')}
        >
          <Sankey nodes={sankey.nodes} links={sankey.links} unit={t('tests', 'ensaios')} height={380} label={t('Flow of the CFI tests by fuel, diluent and cool-flame measurement', 'Fluxo dos ensaios do CFI por combustível, diluente e medida da chama fria')} />
        </Card>
        <Card family={F.part} active={family} span={4} spanMd={6} icon={IconAtom} tag={t('Core', 'Núcleo')} title={t('Rows and alerts', 'Linhas e alertas')} caption={t('Each dot stands for a slice of the database rows; the magenta dots are the share with a quality alert (enlarged to be visible).', 'Cada ponto representa uma fatia das linhas do banco; os pontos magenta são a proporção com alerta de qualidade (ampliada para ser visível).')} foot={[{ label: t('Rows', 'Linhas'), value: int(totalRows) }, { label: t('Alerts', 'Alertas'), value: overview.alertas.rows.length }]}>
          <Core share={Math.min(0.4, (overview.alertas.rows.length / Math.max(1, totalRows)) * 12)} />
        </Card>

        <Card family={F.relation} active={family} span={6} icon={IconScatter} tag={t('Scatter', 'Dispersão')} title={t('FLEX: conditions tested', 'FLEX: condições testadas')} caption={t('Oxygen × pressure, one point per test, colored by outcome.', 'Oxigênio × pressão, um ponto por ensaio, cor pelo desfecho.')}>
          <XYChart series={scatter} xLabel={t('Oxygen (mole fraction)', 'Oxigênio (fração molar)')} yLabel={t('Pressure (mmHg)', 'Pressão (mmHg)')} height={360} label={t('FLEX: scatter of oxygen by pressure, colored by outcome', 'FLEX: dispersão de oxigênio por pressão, cor por desfecho')} />
        </Card>
        <Card family={F.comparison} active={family} span={6} icon={IconGraph} tag={t('Layers', 'Camadas')} title={t('PSI-117: measured vs. model', 'PSI-117: medido × modelo')} caption={t('Measurement points, dashed model and the reported uncertainty capsule, by flame type.', 'Pontos de medição, modelo tracejado e a cápsula de incerteza informada, por tipo de chama.')}>
          <XYChart series={model} xLabel={t('Pressure (atm)', 'Pressão (atm)')} yLabel={t('Extinction diameter (mm)', 'Diâmetro de extinção (mm)')} zeroY height={360} label={t('PSI-117: extinction diameter by pressure, measurement and model', 'PSI-117: diâmetro de extinção por pressão, medição e modelo')} />
        </Card>

        <Card family={F.relation} active={family} span={6} icon={IconStars} tag={t('Isometric 3D', '3D isométrico')} title={t('CFI: pressure × initial droplet × extinction', 'CFI: pressão × gota inicial × extinção')} caption={t('Two axes on the floor and height as the measure: each stem is a test, the color is the fuel.', 'Dois eixos no chão e a altura como medida: cada haste é um ensaio, a cor é o combustível.')}>
          <Iso points={iso} xLabel={t('Pressure (atm)', 'Pressão (atm)')} zLabel="D0 (mm)" hLabel={t('Hot extinction (mm)', 'Extinção quente (mm)')} height={460} label={t('CFI in three dimensions: pressure, D0 and hot-flame extinction diameter', 'CFI em três dimensões: pressão, D0 e diâmetro de extinção da chama quente')} />
        </Card>
        <Card family={F.distribution} active={family} span={6} icon={IconPulse} tag="Ridgeline" title={t('CFI: hot extinction at each pressure', 'CFI: extinção quente em cada pressão')} caption={t('One density curve per pressure. Color follows the order of the pressures, from lowest to highest.', 'Uma curva de densidade por pressão. A cor acompanha a ordem das pressões, da menor à maior.')}>
          <Ridge groups={ridges} xLabel={t('Hot-flame extinction (mm)', 'Extinção da chama quente (mm)')} height={460} label={t('Distribution of the hot-flame extinction diameter by pressure', 'Distribuição do diâmetro de extinção da chama quente por pressão')} />
        </Card>

        <Card family={F.distribution} active={family} span={7} spanMd={12} icon={IconFlame} tag={t('Ranges', 'Faixas')} title={t('CFI: from the smallest to the largest extinction diameter', 'CFI: do menor ao maior diâmetro de extinção')} caption={t('The capsule runs from the minimum to the maximum at each pressure; the dot is the median. Pressures are separate conditions, so nothing is connected.', 'A cápsula vai do mínimo ao máximo em cada pressão; o ponto é a mediana. Pressões são condições separadas, por isso nada é ligado.')}>
          <XYChart series={ranges} xLabel={t('Pressure (atm)', 'Pressão (atm)')} yLabel={t('Extinction diameter (mm)', 'Diâmetro de extinção (mm)')} zeroY height={360} label={t('CFI: range and median of the extinction diameter by pressure and flame type', 'CFI: faixa e mediana do diâmetro de extinção por pressão e tipo de chama')} />
        </Card>
        <Card family={F.part} active={family} span={5} spanMd={12} icon={IconScan} tag={t('Matrix', 'Matriz')} title={t('CFI: experiment coverage', 'CFI: cobertura do experimento')} caption={t('Tests by fuel and pressure. Dashed cells were not tested.', 'Ensaios por combustível e pressão. Células tracejadas não foram ensaiadas.')}>
          <Heatmap rows={coverage.rows} cols={coverage.cols} value={(row, col) => coverage.counts.get(`${row}|${col}`) ?? null} unit={t('Tests', 'Ensaios')} height={360} label={t('Number of CFI tests by fuel and pressure', 'Número de ensaios do CFI por combustível e pressão')} />
        </Card>

        <Card family={F.comparison} active={family} span={6} icon={IconRuler} tag={t('Dumbbell', 'Halteres')} title={t('PSI-117: gap between measurement and model', 'PSI-117: distância entre medição e modelo')} caption={t('Circle: measurement. Diamond: model. The line is how far apart they are at each pressure.', 'Círculo: medição. Losango: modelo. O traço é o quanto se afastam em cada pressão.')}>
          <Dumbbell rows={gaps} aLabel={t('Measurement', 'Medição')} bLabel={t('Model', 'Modelo')} xLabel={t('Extinction diameter (mm)', 'Diâmetro de extinção (mm)')} height={360} label={t('PSI-117: measurement and model by pressure', 'PSI-117: medição e modelo por pressão')} />
        </Card>
        <Card family={F.comparison} active={family} span={3} spanMd={6} icon={IconSnowflake} tag={t('Gauge', 'Medidor')} title={t('Does the model fall within the range?', 'O modelo cai na faixa?')} caption={t('Pressures at which the model stays within the reported uncertainty.', 'Pressões em que o modelo fica dentro da incerteza informada.')}>
          <Gauge value={judged.filter((r) => r.modelo_na_faixa === true).length} total={judged.length} caption={t('pressures in range', 'pressões na faixa')} height={290} ticks={Math.max(12, judged.length * 6)} label={t('Pressures at which the model falls within the range', 'Pressões em que o modelo cai dentro da faixa')} />
        </Card>
        <Card family={F.part} active={family} span={3} spanMd={6} icon={IconChecklist} tag={t('Arcs', 'Arcos')} title={t('Alerts by investigation', 'Alertas por investigação')} caption={t('One ring per investigation; the length is the number of alerts.', 'Um anel por investigação; o comprimento é o número de alertas.')}>
          <Radial items={alertsByInv} centerLabel={t('alerts', 'alertas')} height={290} label={t('Quality alerts by investigation', 'Alertas de qualidade por investigação')} />
        </Card>

        {curves.length > 0 && (
          <Card family={F.relation} active={family} span={7} spanMd={12} icon={IconCounterflow} tag={t('Line + area', 'Linha + área')} title={t('PSI-117: oscillatory cool flame', 'PSI-117: chama fria oscilatória')} caption={t('Maximum temperature over time in the numerical model (simulated, not measured).', 'Temperatura máxima ao longo do tempo no modelo numérico (simulado, não medido).')}>
            <XYChart series={curves} xLabel={t('Time (s)', 'Tempo (s)')} yLabel={t('Maximum temperature (K)', 'Temperatura máxima (K)')} height={340} label={t('PSI-117: maximum model temperature over time', 'PSI-117: temperatura máxima do modelo ao longo do tempo')} />
          </Card>
        )}
        <Card family={F.comparison} active={family} span={5} spanMd={12} icon={IconDrop} tag={t('Grouped columns', 'Colunas agrupadas')} title={t('CFI: tests per month', 'CFI: ensaios por mês')} caption={t('2017 campaign on the ISS, by fuel.', 'Campanha de 2017 na ISS, por combustível.')}>
          <XYChart series={months} xLabel={t('Month', 'Mês')} yLabel={t('Tests', 'Ensaios')} height={340} label={t('CFI: number of tests by month and fuel', 'CFI: número de ensaios por mês e combustível')} />
        </Card>

        <Card family={F.distribution} active={family} span={8} spanMd={12} icon={IconLayers} tag={t('Strip plot', 'Faixa de pontos')} title={t('BASS-II: the oxygen level each material was tested at', 'BASS-II: em que oxigênio cada material foi testado')} caption={t('One point per test; the vertical line is the median. It shows coverage, not the burning limit.', 'Um ponto por teste; o traço vertical é a mediana. Mostra a cobertura, não o limite de queima.')}>
          <Strip groups={oxygen} xLabel={t('Initial O2 (% vol)', 'O2 inicial (% vol)')} height={Math.max(260, oxygen.length * 62 + 50)} label={t('BASS-II: initial O2 of each test, by material', 'BASS-II: O2 inicial de cada teste, por material')} />
        </Card>
        <Card family={F.comparison} active={family} span={4} spanMd={12} icon={IconPie} tag="Ranking" title={t('BASS-II: tests by material', 'BASS-II: testes por material')} caption={t('Count of tests, not a performance measure.', 'Contagem de ensaios, não medida de desempenho.')}>
          <BarList items={tested} label={t('BASS-II: number of tests by material', 'BASS-II: número de testes por material')} />
        </Card>

        <Card family={F.part} active={family} icon={IconDocument} tag={t('Waffle', 'Mosaico')} title={t('Files in dados/', 'Arquivos em dados/')} caption={t('One square per file, colored by status. Status always has a label, never color alone.', 'Um quadrado por arquivo, colorido pela situação. Estado sempre com rótulo, nunca só cor.')}>
          <Waffle
            label={t('Data files by status', 'Arquivos de dados por situação')}
            colors={STATUS_COLORS}
            height={96}
            columns={overview.fontes.rows.length}
            cells={[...overview.fontes.rows]
              .sort((a, b) => String(a.status).localeCompare(String(b.status)))
              .map((f) => ({ title: String(f.caminho).split('/').at(-1) ?? '', category: String(f.status), rows: [[t('Investigation', 'Investigação'), String(f.investigacao ?? '—')]] }))}
          />
        </Card>
      </div>
    </>
  )
}
