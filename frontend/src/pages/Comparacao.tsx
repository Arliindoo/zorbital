import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { queries } from '@/api/client'
import type { Row } from '@/api/types'
import { useScreen } from '@/assistant/store'
import { c12Comparison } from '@/charts/build'
import { Legend } from '@/charts/kit'
import { legendItems } from '@/charts/legend'
import { XYChart } from '@/charts/XYChart'
import { DataTable } from '@/components/DataTable'
import { CheckboxGroup, RangeFilter, Toggle } from '@/components/filters'
import { SidebarFilters } from '@/components/Layout'
import { Markdown } from '@/components/Markdown'
import { PageHeader } from '@/components/PageHeader'
import { Callout, Caption, Expander, Grid, Metric, Metrics, Section } from '@/components/ui'
import { IconFlame, IconInfo, IconLink, IconSnowflake } from '@/icons'
import { compareCells, extent, groupBy, inRangeOrNull, median, numbers, type Range, round, uniqueSorted } from '@/lib/data'
import { flamesLong } from '@/lib/flames'
import { t } from '@/lib/i18n'
import { cautions } from '@/lib/text'
import { usePageState } from '@/lib/usePageState'

const key = (flame: unknown, pressure: unknown) => `${String(flame)}\u0000${String(pressure)}`

