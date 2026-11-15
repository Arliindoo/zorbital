import { useSuspenseQuery } from '@tanstack/react-query'
import { type CSSProperties, useMemo } from 'react'
import { Link } from 'react-router'
import { queries } from '@/api/client'
import type { StudyCard } from '@/api/types'
import { useScreen } from '@/assistant/store'
import { SERIES } from '@/charts/colors'
import { CheckboxGroup, RangeFilter } from '@/components/filters'
import { SidebarFilters } from '@/components/Layout'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Callout, Caption } from '@/components/ui'
import { CountUp } from '@/fx/CountUp'
import { IconAdd, IconArrowRightUp, IconCheck, IconClose, IconSearch, IconUpload, IconWarning } from '@/icons'
import type { Range } from '@/lib/data'
import { int } from '@/lib/format'
import { clip, overlaps, rangeText, searchStudies, shortName, studyPath } from '@/lib/studies'
import { usePageState } from '@/lib/usePageState'

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
          {fuels.slice(0, 2).join(', ')}
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
        <small>registros</small>
      </span>
      <span className="inv-card__meter" title={`${card.alertas} alertas em ${int(card.linhas)} registros`}>
        <i style={{ '--w': `${Math.max(2, share * 100)}%` } as CSSProperties} />
      </span>
      <span className="meta-row">
        {card.enviado && (
          <Badge tone="blue" icon={IconUpload}>
            Enviado
          </Badge>
        )}
        {card.amostra ? (
          <Badge tone="orange" icon={IconWarning}>
            Amostra
          </Badge>
        ) : (
          <Badge tone="green" icon={IconCheck}>
            Completo
          </Badge>
        )}
        <Badge>{card.alertas} alertas</Badge>
      </span>
      <Tags card={card} />
      <span className="inv-card__question">{clip(card.pergunta ?? '')}</span>
      {hits.length > 0 && (
        <span className="inv-card__hits">
          <IconSearch size={13} /> encontrado em {hits.slice(0, MAX_HITS).join('; ')}
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

  const allCategories = useMemo(() => [...new Set(cards.map((c) => c.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [cards])
  const allShapes = useMemo(() => [...new Set(cards.flatMap((c) => c.formas))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [cards])
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
    titulo: 'Estudos',
    filtros: { busca: query || null, categorias: categories, 'oxigênio (%)': oxygen, 'pressão (atm)': pressure, formato: shapes },
    graficos: [`Cartões dos estudos: ${rows.length} de ${cards.length} no filtro.`],
    dados: rows.map((c) => ({ id: c.id, nome: c.nome, categoria: c.categoria, ambiente: c.ambiente, registros: c.linhas, alertas: c.alertas })),
  })

  return (
    <>
      <SidebarFilters title="Condição de teste">
        <Caption>Um estudo entra se a faixa dele cruza a faixa escolhida. Valores da ficha de cada estudo.</Caption>
        <RangeFilter label="Oxigênio (%)" bounds={oxygenBounds} value={oxygen} onChange={setOxygen} digits={1} />
        <RangeFilter label="Pressão (atm)" bounds={pressureBounds} value={pressure} onChange={setPressure} digits={2} />
        {/* nada marcado = todos os formatos */}
        {allShapes.length > 0 && <CheckboxGroup label="Formato da amostra ou chama" options={allShapes} value={shapes} onChange={setShapes} />}
      </SidebarFilters>

      <PageHeader eyebrow={['Centro de comando', `${cards.length} estudos`]} title="Estudos">
        Busque por nome, PSI, combustível, material, coluna ou condição — sem diferenciar acentos. Os filtros por faixa de O₂, pressão e formato ficam no painel ao lado.
      </PageHeader>

      <div className="finder">
        <label className="search finder__search">
          <IconSearch size={18} />
          <input type="search" value={query} placeholder="ex.: n-dodecano, PMMA, chama fria, PSI-39, pressão" aria-label="Buscar estudos" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="pills" role="group" aria-label="Categoria">
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
              <IconClose size={13} /> limpar
            </button>
          )}
        </div>
        <p className="finder__count label" role="status">
          {rows.length} de {cards.length} estudos
        </p>
      </div>

      {!rows.length && <Callout icon={IconSearch}>{query.trim() ? `Nenhum estudo com “${query.trim()}” e esses filtros.` : 'Nenhum estudo com esses filtros.'}</Callout>}

      <div className="grid">
        {rows.map((card, i) => (
          <Card key={card.id} card={card} hits={found.get(card.id) ?? []} i={i} />
        ))}
        {/* o último cartão é o de enviar um estudo novo */}
        <Link to="/enviar" className="inv-card inv-card--new" style={{ '--span': 4, '--span-md': 6, '--accent': 'var(--signal)', '--i': rows.length } as CSSProperties}>
          <span className="inv-card__top">
            <span className="label">Novo estudo</span>
            <IconArrowRightUp size={18} />
          </span>
          <IconAdd size={34} className="inv-card__plus" />
          <strong>Enviar estudo</strong>
          <span className="inv-card__question">Envie as tabelas e o documento de outra investigação do PSI. A IA propõe como ler cada coluna; nada é gravado sem a sua revisão.</span>
        </Link>
      </div>
    </>
  )
}
