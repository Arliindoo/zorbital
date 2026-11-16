import { useSuspenseQuery } from '@tanstack/react-query'
import { type CSSProperties, useMemo } from 'react'
import { Link } from 'react-router'
import { queries } from '@/shared/api/client'
import type { StudyCard } from '@/shared/api/types'
import { useScreen } from '@/features/assistant/store'
import { SERIES } from '@/shared/charts/colors'
import { CheckboxGroup, RangeFilter } from '@/shared/ui/filters'
import { SidebarFilters } from '@/app/Layout'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Badge, Callout, Caption } from '@/shared/ui/ui'
import { CountUp } from '@/shared/fx/CountUp'
import { IconAdd, IconArrowRightUp, IconCheck, IconClose, IconSearch, IconUpload, IconWarning } from '@/shared/icons/index'
import type { Range } from '@/shared/lib/data'
import { int } from '@/shared/lib/format'
import { locale, t } from '@/shared/lib/i18n'
import { clip, overlaps, rangeText, searchStudies, shortName, studyPath } from '@/features/studies/studies'
import { usePageState } from '@/shared/lib/usePageState'
import { td } from '@/shared/lib/i18n-data'

const NOT_WRITTEN = 'não escrito na fonte'
const MAX_HITS = 3

/** Os extremos de uma faixa entre todos os estudos, na unidade de tela. */
function bounds(cards: readonly StudyCard[], key: 'oxigenio' | 'pressao', factor: number): Range | null {
  const ranges = cards.map((c) => c[key]).filter((r): r is [number, number] => r !== null)
  if (!ranges.length) return null
  return [Math.min(...ranges.map((r) => r[0])) * factor, Math.max(...ranges.map((r) => r[1])) * factor]
}

/** Faixa escolhida na unidade da ficha, ou null quando o filtro está aberto (não esconde quem não tem o dado). */
function chosenRange(value: Range | null, limits: Range | null, factor: number): Range | null {
  if (!value || !limits || (value[0] <= limits[0] && value[1] >= limits[1])) return null
  return [value[0] / factor, value[1] / factor]
}

function Tags({ card }: { card: StudyCard }) {
  const fuels = card.combustiveis.filter((name) => name.toLowerCase() !== NOT_WRITTEN)
  if (!fuels.length && !card.oxigenio && !card.pressao) return null
  return (
    <span className="meta-row">
      {fuels.length > 0 && (
        <Badge tone="violet">
          {fuels.slice(0, 2).map(td).join(', ')}
          {fuels.length > 2 && ' …'}
        </Badge>
      )}
      {card.oxigenio && <Badge>O₂ {rangeText(card.oxigenio, 100)}%</Badge>}
      {card.pressao && <Badge>{rangeText(card.pressao)} atm</Badge>}
    </span>
  )
}

function Card({ card, hits, i }: { card: StudyCard; hits: string[]; i: number }) {
  const share = card.linhas ? Math.min(1, card.alertas / card.linhas) : 0
  return (
    <Link
      to={studyPath(card.id)}
      className="inv-card"
      style={{ '--span': 4, '--span-md': 6, '--accent': SERIES[i % SERIES.length], '--i': i } as CSSProperties}
      data-agent-target
      data-agent-kind="card"
      data-agent-label={card.nome}
    >
      <span className="inv-card__top">
        <span className="label">
          {card.id} · {card.ambiente}
        </span>
        <IconArrowRightUp size={18} />
      </span>
      <strong>{shortName(card.nome)}</strong>
      <span className="caption">{card.categoria}</span>
      <span className="inv-card__value">
        <CountUp value={card.linhas} delay={120 + i * 60} />
        <small>{t('records', 'registros')}</small>
      </span>
      <span className="inv-card__meter" title={t(`${card.alertas} alerts in ${int(card.linhas)} records`, `${card.alertas} alertas em ${int(card.linhas)} registros`)}>
        <i style={{ '--w': `${Math.max(2, share * 100)}%` } as CSSProperties} />
      </span>
      <span className="meta-row">
        {card.enviado && (
          <Badge tone="blue" icon={IconUpload}>
            {t('Uploaded', 'Enviado')}
          </Badge>
        )}
        {card.amostra ? (
          <Badge tone="orange" icon={IconWarning}>
            {t('Sample', 'Amostra')}
          </Badge>
        ) : (
          <Badge tone="green" icon={IconCheck}>
            {t('Complete', 'Completo')}
          </Badge>
        )}
        <Badge>{t(`${card.alertas} alerts`, `${card.alertas} alertas`)}</Badge>
      </span>
      <Tags card={card} />
      <span className="inv-card__question">{clip(card.pergunta ?? '')}</span>
      {hits.length > 0 && (
        <span className="inv-card__hits">
          <IconSearch size={13} /> {t('found in', 'encontrado em')} {hits.slice(0, MAX_HITS).map(td).join('; ')}
        </span>
      )}
    </Link>
  )
}

