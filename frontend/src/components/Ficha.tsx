/** Ficha do estudo e metadados do portal, no cabeçalho de cada investigação. */

import { type CSSProperties, useState } from 'react'
import type { FichaItem, FichaLink, Investigation, Portal, Publication } from '@/api/types'
import { IconClipboard, IconLink, IconTarget } from '@/icons'
import { t } from '@/lib/i18n'
import { period } from '@/lib/studies'
import { Badge, type BadgeTone, Caption, Expander } from './ui'
import { td } from '@/lib/i18n-data'

const MAX_LINKS_SHOWN = 3
const MAX_PUBLICATIONS = 10
const SITUATION_TONE: Record<string, BadgeTone> = {
  variou: 'orange',
  fixo: 'gray',
  medido: 'blue',
  simulado: 'violet',
  documento: 'violet',
  derivado: 'violet',
  digitalizado: 'violet',
  divergente: 'red',
  'sem dados': 'red',
}
const COLUMNS: { title: string; sections: string[] }[] = [
  { title: t('Fuels and samples', 'Combustíveis e amostras'), sections: ['combustivel', 'amostra'] },
  { title: t('Test conditions', 'Condições de teste'), sections: ['condicao'] },
  { title: t('Measurements and sensors', 'Medições e sensores'), sections: ['medicao', 'sensor'] },
]
const NOT_A_UNIT = ['não informada', 'a conferir']
const WRITTEN = ['documento', 'divergente']
const TESTED = ['combustivel', 'amostra', 'condicao']

function value(item: FichaItem): string {
  if (!item.valores) return '—'
  if (!item.unidade || item.minimo === null) return item.valores
  // "não informada", "a conferir": não é unidade
  return NOT_A_UNIT.includes(item.unidade) ? t(`${item.valores} (unit ${td(item.unidade)})`, `${item.valores} (unidade ${item.unidade})`) : `${item.valores} ${td(item.unidade)}`
}

function Item({ item, i }: { item: FichaItem; i: number }) {
  const origin = ['dados', 'documento'].includes(item.origem) ? item.evidencia : item.origem
  return (
    <li className="ficha__item" style={{ '--i': i } as CSSProperties}>
      <span className="ficha__name">
        {td(item.rotulo)}
        <Badge tone={SITUATION_TONE[item.situacao] ?? 'gray'}>{td(item.situacao)}</Badge>
      </span>
      <span className="ficha__value mono">{value(item)}</span>
      <span className="ficha__origin">
        {td(origin)}
        {item.nota && ` · ${item.nota}`}
      </span>
    </li>
  )
}

function Summary({ label, names, tone }: { label: string; names: string[]; tone: BadgeTone }) {
  if (!names.length) return null
  return (
    <div className="ficha-strip__row">
      <span className="label">{label}</span>
      <span className="meta-row">
        {names.map((name) => (
          <Badge key={name} tone={tone}>
            {td(name)}
          </Badge>
        ))}
      </span>
    </div>
  )
}

