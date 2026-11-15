import type { ReactNode } from 'react'
import type { AlertRow, Dataset, Investigation } from '@/api/types'
import { Decrypt } from '@/fx/Decrypt'
import { IconChecklist, IconDatabase, IconInfo, IconWarning } from '@/icons'
import { int } from '@/lib/format'
import { t } from '@/lib/i18n'
import { cautions } from '@/lib/text'
import { DataTable } from './DataTable'
import { AboutPanel, FichaPanel } from './Ficha'
import { Markdown } from './Markdown'
import { Badge, Callout, Caption, Code, Expander } from './ui'

export function InvestigationHeader({
  inv,
  rows,
  compact = false,
  children,
}: {
  inv: Investigation
  rows: number
  /** só identificação e título (a vista de simulação ocupa o resto da tela) */
  compact?: boolean
  /** troca de vista, logo abaixo do título */
  children?: ReactNode
}) {
  const source = inv.fonte_carregada || t('none', 'nenhuma')
  const others = (inv.fontes_carregadas ?? '').split('; ').filter((f) => f && f !== source)
  const links = [`[${t('NASA PSI page', 'Página NASA PSI')}](${inv.url_nasa})`]
  if (inv.relatorio) links.push(`[${t('Technical report', 'Relatório técnico')}](${inv.relatorio})`)
  if (inv.doi) links.push(`DOI ${inv.doi}`)
  const [short, ...rest] = inv.nome.split(' — ')
  const long = rest.join(' — ')
  const sample = source.toLowerCase().includes('amostra')
  return (
    <header className="page-header">
      <p className="page-header__eyebrow label">
        <i className="dot" />
        <span>{inv.id}</span>
        <span>{inv.categoria}</span>
        <span>{inv.ambiente}</span>
        <span>{t(`Evidence: ${inv.tipo_evidencia.toLowerCase()}`, `Evidência ${inv.tipo_evidencia.toLowerCase()}`)}</span>
      </p>
      <h1>
        <Decrypt text={short ?? inv.nome} />
        {long && <em> — {long}</em>}
      </h1>
      {children}
      {!compact && <HeaderDetails inv={inv} rows={rows} source={source} others={others} sample={sample} links={links} />}
    </header>
  )
}

function HeaderDetails({ inv, rows, source, others, sample, links }: { inv: Investigation; rows: number; source: string; others: string[]; sample: boolean; links: string[] }) {
  return (
    <>
      <div className="question">
        <span className="label">{t('Question this investigation answers', 'Pergunta que esta investigação responde')}</span>
        <p>{inv.pergunta}</p>
      </div>
      <div className="meta-row">
        <Badge icon={IconDatabase}>{t(`${int(rows)} rows`, `${int(rows)} linhas`)}</Badge>
        <Badge>{source}</Badge>
        {others.length > 0 && <Badge>{t(`+${others.length} table(s)`, `+${others.length} tabela(s)`)}</Badge>}
        {sample && (
          <Badge tone="orange" icon={IconWarning}>
            {t('Sample', 'Amostra')}
          </Badge>
        )}
      </div>
      {sample && (
        <Callout tone="warning">
          {t(
            <>
              This page shows a <strong>sample</strong> ({rows} rows), not the full investigation. Source: <Code>{source}</Code>. See the Overview to get the complete data.
            </>,
            <>
              Esta página mostra uma <strong>amostra</strong> ({rows} linhas), não a investigação completa. Fonte: <Code>{source}</Code>. Veja a Visão geral para obter os dados completos.
            </>,
          )}
        </Callout>
      )}
      <FichaPanel inv={inv} />
      <AboutPanel inv={inv} />
      <Expander title={t('What not to conclude from this data', 'O que não concluir destes dados')} icon={IconInfo}>
        <Markdown>{cautions(inv.cautelas)}</Markdown>
        <Markdown>{links.join(' · ')}</Markdown>
      </Expander>
    </>
  )
}

export function AlertsTable({ alerts }: { alerts: Dataset<AlertRow> }) {
  const n = alerts.rows.length
  return (
    <Expander title={n ? t(`Quality alerts (${n})`, `Alertas de qualidade (${n})`) : t('Quality alerts (none)', 'Alertas de qualidade (nenhum)')} icon={IconChecklist}>
      <Caption>{t('Cells that could not be read as they are. Nothing was corrected by guesswork.', 'Células que não puderam ser lidas como estão. Nada foi corrigido por suposição.')}</Caption>
      <DataTable rows={alerts.rows} columns={alerts.columns} hide={['investigacao']} filename={t('alerts', 'alertas')} />
    </Expander>
  )
}