export default function Estudos() {
  const { data } = useSuspenseQuery(queries.studies())
  const cards = data.estudos
  const [query, setQuery] = usePageState('estudos:busca', '')
  const [categories, setCategories] = usePageState<string[]>('estudos:categorias', [])
  const [oxygen, setOxygen] = usePageState<Range | null>('estudos:o2', null)
  const [pressure, setPressure] = usePageState<Range | null>('estudos:atm', null)
  const [shapes, setShapes] = usePageState<string[]>('estudos:formas', [])

  const allCategories = useMemo(() => [...new Set(cards.map((c) => c.categoria))].sort((a, b) => a.localeCompare(b, locale)), [cards])
  const allShapes = useMemo(() => [...new Set(cards.flatMap((c) => c.formas))].sort((a, b) => a.localeCompare(b, locale)), [cards])
  const oxygenBounds = useMemo(() => bounds(cards, 'oxigenio', 100), [cards])
  const pressureBounds = useMemo(() => bounds(cards, 'pressao', 1), [cards])
  const found = useMemo(() => searchStudies(cards, query), [cards, query])

  const o2 = chosenRange(oxygen, oxygenBounds, 100)
  const atm = chosenRange(pressure, pressureBounds, 1)
  const rows = cards.filter(
    (card) =>
      found.has(card.id) &&
      (!categories.length || categories.includes(card.categoria)) &&
      overlaps(card.oxigenio, o2) &&
      overlaps(card.pressao, atm) &&
      (!shapes.length || card.formas.some((shape) => shapes.includes(shape))),
  )
  const filtering = !!query.trim() || categories.length > 0 || !!o2 || !!atm || shapes.length > 0
  const clear = () => {
    setQuery('')
    setCategories([])
    setOxygen(null)
    setPressure(null)
    setShapes([])
  }

  useScreen({
    pagina: 'estudos',
    titulo: t('Studies', 'Estudos'),
    filtros: { busca: query || null, categorias: categories, 'oxigênio (%)': oxygen, 'pressão (atm)': pressure, formato: shapes },
    graficos: [t(`Study cards: ${rows.length} of ${cards.length} in the filter.`, `Cartões dos estudos: ${rows.length} de ${cards.length} no filtro.`)],
    dados: rows.map((c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, ambiente: c.ambiente, registros: c.linhas, alertas: c.alertas })),
  })

  return (
    <>
      <SidebarFilters title={t('Test condition', 'Condição de teste')}>
        <Caption>{t("A study is included if its range overlaps the chosen range. Values from each study's sheet.", 'Um estudo entra se a faixa dele cruza a faixa escolhida. Valores da ficha de cada estudo.')}</Caption>
        <RangeFilter label={t('Oxygen (%)', 'Oxigênio (%)')} bounds={oxygenBounds} value={oxygen} onChange={setOxygen} digits={1} />
        <RangeFilter label={t('Pressure (atm)', 'Pressão (atm)')} bounds={pressureBounds} value={pressure} onChange={setPressure} digits={2} />
        {/* nada marcado = todos os formatos */}
        {allShapes.length > 0 && <CheckboxGroup label={t('Sample or flame shape', 'Formato da amostra ou chama')} options={allShapes} value={shapes} onChange={setShapes} />}
      </SidebarFilters>

      <PageHeader eyebrow={[t('Command center', 'Centro de comando'), t(`${cards.length} studies`, `${cards.length} estudos`)]} title={t('Studies', 'Estudos')}>
        {t(
          'Search by name, PSI, fuel, material, column or condition — accents are ignored. The O₂ range, pressure and shape filters are in the side panel.',
          'Busque por nome, PSI, combustível, material, coluna ou condição — sem diferenciar acentos. Os filtros por faixa de O₂, pressão e formato ficam no painel ao lado.',
        )}
      </PageHeader>

      <div className="finder">
        <label className="search finder__search">
          <IconSearch size={18} />
          <input type="search" value={query} placeholder={t('e.g. n-dodecane, PMMA, cool flame, PSI-39, pressure', 'ex.: n-dodecano, PMMA, chama fria, PSI-39, pressão')} aria-label={t('Search studies', 'Buscar estudos')} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="pills" role="group" aria-label={t('Category', 'Categoria')}>
          {allCategories.map((category) => {
            const on = categories.includes(category)
            return (
              <button key={category} type="button" className="pill" aria-pressed={on} onClick={() => setCategories(on ? categories.filter((c) => c !== category) : [...categories, category])}>
                {category}
              </button>
            )
          })}
          {filtering && (
            <button type="button" className="pill pill--clear" onClick={clear}>
              <IconClose size={13} /> {t('clear', 'limpar')}
            </button>
          )}
        </div>
        <p className="finder__count label" role="status">
          {t(`${rows.length} of ${cards.length} studies`, `${rows.length} de ${cards.length} estudos`)}
        </p>
      </div>

      {!rows.length && <Callout icon={IconSearch}>{query.trim() ? t(`No study matches “${query.trim()}” with these filters.`, `Nenhum estudo com “${query.trim()}” e esses filtros.`) : t('No study matches these filters.', 'Nenhum estudo com esses filtros.')}</Callout>}

      <div className="grid">
        {rows.map((card, i) => (
          <Card key={card.id} card={card} hits={found.get(card.id) ?? []} i={i} />
        ))}
        {/* o último cartão é o de enviar um estudo novo */}
        <Link to="/enviar" className="inv-card inv-card--new" style={{ '--span': 4, '--span-md': 6, '--accent': 'var(--signal)', '--i': rows.length } as CSSProperties}>
          <span className="inv-card__top">
            <span className="label">{t('New study', 'Novo estudo')}</span>
            <IconArrowRightUp size={18} />
          </span>
          <IconAdd size={34} className="inv-card__plus" />
          <strong>{t('Upload study', 'Enviar estudo')}</strong>
          <span className="inv-card__question">
            {t(
              'Upload the tables and the document of another PSI investigation. The AI proposes how to read each column; nothing is saved without your review.',
              'Envie as tabelas e o documento de outra investigação do PSI. A IA propõe como ler cada coluna; nada é gravado sem a sua revisão.',
            )}
          </span>
        </Link>
      </div>
    </>
  )
}
