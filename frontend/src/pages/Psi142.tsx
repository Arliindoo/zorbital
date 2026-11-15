import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { lazy, useMemo, useState } from 'react'
import { queries } from '@/api/client'
import type { Psi142Point, Psi142Set } from '@/api/types'
import { useScreen } from '@/assistant/store'
import { xyLines } from '@/charts/build'
import { XYChart } from '@/charts/XYChart'
import { DataTable } from '@/components/DataTable'
import { RadioList, Toggle } from '@/components/filters'
import { AlertsTable, InvestigationHeader } from '@/components/investigation'
import { SidebarFilters } from '@/components/Layout'
import { Loading } from '@/components/Loading'
import { SimFrame, ViewSwitch } from '@/components/StudyView'
import { Badge, Callout, Caption, Code, Expander, Grid, Section } from '@/components/ui'
import { IconCounterflow, IconDocument } from '@/icons'
import { compareCells, omit, uniqueInOrder } from '@/lib/data'
import { t } from '@/lib/i18n'
import { usePageState } from '@/lib/usePageState'
import { useStudyView } from '@/lib/useStudyView'

// a cena 3D só é baixada quando alguém abre a vista de simulação
const Psi142Sim = lazy(() => import('@/sim/views/Psi142Sim'))

const label = (s: Psi142Set) => `${s.conjunto_id} · ${s.descricao_planilha || s.descricao_csv || ''}`

function Charts({ points, suspect }: { points: Psi142Point[]; suspect: string[] }) {
  const [showSuspect, setShowSuspect] = useState(false)
  const plotted = suspect.length && !showSuspect ? points.filter((p) => !suspect.includes(p.serie)) : points
  // um gráfico por grandeza no eixo y (o conjunto 5 mistura sinal de PLIF e temperatura)
  const figures = useMemo(
    () =>
      uniqueInOrder(plotted.map((p) => p.y_nome)).map((yName) => {
        const rows = plotted
          .filter((p) => p.y_nome === yName)
          .sort((a, b) => compareCells(a.serie, b.serie) || a.x - b.x)
        const xName = rows[0]!.x_nome
        // perfis espaciais (distância, posição) são curvas contínuas: só linha, sem marcadores
        const profile = rows.some((p) => /distance|location/i.test(p.x_nome))
        return {
          yName,
          xName,
          count: rows.length,
          series: xyLines(rows, { x: 'x', y: 'y', series: 'serie', markers: !profile }),
        }
      }),
    [plotted],
  )
  return (
    <>
      {suspect.length > 0 && (
        <>
          <Toggle
            label={t(`Include in the chart the series with a suspect axis (${suspect.join(', ')})`, `Incluir no gráfico as séries com eixo suspeito (${suspect.join(', ')})`)}
            checked={showSuspect}
            onChange={setShowSuspect}
          />
          {!showSuspect && <Caption>{t(`Not in the chart: ${suspect.join(', ')}. The points remain in the table below.`, `Fora do gráfico: ${suspect.join(', ')}. Os pontos continuam na tabela abaixo.`)}</Caption>}
        </>
      )}
      <Grid>
        {figures.map(({ yName, xName, series, count }) => (
          <Section
            key={yName}
            span={figures.length > 1 ? 6 : 12}
            kind="chart"
            icon={IconCounterflow}
            tag={t(`${count} points`, `${count} pontos`)}
            title={yName}
            caption={t(`As a function of ${xName}, one line per series.`, `Em função de ${xName}, uma linha por série.`)}
          >
            <XYChart
              series={series}
              xLabel={xName}
              yLabel={yName}
              height={420}
              label={t(`${yName} as a function of ${xName}, one line per series`, `${yName} em função de ${xName}, uma linha por série`)}
            />
          </Section>
        ))}
      </Grid>
    </>
  )
}