function Links({ links }: { links: FichaLink[] }) {
  if (!links.length) return null
  const shown = links.slice(0, MAX_LINKS_SHOWN)
  const rest = links.slice(MAX_LINKS_SHOWN)
  return (
    <div className="ficha__links">
      <span className="label">{t('Conditions that did not vary independently', 'Condições que não variaram de forma independente')}</span>
      <Caption>
        {t(
          'Some level of one only appears with one level of the other: a difference in these tests cannot be attributed to either of them alone.',
          'Algum nível de uma só aparece com um nível da outra: uma diferença nesses testes não pode ser atribuída a uma delas sozinha.',
        )}
      </Caption>
      <ul>
        {shown.map((link) => (
          <li key={`${link.variavel_a}×${link.variavel_b}`}>
            <IconLink size={15} />
            <span>
              <strong>
                {td(link.variavel_a)} × {td(link.variavel_b)}
              </strong>
              : {link.exemplos.split('; ')[0]}
            </span>
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <Caption>
          {t('Also', 'Também')}: {rest.map((l) => `${l.variavel_a} × ${l.variavel_b}`).join('; ')}. {t('The assistant can detail any of them.', 'O assistente detalha qualquer um deles.')}
        </Caption>
      )}
    </div>
  )
}

/** O que foi testado, em que condições, o que se mediu, o que variou e o que ficou fixo. */
export function FichaPanel({ inv }: { inv: Investigation }) {
  const sheet = inv.ficha ?? []
  if (!sheet.length) return null
  const names = (situation: string) => sheet.filter((item) => item.situacao === situation).map((item) => item.rotulo)
  const written = sheet.filter((item) => WRITTEN.includes(item.situacao) && TESTED.includes(item.secao))
  const goals = sheet.filter((item) => item.secao === 'objetivo')
  return (
    <div className="ficha" data-agent-target data-agent-kind="card" data-agent-label={t('Study sheet', 'Ficha do estudo')}>
      <div className="ficha-strip">
        <Summary label={t('Varied across tests', 'Variou entre os testes')} names={names('variou')} tone="orange" />
        <Summary label={t('Same in all', 'Igual em todos')} names={names('fixo')} tone="gray" />
        {written.length > 0 && (
          // o que o documento diz vem por extenso: são frases, não etiquetas
          <div className="ficha-strip__row">
            <span className="label">{t('According to the documents', 'Segundo os documentos')}</span>
            <ul className="ficha-strip__written">
              {written.map((item, i) => (
                <li key={`${item.rotulo}${i}`}>
                  <strong>{td(item.rotulo)}</strong> {item.valores}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Expander title={t(`Study sheet (${sheet.length} items)`, `Ficha do estudo (${sheet.length} itens)`)} icon={IconClipboard}>
        {goals.map((goal) => (
          <div key={goal.valores} className="ficha__goal">
            <span className="label">{t('Objective (document)', 'Objetivo (documento)')}</span>
            <p>{goal.valores}</p>
            <span className="ficha__origin">{goal.evidencia}</span>
          </div>
        ))}
        <Caption>
          {t(
            <>
              Computed from the loaded data, without AI; the items marked <em>document</em> were read from the documents and approved in review. Below each item, where it came from.
            </>,
            <>
              Calculada dos dados carregados, sem IA; os itens marcados <em>documento</em> foram lidos dos documentos e aprovados na revisão. Abaixo de cada item, de onde ele saiu.
            </>,
          )}
        </Caption>
        <div className="ficha__columns">
          {COLUMNS.map(({ title, sections }) => {
            const items = sheet.filter((item) => sections.includes(item.secao))
            return (
              <section key={title}>
                <h3 className="label">{title}</h3>
                {items.length ? (
                  <ul>
                    {items.map((item, i) => (
                      <Item key={`${item.rotulo}${item.evidencia}${i}`} item={item} i={i} />
                    ))}
                  </ul>
                ) : (
                  <Caption>{t('Nothing recorded in the data.', 'Nada registrado nos dados.')}</Caption>
                )}
              </section>
            )
          })}
        </div>
        <Links links={inv.vinculos ?? []} />
      </Expander>
    </div>
  )
}

function Publications({ list }: { list: Publication[] }) {
  const [all, setAll] = useState(false)
  if (!list.length) return null
  const shown = all ? list : list.slice(0, MAX_PUBLICATIONS)
  return (
    <div className="about__block">
      <span className="label">{t(`Publications (${list.length})`, `Publicações (${list.length})`)}</span>
      <ul className="about__list">
        {shown.map((pub, i) => (
          <li key={`${pub.titulo}${i}`}>
            {pub.link ? (
              <a href={pub.link} target="_blank" rel="noreferrer noopener">
                {pub.titulo}
              </a>
            ) : (
              pub.titulo
            )}
          </li>
        ))}
      </ul>
      {list.length > MAX_PUBLICATIONS && (
        <button type="button" className="link-button" onClick={() => setAll((v) => !v)}>
          {all ? t('Show only the first ones', 'Mostrar só as primeiras') : t(`Show the other ${list.length - MAX_PUBLICATIONS}`, `Mostrar as outras ${list.length - MAX_PUBLICATIONS}`)}
        </button>
      )}
    </div>
  )
}

const FACTS: [string, keyof Portal][] = [
  [t('Equipment', 'Equipamento'), 'equipamento'],
  [t('Platform', 'Plataforma'), 'plataforma'],
  [t('Center', 'Centro'), 'centro_nasa'],
]
const TEXTS: [string, keyof Portal][] = [
  [t('Objective', 'Objetivo'), 'objetivo'],
  [t('Hypothesis', 'Hipótese'), 'hipotese'],
  [t('Approach', 'Abordagem'), 'abordagem'],
]

/** Objetivo, hipótese, abordagem, equipamento e publicações, dos metadados do portal NASA PSI. */
export function AboutPanel({ inv }: { inv: Investigation }) {
  const portal = inv.portal
  if (!portal) return null
  const facts = [...FACTS.map(([label, key]) => [label, portal[key]] as const), [t('Period', 'Período'), period(portal)] as const].filter(([, v]) => v)
  return (
    <Expander title={t('Objective, equipment and publications', 'Objetivo, equipamento e publicações')} icon={IconTarget}>
      <Caption>{t(`Metadata from the NASA PSI portal (${portal.arquivo_metadados}), in the original language.`, `Metadados do portal NASA PSI (${portal.arquivo_metadados}), no idioma original.`)}</Caption>
      {facts.length > 0 && (
        <dl className="about__facts">
          {facts.map(([label, text]) => (
            <div key={label}>
              <dt className="label">{label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      )}
      {TEXTS.map(([label, key]) =>
        portal[key] ? (
          <div key={label} className="about__block">
            <span className="label">{label}</span>
            <p>{portal[key]}</p>
          </div>
        ) : null,
      )}
      <Publications list={inv.publicacoes ?? []} />
    </Expander>
  )
}