export default function Comparacao() {
  const { data } = useSuspenseQuery(queries.comparison())
  const { psi117: psi, cfi: tests, correspondencia: links, condicoes, investigacoes } = data

  const diluents = useMemo(() => uniqueSorted(tests.rows.map((r) => r.diluente)), [tests])
  const d0Bounds = useMemo(() => extent(tests.rows.map((r) => r.d0_mm)), [tests])
  const [diluent, setDiluent] = usePageState<string[]>('cmp:diluente', () =>
    diluents.includes('Nitrogênio') ? ['Nitrogênio'] : diluents,
  )
  const [d0, setD0] = usePageState<Range | null>('cmp:d0', d0Bounds)
  const [complete, setComplete] = usePageState('cmp:completa', false)

  const view = useMemo(
    () =>
      tests.rows.filter(
        (r) => diluent.includes(r.diluente) && inRangeOrNull(r.d0_mm, d0) && (!complete || r.analise_completa === true),
      ),
    [tests, diluent, d0, complete],
  )
  // um ponto por ensaio e por chama, inclusive sem valor (a tabela conta os ensaios sem extinção)
  const long = useMemo(() => flamesLong(view, ['teste_id', 'pressao_atm', 'd0_mm'], { dropEmpty: false }), [view])
  const figure = useMemo(() => c12Comparison(long, psi.rows), [long, psi])
  // uma legenda só para os dois painéis: esconder uma série vale para ambos
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (!next.delete(name)) next.add(name)
      return next
    })
  const legend = legendItems(figure.panels.reduce((best, panel) => (panel.series.length > best.length ? panel.series : best), figure.panels[0]!.series))

  // tabela lado a lado, recalculada com os filtros (junção completa por chama e pressão)
  const table = useMemo(() => {
    const cfiAgg = new Map<string, Row>()
    for (const [k, list] of groupBy(long, (r) => key(r.tipo_chama, r.pressao_atm))) {
      const values = numbers(list.map((r) => r.dext_mm))
      cfiAgg.set(k, {
        tipo_chama: list[0]!.tipo_chama ?? null,
        pressao_atm: list[0]!.pressao_atm ?? null,
        cfi_ensaios: list.length,
        cfi_com_valor: values.length,
        cfi_mediana_mm: round(median(values), 3),
        cfi_min_mm: values.length ? Math.min(...values) : null,
        cfi_max_mm: values.length ? Math.max(...values) : null,
      })
    }
    const rows: Row[] = []
    const seen = new Set<string>()
    for (const p of psi.rows) {
      const k = key(p.tipo_chama, p.pressao_atm)
      seen.add(k)
      const c = cfiAgg.get(k) ?? {}
      rows.push({
        tipo_chama: p.tipo_chama,
        pressao_atm: p.pressao_atm,
        medido_mm: p.medido_mm,
        modelo_mm: p.modelo_mm,
        limite_inferior_mm: p.limite_inferior_mm,
        limite_superior_mm: p.limite_superior_mm,
        cfi_ensaios: c.cfi_ensaios ?? null,
        cfi_com_valor: c.cfi_com_valor ?? null,
        cfi_mediana_mm: c.cfi_mediana_mm ?? null,
        cfi_min_mm: c.cfi_min_mm ?? null,
        cfi_max_mm: c.cfi_max_mm ?? null,
      })
    }
    for (const [k, c] of cfiAgg) {
      if (seen.has(k)) continue
      rows.push({ medido_mm: null, modelo_mm: null, limite_inferior_mm: null, limite_superior_mm: null, ...c })
    }
    return rows
      .map((r): Row => {
        const model = r.modelo_mm as number | null
        const med = r.cfi_mediana_mm as number | null
        const lo = r.limite_inferior_mm as number | null
        const hi = r.limite_superior_mm as number | null
        return {
          ...r,
          modelo_menos_cfi_mm: model !== null && med !== null ? round(model - med, 3) : null,
          cfi_na_faixa_psi117: lo !== null && med !== null && hi !== null ? med >= lo && med <= hi : null,
        }
      })
      .sort((a, b) => compareCells(a.tipo_chama ?? null, b.tipo_chama ?? null) || compareCells(a.pressao_atm ?? null, b.pressao_atm ?? null))
  }, [long, psi])

  const sameTest = links.rows.filter((r) => r.situacao.startsWith('mesmo ensaio'))
  const oneAtm = links.rows.filter((r) => r.tabela_psi117 === 'extinção a 1 atm')
  const byPressure = links.rows.filter((r) => r.tabela_psi117 === 'extinção por pressão')
  const distinct = (values: unknown[]) => new Set(values.filter((v) => v !== null)).size
  const psiPressures = new Set(psi.rows.map((r) => r.pressao_atm))
  const oneAtmFromCfi = distinct(oneAtm.filter((r) => r.cfi_teste_id !== null).map((r) => r.d0_mm))
  const oneAtmDroplets = distinct(oneAtm.map((r) => r.d0_mm))
  const byPressureFromCfi = byPressure.filter((r) => r.cfi_teste_id !== null).length
  const shared = distinct(long.filter((r) => r.dext_mm !== null && psiPressures.has(r.pressao_atm as number)).map((r) => r.pressao_atm))

  useScreen({
    pagina: 'comparacao',
    titulo: t('PSI-117 × CFI comparison', 'Comparação PSI-117 × CFI'),
    escopo: ['PSI-117', 'PSI-39'],
    filtros: {
      [t('CFI diluent', 'diluente do CFI')]: diluent,
      [t('CFI D0 (mm)', 'D0 do CFI (mm)')]: d0,
      [t('completed analysis only', 'só análise concluída')]: complete,
    },
    graficos: [
      t(
        'Two panels (hot flame, cool flame): pressure (x) × extinction diameter (y). CFI: tests as blue points and median as blue squares; PSI-117: measurement as orange diamonds, dashed model, light uncertainty band (cool flame only).',
        'Dois painéis (chama quente, chama fria): pressão (x) × diâmetro de extinção (y). CFI: ensaios em pontos azuis e mediana em quadrados azuis; PSI-117: medição em losangos laranja, modelo tracejado, faixa de incerteza clara (só chama fria).',
      ),
      t(
        'Side-by-side table by pressure: PSI-117 measured, model and range; CFI median, minimum, maximum.',
        'Tabela lado a lado por pressão: PSI-117 medido, modelo e faixa; CFI mediana, mínimo, máximo.',
      ),
    ],
    dados: table,
    tabela_banco: 'v_extincao_c12_comparacao',
  })

  return (
    <>
      <PageHeader eyebrow={t(['Comparison', 'n-dodecane', 'Ground × ISS'], ['Comparação', 'n-dodecano', 'Solo × ISS'])} title="PSI-117 × CFI">
        {t(
          'Extinction diameter of n-dodecane droplets by pressure: ground model and measurements next to the tests on the ISS.',
          'Diâmetro de extinção de gotas de n-dodecano por pressão: modelo e medições em solo ao lado dos ensaios na ISS.',
        )}
      </PageHeader>
      <Callout tone="warning" icon={IconLink}>
        {t(
          <>
            <strong>This is not an independent validation.</strong> The PSI-117 measurements come from flight tests in the
            FLEX apparatus, the same one used by CFI: in the 1 atm table, {oneAtmFromCfi} of {oneAtmDroplets} measured
            droplets are CFI tests. In the by-pressure table, {byPressureFromCfi} of {byPressure.length} points match an
            individual test; the others may be averages or some other processing. What this page shows is{' '}
            <strong>how far the PSI-117 model is from the full set of flights</strong>, not a second experimental opinion.
          </>,
          <>
            <strong>Não é uma validação independente.</strong> As medições do PSI-117 vêm de ensaios de voo no aparelho do
            FLEX, o mesmo do CFI: na tabela de 1 atm, {oneAtmFromCfi} de {oneAtmDroplets} gotas medidas são ensaios do CFI.
            Na tabela por pressão, {byPressureFromCfi} de {byPressure.length} pontos coincidem com um ensaio individual; os
            outros podem ser médias ou outro tratamento. O que esta página mostra é{' '}
            <strong>quanto o modelo do PSI-117 se afasta do conjunto completo de voos</strong>, não uma segunda opinião
            experimental.
          </>,
        )}
      </Callout>
      {condicoes && (
        <Caption>
          {t(
            <>
              Conditions stated by PSI-117 for this table: D0 ≈ {String(condicoes.d0_mm_texto)} mm,{' '}
              {String(condicoes.pressao_atm_texto)} atm, XO2 = {String(condicoes.xo2_texto)}, XN2 = {String(condicoes.xn2_texto)}.
              The filters start at these conditions.
            </>,
            <>
              Condições declaradas pelo PSI-117 para esta tabela: D0 ≈ {String(condicoes.d0_mm_texto)} mm,{' '}
              {String(condicoes.pressao_atm_texto)} atm, XO2 = {String(condicoes.xo2_texto)}, XN2 = {String(condicoes.xn2_texto)}.
              Os filtros começam nessas condições.
            </>,
          )}
        </Caption>
      )}

      <SidebarFilters title={t('CFI tests', 'Ensaios do CFI')}>
        <CheckboxGroup label={t('Diluent', 'Diluente')} options={diluents} value={diluent} onChange={setDiluent} />
        <RangeFilter label="D0 (mm)" bounds={d0Bounds} value={d0} onChange={setD0} digits={2} />
        <Toggle label={t('Completed analysis only', 'Só análise concluída')} checked={complete} onChange={setComplete} />
      </SidebarFilters>

      <Metrics>
        <Metric label={t('CFI tests in filter', 'Ensaios do CFI no filtro')} value={view.length} />
        <Metric label={t('Pressures with both studies', 'Pressões com os dois estudos')} value={shared} />
        <Metric label={t('PSI-117 measurements that are CFI tests', 'Medições do PSI-117 que são ensaios do CFI')} value={distinct(sameTest.map((r) => r.cfi_teste_id))} />
        <Metric label={t('Discrepancies between the sources', 'Divergências entre as fontes')} value={links.rows.filter((r) => r.situacao.includes('diferente')).length} />
      </Metrics>

      <Section
        kind="chart"
        icon={IconFlame}
        tag={t('same scale in both panels', 'mesma escala nos dois painéis')}
        title={t('Extinction diameter by pressure', 'Diâmetro de extinção por pressão')}
        label={t('Extinction diameter by pressure in two panels, CFI and PSI-117', 'Diâmetro de extinção por pressão em dois painéis, CFI e PSI-117')}
      >
        <div className="chart">
          <Legend items={legend} hidden={hidden} onToggle={toggle} />
        </div>
        <Grid>
          {figure.panels.map(({ flame, series }) => (
            <div key={flame} style={{ '--span': 6 } as React.CSSProperties}>
              <XYChart
                series={series}
                title={flame}
                xLabel={t('Pressure (atm)', 'Pressão (atm)')}
                yLabel={t('Extinction diameter (mm)', 'Diâmetro de extinção (mm)')}
                yDomain={figure.yDomain}
                height={420}
                legend={false}
                hidden={hidden}
                onToggle={toggle}
                label={t(`${flame}: extinction diameter by pressure, CFI and PSI-117`, `${flame}: diâmetro de extinção por pressão, CFI e PSI-117`)}
              />
            </div>
          ))}
        </Grid>
      <Caption>
        {t(
          'Blue points: each CFI test in the filter · blue squares: CFI median by pressure (n in the tooltip) · diamonds: PSI-117 measurement · dashed: PSI-117 model · light band: uncertainty reported by PSI-117 (cool flame only). Tests in which the cool flame consumed the droplet without visible extinction do not appear in the cool-flame panel.',
          'Pontos azuis: cada ensaio do CFI no filtro · quadrados azuis: mediana do CFI por pressão (n no tooltip) · losangos: medição do PSI-117 · tracejado: modelo do PSI-117 · faixa clara: incerteza informada pelo PSI-117 (só chama fria). Ensaios em que a chama fria consumiu a gota sem extinção visível não aparecem no painel da chama fria.',
        )}
      </Caption>
      </Section>

      <Section title={t('Side by side', 'Lado a lado')} kind="table" tag="v_extincao_c12_comparacao" icon={IconSnowflake} flush>
        <DataTable
          rows={table}
          filename="psi117_x_cfi"
          config={{
            medido_mm: { label: t('PSI-117 measured (mm)', 'PSI-117 medido (mm)'), digits: 2 },
            modelo_mm: { label: t('PSI-117 model (mm)', 'PSI-117 modelo (mm)'), digits: 2 },
            limite_inferior_mm: { label: t('Range min. (mm)', 'Faixa mín. (mm)'), digits: 2 },
            limite_superior_mm: { label: t('Range max. (mm)', 'Faixa máx. (mm)'), digits: 2 },
            cfi_mediana_mm: { label: t('CFI median (mm)', 'CFI mediana (mm)'), digits: 3 },
            modelo_menos_cfi_mm: { label: t('Model − CFI (mm)', 'Modelo − CFI (mm)'), digits: 3, signed: true },
            cfi_na_faixa_psi117: t('CFI within the PSI-117 range', 'CFI na faixa do PSI-117'),
          }}
        />
      </Section>

      <Expander title={t(`Point-by-point correspondence (${links.rows.length})`, `Correspondência ponto a ponto (${links.rows.length})`)} icon={IconLink}>
        <Caption>
          {t(
            'Each PSI-117 measurement and the CFI test it appears to come from. In the 1 atm table the test is identified by D0 and by the hot-flame diameter, which match exactly.',
            'Cada medição do PSI-117 e o ensaio do CFI de onde ela parece vir. Na tabela de 1 atm o ensaio é identificado pelo D0 e pelo diâmetro da chama quente, que batem exatamente.',
          )}
        </Caption>
        <DataTable rows={links.rows} columns={links.columns} hide={['fonte_arquivo']} filename="psi117_cfi_correspondencia" />
      </Expander>

      <Expander title={t('What not to conclude from this comparison', 'O que não concluir desta comparação')} icon={IconInfo}>
        {investigacoes.map((inv) => (
          <div key={inv.id}>
            <strong>{inv.nome}</strong>
            <Markdown>{cautions(inv.cautelas)}</Markdown>
          </div>
        ))}
      </Expander>
    </>
  )
}