export default function Psi142() {
  const { data } = useSuspenseQuery(queries.psi142())
  const { investigacao: inv, conjuntos, alertas, total_pontos } = data
  const ids = conjuntos.rows.map((s) => s.conjunto_id)
  const [cid, setCid] = usePageState<number>('psi142:conjunto', ids[0] ?? 0)
  const chosen = conjuntos.rows.find((s) => s.conjunto_id === cid) ?? conjuntos.rows[0]!
  const points = useQuery(queries.psi142Set(chosen.conjunto_id))
  const view = points.data?.rows ?? []
  const [mode, setMode] = useStudyView()
  const [simText, setSimText] = useState('')

  // alertas que citam este conjunto ("conjunto 3", "conjuntos 2, 3 e 5"); são poucos, sem memo
  const pattern = new RegExp(String.raw`conjuntos? (?:[\d, ]*\b${chosen.conjunto_id}\b)`)
  const found = alertas.rows.filter((a) => a.teste_id && pattern.test(a.teste_id))
  // séries com eixo suspeito (colunas trocadas na fonte) esticam o eixo e escondem as válidas:
  // ficam de fora do gráfico por padrão, com aviso
  const suspect = useMemo(
    () =>
      [
        ...new Set(
          found
            .filter((a) => a.tipo === 'eixo_suspeito' && a.teste_id?.includes(' · '))
            .map((a) => a.teste_id!.split(' · ').slice(1).join(' · ')),
        ),
      ].sort(),
    [found],
  )

  useScreen({
    pagina: 'psi142',
    titulo: inv.nome,
    investigacao: 'PSI-142',
    filtros: { [t('set', 'conjunto')]: label(chosen) },
    graficos:
      mode === 'simulacao'
        ? [simText]
        : uniqueInOrder(view.map((p) => p.y_nome)).map((y) => {
            const x = view.find((p) => p.y_nome === y)!.x_nome
            return t(`${y} as a function of ${x}, one line per series`, `${y} em função de ${x}, uma linha por série`)
          }),
    dados: points.data ? omit(view, ['fonte_arquivo']) : null,
    tabela_banco: 'psi142_pontos',
  })

  const dashboard = (
    <>
      <Section title={label(chosen)} icon={IconDocument} tag={t(`set ${chosen.conjunto_id} of ${ids.length}`, `conjunto ${chosen.conjunto_id} de ${ids.length}`)} caption={chosen.publicacao || undefined}>
        <div className="meta-row">
          {chosen.figura && <Badge>{/^\d/.test(chosen.figura) ? t(`Figure ${chosen.figura}`, `Figura ${chosen.figura}`) : chosen.figura}</Badge>}
          {chosen.doi && (
            <a href={chosen.doi} target="_blank" rel="noreferrer noopener" className="caption">
              DOI {chosen.doi.split('doi.org/').at(-1)}
            </a>
          )}
        </div>
        {chosen.descricao_csv && chosen.descricao_csv !== chosen.descricao_planilha && <Caption>{t(`Description in the CSV: ${chosen.descricao_csv}`, `Descrição no CSV: ${chosen.descricao_csv}`)}</Caption>}
        {found.map((a, i) => (
          <Callout key={i} tone="warning">
            {a.detalhe}
            <br />
            <Code>{a.valor_original}</Code>
          </Callout>
        ))}
        <Caption>
          {t(
            'Points digitized from the published figures: the precision is that of the digitization. Limits in counterflow are strain rates (1/s), not droplet diameters.',
            'Pontos digitalizados das figuras publicadas: a precisão é a da digitalização. Limites em contrafluxo são taxas de estiramento (1/s), não diâmetros de gota.',
          )}
        </Caption>
      </Section>
      {points.isPending ? (
        <Loading label={t('Loading the points of the set…', 'Carregando os pontos do conjunto…')} />
      ) : points.isError ? (
        <Callout tone="error">{t(`Could not load the points: ${points.error.message}`, `Não foi possível carregar os pontos: ${points.error.message}`)}</Callout>
      ) : (
        <Charts key={chosen.conjunto_id} points={view} suspect={suspect} />
      )}
      <Expander title={t(`Points in the set (${view.length})`, `Pontos do conjunto (${view.length})`)}>
        <DataTable rows={view} columns={points.data?.columns} hide={['fonte_arquivo']} filename={`psi142_conjunto_${chosen.conjunto_id}`} />
      </Expander>
      <Expander title={t('All sets', 'Todos os conjuntos')}>
        <DataTable rows={conjuntos.rows} columns={conjuntos.columns} hide={['fonte_arquivo']} filename="psi142_conjuntos" />
      </Expander>
      <AlertsTable alerts={alertas} />
    </>
  )

  return (
    <>
      <InvestigationHeader inv={inv} rows={total_pontos} compact={mode === 'simulacao'}>
        <ViewSwitch view={mode} onChange={setMode} />
      </InvestigationHeader>
      <SidebarFilters title={t('Set', 'Conjunto')}>
        <RadioList
          label={t('Dataset', 'Conjunto de dados')}
          options={ids}
          value={chosen.conjunto_id}
          onChange={setCid}
          format={(id) => label(conjuntos.rows.find((s) => s.conjunto_id === id)!)}
        />
      </SidebarFilters>

      {mode === 'simulacao' ? (
        points.isPending ? (
          <Loading label={t('Loading the points of the set…', 'Carregando os pontos do conjunto…')} />
        ) : points.isError ? (
          <Callout tone="error">{t(`Could not load the points: ${points.error.message}`, `Não foi possível carregar os pontos: ${points.error.message}`)}</Callout>
        ) : (
          <SimFrame>
            <Psi142Sim set={chosen} points={view} alerts={alertas.rows} onReport={setSimText} />
          </SimFrame>
        )
      ) : (
        dashboard
      )}
    </>
  )
}
