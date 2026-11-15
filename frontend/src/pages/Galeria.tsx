import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { queries } from '@/api/client'
import { useScreen } from '@/assistant/store'
import { BarList } from '@/charts/BarList'
import { measuredVsModel, scatterBy, xyLines } from '@/charts/build'
import { DOMAIN_ORDER, domainColors, FLAME, SERIES, STATUS } from '@/charts/colors'
import { Dumbbell } from '@/charts/Dumbbell'
import { Gauge } from '@/charts/Gauge'
import { Heatmap } from '@/charts/Heatmap'
import { Iso } from '@/charts/Iso'
import { MiniBars } from '@/charts/MiniBars'
import { Orb } from '@/charts/Orb'
import { Radial } from '@/charts/Radial'
import { Ridge } from '@/charts/Ridge'
import { Sankey, type SankeyLink, type SankeyNode } from '@/charts/Sankey'
import { Strip } from '@/charts/Strip'
import { Waffle } from '@/charts/Waffle'
import { XYChart, type XYSeries } from '@/charts/XYChart'
import { Segmented } from '@/components/filters'
import { PageHeader } from '@/components/PageHeader'
import { Panel, type PanelProps } from '@/components/ui'
import { CountUp } from '@/fx/CountUp'
import { useInView } from '@/fx/useInView'
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
} from '@/icons'
import { groupBy, median, numbers, uniqueSorted } from '@/lib/data'
import { fixed, g, int } from '@/lib/format'

const FAMILIES = ['Todos', 'Fluxo', 'Relação', 'Distribuição', 'Comparação', 'Parte e todo'] as const
type Family = (typeof FAMILIES)[number]

const STATUS_COLORS: Record<string, string> = {
  Carregado: STATUS.ok,
  'Não carregado': STATUS.warn,
  'Duplicata exata': SERIES[1],
  Documentação: STATUS.info,
  'Não reconhecido': STATUS.bad,
}

function Card({ family, active, ...panel }: PanelProps & { family: Exclude<Family, 'Todos'>; active: Family }) {
  if (active !== 'Todos' && active !== family) return null
  return <Panel kind="chart" {...panel} tag={panel.tag ?? family} />
}

