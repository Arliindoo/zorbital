import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { queries } from '@/api/client'
import type { SheetPair } from '@/api/types'
import { useScreen } from '@/assistant/store'
import { assignSlots, SERIES } from '@/charts/colors'
import { Ranges } from '@/charts/Ranges'
import { DataTable } from '@/components/DataTable'
import { SidebarFilters } from '@/components/Layout'
import { Loading } from '@/components/Loading'
import { PageHeader } from '@/components/PageHeader'
import { Badge, type BadgeTone, Callout, Caption, Code, Grid, Panel } from '@/components/ui'
import { type Icon, IconCheck, IconClipboard, IconClose, IconCompare, IconInfo, IconMinus, IconQuestion, IconRuler, IconWarning } from '@/icons'
import { t } from '@/lib/i18n'
import { usePageState } from '@/lib/usePageState'
import { td } from '@/lib/i18n-data'

const MIN = 2
const MAX = 4
// cor e ícone: o texto do veredito vai junto, a cor nunca está sozinha
const VERDICT: Record<string, { tone: BadgeTone; icon: Icon }> = {
  'Janela comparável': { tone: 'green', icon: IconCheck },
  'Combustíveis diferentes': { tone: 'orange', icon: IconWarning },
  'Condições sem sobreposição': { tone: 'orange', icon: IconClose },
  'Sem condição numérica em comum': { tone: 'gray', icon: IconQuestion },
  'Nada medido em comum': { tone: 'gray', icon: IconMinus },
}