/** O núcleo de pontos como carta: proporção de linhas com alerta. */
function Core({ share }: { share: number }) {
  const [ref, on] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className="chart" data-on={on} role="img" aria-label="Núcleo de pontos com a proporção de alertas em destaque">
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
  const [family, setFamily] = useState<Family>('Todos')
  const tests = cfi.ensaios.rows
  const flames = domainColors('tipo_chama')
  const fuels = domainColors('combustivel')
  const materials = domainColors('material_categoria')

  // ---- fluxo: combustível → diluente → o que foi medido da chama fria
  const sankey = useMemo(() => {
    const outcome = (r: (typeof tests)[number]) =>
      r.dext_fria_zero_na_fonte === true ? 'Sem extinção fria visível' : r.dext_fria_mm !== null ? 'Extinção fria medida' : 'Sem medida da chama fria'
    const fuelNames = DOMAIN_ORDER.combustivel.filter((f) => tests.some((r) => r.combustivel === f))
    const diluents = uniqueSorted(tests.map((r) => r.diluente))
    const outcomes = ['Extinção fria medida', 'Sem extinção fria visível', 'Sem medida da chama fria'].filter((o) => tests.some((r) => outcome(r) === o))
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
        labels: { teste_id: 'Ensaio', combustivel: 'Combustível' },
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
          title: `Ensaio ${r.teste_id}`,
          tip: [['Combustível', r.combustivel]] as const,
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
      ['dext_quente_mm', 'Chama quente', flames['Chama quente']!],
      ['dext_fria_mm', 'Chama fria', flames['Chama fria']!],
    ] as const) {
      const byPressure = [...groupBy(tests.filter((r) => typeof r[column] === 'number' && (r[column] as number) > 0), (r) => r.pressao_atm as number).entries()].sort((a, b) => a[0] - b[0])
      out.push({
        name: `${name} · mín–máx`,
        color,
        type: 'band',
        data: byPressure.map(([p, list]) => {
          const values = numbers(list.map((r) => r[column]))
          return { x: g(p), y: null, lo: Math.min(...values), hi: Math.max(...values), tip: [['Ensaios', String(values.length)]] as const }
        }),
      })
      out.push({
        name: `${name} · mediana`,
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
            .map((r) => ({ value: r.o2_inicial_pct as number, title: `Teste ${r.teste_id}`, tip: [['Geometria', r.geometria]] as const })),
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
    titulo: 'Galeria de gráficos',
    graficos: [
      'Sankey: combustível → diluente → medida da chama fria (ensaios do CFI).',
      'Dispersão FLEX, medido × modelo do PSI-117, 3D isométrico do CFI, curvas de densidade por pressão, matriz de cobertura, faixas mín–máx, halteres, arcos de alertas, mosaico de arquivos e ranking de materiais.',
    ],
  })

  const tiles = [
    { label: 'D0 das gotas · CFI', unit: 'mm', values: numbers(tests.map((r) => r.d0_mm)), color: 'var(--s4)' },
    { label: 'Extinção quente · CFI', unit: 'mm', values: numbers(tests.map((r) => r.dext_quente_mm)), color: 'var(--s3)' },
    { label: 'O2 inicial · BASS-II', unit: '% vol', values: numbers(bassRows.map((r) => r.o2_inicial_pct)), color: 'var(--s1)' },
    { label: 'ΔCO2 · BASS-II', unit: 'p.p.', values: numbers(bassRows.map((r) => r.delta_co2_pp)), color: 'var(--s2)' },
  ]

  return (
    <>
      <PageHeader eyebrow={['Ferramenta', 'Kit de visualização', 'SVG']} title="Galeria" aside="de gráficos">
        Todos os tipos de gráfico do sistema, desenhados em SVG e alimentados pelos dados reais das cinco investigações. Passe
        o ponteiro para ler os valores; clique na legenda para esconder uma série.
      </PageHeader>

      <Segmented label="Família de gráfico" options={FAMILIES} value={family} onChange={setFamily} />

      <div className="grid" key={family}>
        {(family === 'Todos' || family === 'Distribuição') &&
          tiles.map((tile, i) => (
            <Panel key={tile.label} span={3} spanMd={6} kind="metric" label={tile.label} className="tile">
              <span className="label">{tile.label}</span>
              <span className="metric__value">
                <CountUp value={median([...tile.values]) ?? 0} digits={2} delay={i * 90} />
                <small>{tile.unit} · mediana</small>
              </span>
              <MiniBars values={tile.values} color={tile.color} label={`Distribuição de ${tile.label}`} />
              <span className="tile__range mono">
                <span>{fixed(Math.min(...tile.values), 2)}</span>
                <span>n = {int(tile.values.length)}</span>
                <span>{fixed(Math.max(...tile.values), 2)}</span>
              </span>
            </Panel>
          ))}

        <Card
          family="Fluxo"
          active={family}
          span={8}
          spanMd={12}
          hud
          icon={IconCompare}
          tag="Sankey"
          title="Do combustível à chama fria"
          caption="Os 227 ensaios do CFI: combustível → diluente → o que foi possível medir da chama fria. A largura da fita é o número de ensaios."
        >
          <Sankey nodes={sankey.nodes} links={sankey.links} unit="ensaios" height={380} label="Fluxo dos ensaios do CFI por combustível, diluente e medida da chama fria" />
        </Card>
        <Card family="Parte e todo" active={family} span={4} spanMd={6} icon={IconAtom} tag="Núcleo" title="Linhas e alertas" caption="Cada ponto representa uma fatia das linhas do banco; os pontos magenta são a proporção com alerta de qualidade (ampliada para ser visível)." foot={[{ label: 'Linhas', value: int(totalRows) }, { label: 'Alertas', value: overview.alertas.rows.length }]}>
          <Core share={Math.min(0.4, (overview.alertas.rows.length / Math.max(1, totalRows)) * 12)} />
        </Card>

        <Card family="Relação" active={family} span={6} icon={IconScatter} tag="Dispersão" title="FLEX: condições testadas" caption="Oxigênio × pressão, um ponto por ensaio, cor pelo desfecho.">
          <XYChart series={scatter} xLabel="Oxigênio (fração molar)" yLabel="Pressão (mmHg)" height={360} label="FLEX: dispersão de oxigênio por pressão, cor por desfecho" />
        </Card>
        <Card family="Comparação" active={family} span={6} icon={IconGraph} tag="Camadas" title="PSI-117: medido × modelo" caption="Pontos de medição, modelo tracejado e a cápsula de incerteza informada, por tipo de chama.">
          <XYChart series={model} xLabel="Pressão (atm)" yLabel="Diâmetro de extinção (mm)" zeroY height={360} label="PSI-117: diâmetro de extinção por pressão, medição e modelo" />
        </Card>

        <Card family="Relação" active={family} span={6} icon={IconStars} tag="3D isométrico" title="CFI: pressão × gota inicial × extinção" caption="Dois eixos no chão e a altura como medida: cada haste é um ensaio, a cor é o combustível.">
          <Iso points={iso} xLabel="Pressão (atm)" zLabel="D0 (mm)" hLabel="Extinção quente (mm)" height={460} label="CFI em três dimensões: pressão, D0 e diâmetro de extinção da chama quente" />
        </Card>
        <Card family="Distribuição" active={family} span={6} icon={IconPulse} tag="Ridgeline" title="CFI: extinção quente em cada pressão" caption="Uma curva de densidade por pressão. A cor acompanha a ordem das pressões, da menor à maior.">
          <Ridge groups={ridges} xLabel="Extinção da chama quente (mm)" height={460} label="Distribuição do diâmetro de extinção da chama quente por pressão" />
        </Card>

        <Card family="Distribuição" active={family} span={7} spanMd={12} icon={IconFlame} tag="Faixas" title="CFI: do menor ao maior diâmetro de extinção" caption="A cápsula vai do mínimo ao máximo em cada pressão; o ponto é a mediana. Pressões são condições separadas, por isso nada é ligado.">
          <XYChart series={ranges} xLabel="Pressão (atm)" yLabel="Diâmetro de extinção (mm)" zeroY height={360} label="CFI: faixa e mediana do diâmetro de extinção por pressão e tipo de chama" />
        </Card>
        <Card family="Parte e todo" active={family} span={5} spanMd={12} icon={IconScan} tag="Matriz" title="CFI: cobertura do experimento" caption="Ensaios por combustível e pressão. Células tracejadas não foram ensaiadas.">
          <Heatmap rows={coverage.rows} cols={coverage.cols} value={(row, col) => coverage.counts.get(`${row}|${col}`) ?? null} unit="Ensaios" height={360} label="Número de ensaios do CFI por combustível e pressão" />
        </Card>

        <Card family="Comparação" active={family} span={6} icon={IconRuler} tag="Halteres" title="PSI-117: distância entre medição e modelo" caption="Círculo: medição. Losango: modelo. O traço é o quanto se afastam em cada pressão.">
          <Dumbbell rows={gaps} aLabel="Medição" bLabel="Modelo" xLabel="Diâmetro de extinção (mm)" height={360} label="PSI-117: medição e modelo por pressão" />
        </Card>
        <Card family="Comparação" active={family} span={3} spanMd={6} icon={IconSnowflake} tag="Medidor" title="O modelo cai na faixa?" caption="Pressões em que o modelo fica dentro da incerteza informada.">
          <Gauge value={judged.filter((r) => r.modelo_na_faixa === true).length} total={judged.length} caption="pressões na faixa" height={290} ticks={Math.max(12, judged.length * 6)} label="Pressões em que o modelo cai dentro da faixa" />
        </Card>
        <Card family="Parte e todo" active={family} span={3} spanMd={6} icon={IconChecklist} tag="Arcos" title="Alertas por investigação" caption="Um anel por investigação; o comprimento é o número de alertas.">
          <Radial items={alertsByInv} centerLabel="alertas" height={290} label="Alertas de qualidade por investigação" />
        </Card>

        {curves.length > 0 && (
          <Card family="Relação" active={family} span={7} spanMd={12} icon={IconCounterflow} tag="Linha + área" title="PSI-117: chama fria oscilatória" caption="Temperatura máxima ao longo do tempo no modelo numérico (simulado, não medido).">
            <XYChart series={curves} xLabel="Tempo (s)" yLabel="Temperatura máxima (K)" height={340} label="PSI-117: temperatura máxima do modelo ao longo do tempo" />
          </Card>
        )}
        <Card family="Comparação" active={family} span={5} spanMd={12} icon={IconDrop} tag="Colunas agrupadas" title="CFI: ensaios por mês" caption="Campanha de 2017 na ISS, por combustível.">
          <XYChart series={months} xLabel="Mês" yLabel="Ensaios" height={340} label="CFI: número de ensaios por mês e combustível" />
        </Card>

        <Card family="Distribuição" active={family} span={8} spanMd={12} icon={IconLayers} tag="Faixa de pontos" title="BASS-II: em que oxigênio cada material foi testado" caption="Um ponto por teste; o traço vertical é a mediana. Mostra a cobertura, não o limite de queima.">
          <Strip groups={oxygen} xLabel="O2 inicial (% vol)" height={Math.max(260, oxygen.length * 62 + 50)} label="BASS-II: O2 inicial de cada teste, por material" />
        </Card>
        <Card family="Comparação" active={family} span={4} spanMd={12} icon={IconPie} tag="Ranking" title="BASS-II: testes por material" caption="Contagem de ensaios, não medida de desempenho.">
          <BarList items={tested} label="BASS-II: número de testes por material" />
        </Card>

        <Card family="Parte e todo" active={family} icon={IconDocument} tag="Mosaico" title="Arquivos em dados/" caption="Um quadrado por arquivo, colorido pela situação. Estado sempre com rótulo, nunca só cor.">
          <Waffle
            label="Arquivos de dados por situação"
            colors={STATUS_COLORS}
            height={96}
            columns={overview.fontes.rows.length}
            cells={[...overview.fontes.rows]
              .sort((a, b) => String(a.status).localeCompare(String(b.status)))
              .map((f) => ({ title: String(f.caminho).split('/').at(-1) ?? '', category: String(f.status), rows: [['Investigação', String(f.investigacao ?? '—')]] }))}
          />
        </Card>
      </div>
    </>
  )
}