function PairCard({ pair, name, colors, span }: { pair: SheetPair; name: (id: string) => string; colors: Record<string, string>; span: number }) {
  const verdict = VERDICT[pair.veredito] ?? { tone: 'gray' as const, icon: IconQuestion }
  const parts: [string, string][] = [
    [t('Both measure', 'Medem'), pair.grandezas_comuns.join(', ').toLowerCase()],
    [t('Ranges in common', 'Faixas em comum'), pair.sobrepoe.join('; ')],
    [t('No overlap', 'Sem sobreposição'), pair.nao_sobrepoe.join('; ')],
    [t('Fuel in common', 'Combustível em comum'), pair.combustiveis_comuns.map(td).join(', ')],
  ]
  const shown = parts.filter(([, text]) => text)
  return (
    <Panel span={span} spanMd={6} kind="card" label={`${pair.a} × ${pair.b}: ${td(pair.veredito)}`}>
      <div className="pair">
        <p className="pair__names">
          <span>
            <i style={{ background: colors[pair.a] }} />
            {name(pair.a)}
          </span>
          <b aria-hidden>×</b>
          <span>
            <i style={{ background: colors[pair.b] }} />
            {name(pair.b)}
          </span>
        </p>
        <Badge tone={verdict.tone} icon={verdict.icon}>
          {td(pair.veredito)}
        </Badge>
        {shown.length ? (
          <dl className="pair__facts">
            {shown.map(([title, text]) => (
              <div key={title}>
                <dt className="label">{title}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <Caption>—</Caption>
        )}
        {pair.avisos.length > 0 && (
          <ul className="pair__warnings">
            {pair.avisos.map((warning) => (
              <li key={warning}>
                <IconInfo size={14} />
                {warning}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

export default function Fichas() {
  const { data } = useSuspenseQuery(queries.sheets())
  const names = useMemo(() => Object.fromEntries(data.estudos.map((s) => [s.id, s.nome])), [data])
  const short = (id: string) => (names[id] === id || !names[id] ? id : `${id} · ${names[id]}`)
  const [choice, setChoice] = usePageState<string[]>('fichas:ids', data.padrao)
  const chosen = useMemo(() => choice.filter((id) => id in names).slice(0, MAX), [choice, names])
  // A cor acompanha o estudo: tirar um da comparação não repinta os que ficaram.
  const [slotMemory, setSlotMemory] = usePageState<Record<string, number>>('fichas:cores', {})
  const slots = useMemo(() => assignSlots(chosen, slotMemory), [chosen, slotMemory])
  const colors = useMemo(() => Object.fromEntries(chosen.map((id) => [id, SERIES[slots[id]!]!])), [chosen, slots])
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]
    setChoice(next)
    setSlotMemory(assignSlots(next, slots))
  }

  const ready = data.disponivel && chosen.length >= MIN
  const comparison = useQuery({ ...queries.sheetComparison(chosen), enabled: ready, placeholderData: (previous) => previous })
  const result = ready ? comparison.data : undefined
  const windows = Object.entries(result?.janelas_comuns ?? {})

  useScreen({
    pagina: 'fichas',
    titulo: t('Study sheets side by side', 'Fichas lado a lado'),
    escopo: chosen.length ? chosen : null,
    filtros: { estudos: chosen },
    graficos: (result?.faixas ?? []).map((band) => t(`${td(band.rotulo)} ranges by study`, `Faixas de ${td(band.rotulo)} por estudo`)),
    dados: result?.tabela.rows ?? null,
    colunas: result?.tabela.columns.map((c) => c.name) ?? null,
    tabela_banco: 'ficha',
  })

  return (
    <>
      <SidebarFilters title={t(`Studies (${MIN} to ${MAX})`, `Estudos (de ${MIN} a ${MAX})`)}>
        <fieldset className="field">
          <legend className="field__label">
            {t('Compare', 'Comparar')}
            <span>{t(`${chosen.length} of ${MAX}`, `${chosen.length} de ${MAX}`)}</span>
          </legend>
          <div className="checks">
            {data.estudos.map(({ id }) => {
              const on = chosen.includes(id)
              return (
                <label key={id} className="check" data-off={!on && chosen.length >= MAX ? true : undefined}>
                  <input type="checkbox" checked={on} disabled={!on && chosen.length >= MAX} onChange={() => toggle(id)} />
                  <span>{short(id)}</span>
                  {on && <i className="check__swatch" style={{ background: colors[id] }} aria-hidden />}
                </label>
              )
            })}
          </div>
        </fieldset>
      </SidebarFilters>

      <PageHeader eyebrow={[t('Comparisons', 'Comparações'), t('Computed from the study sheets · no AI', 'Calculado das fichas · sem IA')]} title={t('Study sheets side by side', 'Fichas lado a lado')}>
        {t(
          'Before comparing results: what the studies tested, over which ranges and what they measured — all in the same unit.',
          'Antes de comparar resultados: o que os estudos testaram, em que faixas e o que mediram — tudo na mesma unidade.',
        )}
      </PageHeader>

      {!data.disponivel ? (
        <Callout tone="error">
          {t('The database has no study sheets. Run the load again:', 'O banco não tem a ficha dos estudos. Rode a carga de novo:')} <Code>uv run spaceapps-build</Code>
        </Callout>
      ) : !ready ? (
        <Callout icon={IconClipboard}>{t('Choose at least two studies in the filters panel.', 'Escolha pelo menos dois estudos no painel de filtros.')}</Callout>
      ) : comparison.isError ? (
        <Callout tone="error">{comparison.error.message}</Callout>
      ) : !result ? (
        <Loading label={t('Comparing the study sheets…', 'Comparando as fichas…')} />
      ) : (
        <>
          <section className="block">
            <header className="block__head">
              <h2>{t('What can be compared', 'O que dá para comparar')}</h2>
              {windows.length > 0 && chosen.length > 2 && (
                <Caption>
                  {t('Range common to all chosen studies:', 'Faixa comum a todos os escolhidos:')} {windows.map(([k, v]) => `${td(k)} ${td(v)}`).join('; ')}
                </Caption>
              )}
            </header>
            <Grid>
              {result.pares.map((pair) => (
                <PairCard key={`${pair.a}${pair.b}`} pair={pair} name={short} colors={colors} span={result.pares.length === 1 ? 12 : result.pares.length === 2 ? 6 : 4} />
              ))}
            </Grid>
          </section>

          <section className="block">
            <header className="block__head">
              <h2>{t('Condition ranges', 'Faixas das condições')}</h2>
              <Caption>
                {t(
                  'Each line runs from the lowest to the highest value tested in the study; a single point is a fixed value. The shaded band is the range common to all. A common range does not mean the same combination was tested.',
                  'Cada linha vai do menor ao maior valor testado no estudo; um ponto só é valor fixo. A faixa sombreada é a comum a todos. Faixa comum não quer dizer que a mesma combinação foi testada.',
                )}
              </Caption>
            </header>
            {result.faixas.length ? (
              <Grid>
                {result.faixas.map((band) => (
                  <Panel key={band.atributo} span={6} spanMd={12} kind="chart" icon={IconRuler} title={td(band.rotulo)} tag={td(band.unidade) || t('no unit', 'sem unidade')} label={t(`${td(band.rotulo)} ranges by study`, `Faixas de ${td(band.rotulo)} por estudo`)}>
                    <Ranges
                      label={t(`${td(band.rotulo)} ranges by study`, `Faixas de ${td(band.rotulo)} por estudo`)}
                      xLabel={band.unidade ? `${td(band.rotulo)} (${td(band.unidade)})` : td(band.rotulo)}
                      window={band.janela}
                      rows={band.estudos.filter((s) => s.id in colors).map((s) => ({ label: short(s.id), color: colors[s.id]!, lo: s.minimo, hi: s.maximo, text: s.texto }))}
                    />
                  </Panel>
                ))}
              </Grid>
            ) : (
              <Caption>{t('No numeric condition appears in more than one of the chosen studies.', 'Nenhuma condição numérica aparece em mais de um dos estudos escolhidos.')}</Caption>
            )}
          </section>

          <Panel kind="table" icon={IconCompare} title={t('Compared study sheet', 'Ficha comparada')} tag={t(`${result.tabela.rows.length} attributes`, `${result.tabela.rows.length} atributos`)} caption={t('One row per attribute. “—”: the study does not record this attribute in the loaded data.', 'Uma linha por atributo. “—”: o estudo não registra esse atributo nos dados carregados.')} flush>
            <DataTable rows={result.tabela.rows} columns={result.tabela.columns} filename="fichas_lado_a_lado" config={{ atributo: t('Attribute', 'Atributo'), ...Object.fromEntries(chosen.map((id) => [id, { label: short(id), wide: true }])) }} />
          </Panel>
        </>
      )}
    </>
  )
}
