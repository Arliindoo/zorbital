import { useSuspenseQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { queries } from '@/shared/api/client'
import { useScreen } from '@/features/assistant/store'
import { BarList } from '@/shared/charts/BarList'
import { STATUS } from '@/shared/charts/colors'
import { CommandFlow } from '@/shared/charts/CommandFlow'
import { Waffle } from '@/shared/charts/Waffle'
import { DataTable } from '@/shared/ui/DataTable'
import { Markdown } from '@/shared/ui/Markdown'
import { Badge, Callout, Caption, Code, Grid, Panel } from '@/shared/ui/ui'
import { CountUp } from '@/shared/fx/CountUp'
import { Decrypt } from '@/shared/fx/Decrypt'
import {
  IconArrowRightUp,
  IconChecklist,
  IconCheck,
  IconCompare,
  IconDatabase,
  IconDocument,
  IconListAdd,
  IconScale,
  IconWarning,
} from '@/shared/icons/index'
import { groupBy } from '@/shared/lib/data'
import { int } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { studyPath } from '@/features/studies/studies'
import { td } from '@/shared/lib/i18n-data'

const ACCENT: Record<string, string> = {
  'PSI-69': 'var(--s1)',
  'PSI-39': 'var(--s4)',
  'PSI-117': 'var(--s2)',
  'PSI-25': 'var(--s3)',
  'PSI-142': 'var(--s7)',
}
const STATUS_COLORS: Record<string, string> = {
  Carregado: STATUS.ok,
  'Não carregado': STATUS.warn,
  'Duplicata exata': 'var(--violet)',
  Documentação: STATUS.info,
  'Não reconhecido': STATUS.bad,
}
const base = (path: string) => path.split('/').at(-1) ?? path
const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? t('Good morning', 'Bom dia') : hour < 18 ? t('Good afternoon', 'Boa tarde') : t('Good evening', 'Boa noite')
}

export default function Overview() {
  const { data } = useSuspenseQuery(queries.overview())
  const { meta, investigacoes, faltando, status_fontes, fontes, alertas } = data
  useScreen({ pagina: 'overview', titulo: t('Overview', 'Visão geral') })

  const totalRows = investigacoes.reduce((sum, inv) => sum + inv.linhas, 0)
  const totalAlerts = alertas.rows.length
  const loaded = fontes.rows.filter((f) => f.status === 'Carregado')
  const alertTypes = [...groupBy(alertas.rows, (a) => a.tipo).entries()]
    .map(([tipo, list]) => ({ label: td(tipo).replaceAll('_', ' '), value: list.length }))
    .sort((a, b) => b.value - a.value)

  return (
    <>
      <header className="page-header">
        <p className="page-header__eyebrow label">
          <i className="dot" />
          <span>NASA Physical Sciences Informatics</span>
        </p>
        <h1>
          <em>{greeting()}.</em> <Decrypt text={t('Microgravity combustion', 'Combustão em microgravidade')} />
        </h1>
        <p className="lead">
          {t(
            <>
              {investigacoes.length} NASA investigations, each answering a different question. They are kept{' '}
              <strong>separate by type of evidence</strong>; the only numerical comparison between them has its own page.
            </>,
            <>
              {investigacoes.length} investigações da NASA, cada uma respondendo a uma pergunta diferente. Elas ficam{' '}
              <strong>separadas por tipo de evidência</strong>; a única comparação numérica entre elas tem página própria.
            </>,
          )}
        </p>
      </header>

      <Panel
        hud
        flush
        kind="flow"
        label={t('Data flow: files, loaded rows and investigations', 'Fluxo dos dados: arquivos, linhas carregadas e investigações')}
        foot={[
          { label: t('Files in dados/', 'Arquivos em dados/'), value: <CountUp value={fontes.rows.length} /> },
          { label: t('Loaded', 'Carregados'), value: <CountUp value={loaded.length} /> },
          { label: t('Rows in the database', 'Linhas no banco'), value: <CountUp value={totalRows} /> },
          { label: t('Investigations', 'Investigações'), value: <CountUp value={investigacoes.length} /> },
          { label: t('Quality alerts', 'Alertas de qualidade'), value: <CountUp value={totalAlerts} /> },
        ]}
      >
        <CommandFlow
          sources={loaded.map((f) => ({ name: base(String(f.caminho)), rows: Number(f.linhas_carregadas ?? 0), investigation: String(f.investigacao ?? '—') }))}
          otherFiles={fontes.rows.length - loaded.length}
          investigations={investigacoes.map((inv) => ({
            id: inv.id,
            name: inv.nome.split(' — ')[0] ?? inv.nome,
            category: inv.categoria,
            env: inv.ambiente.includes('ISS') ? 'iss' : 'solo',
            rows: inv.linhas,
            unit: inv.unidade,
            alerts: inv.alertas,
            to: studyPath(inv.id),
          }))}
          totalRows={totalRows}
          totalAlerts={totalAlerts}
        />
      </Panel>

      <div className="grid">
        {investigacoes.map((inv, i) => {
          // três por linha; o que sobra na última divide a largura
          const tail = investigacoes.length % 3
          const share = inv.linhas ? Math.min(1, inv.alertas / inv.linhas) : 0
          return (
            <Link
              key={inv.id}
              to={studyPath(inv.id)}
              className="inv-card"
              style={{ '--span': i < investigacoes.length - tail ? 4 : 12 / tail, '--span-md': 6, '--accent': ACCENT[inv.id] ?? 'var(--signal)', '--i': i } as CSSProperties}
              data-agent-target
              data-agent-kind="card"
              data-agent-label={inv.nome}
            >
              <span className="inv-card__top">
                <span className="label">
                  {inv.id} · {inv.ambiente}
                </span>
                <IconArrowRightUp size={18} />
              </span>
              <strong>{inv.nome.split(' — ')[0]}</strong>
              <span className="caption">{inv.categoria}</span>
              <span className="inv-card__value">
                <CountUp value={inv.linhas} delay={200 + i * 90} />
                <small>{inv.unidade}</small>
              </span>
              {/* densidade de alertas: quantos a cada 100 linhas */}
              <span className="inv-card__meter" title={t(`${inv.alertas} alerts in ${int(inv.linhas)} rows`, `${inv.alertas} alertas em ${int(inv.linhas)} linhas`)}>
                <i style={{ '--w': `${Math.max(2, share * 100)}%` } as CSSProperties} />
              </span>
              <span className="meta-row">
                {inv.amostra ? (
                  <Badge tone="orange" icon={IconWarning}>
                    {t('Sample', 'Amostra')}
                  </Badge>
                ) : (
                  <Badge tone="green" icon={IconCheck}>
                    {t('Complete', 'Completo')}
                  </Badge>
                )}
                <Badge>{t(`${inv.alertas} alerts`, `${inv.alertas} alertas`)}</Badge>
                <Badge>{inv.tipo_evidencia}</Badge>
              </span>
              <span className="inv-card__question">{inv.pergunta}</span>
            </Link>
          )
        })}
      </div>

      <Grid>
        {data.comparacao_disponivel && (
          <Panel span={faltando.length ? 6 : 12} icon={IconCompare} title={t('Comparison available: PSI-117 × CFI', 'Comparação disponível: PSI-117 × CFI')} tag={t('n-dodecane', 'n-dodecano')}>
            <Caption>
              {t(
                'Extinction diameter of n-dodecane droplets by pressure: the PSI-117 model and measurements (ground) next to the CFI flight tests. Note: some of the PSI-117 measurements are CFI tests themselves.',
                'Diâmetro de extinção de gotas de n-dodecano por pressão: o modelo e as medições do PSI-117 (solo) ao lado dos ensaios de voo do CFI. Atenção: parte das medições do PSI-117 são ensaios do próprio CFI.',
              )}
            </Caption>
            <Link className="link-arrow" to="/comparacao">
              {t('Open comparison', 'Abrir comparação')} <IconArrowRightUp size={16} />
            </Link>
          </Panel>
        )}
        {faltando.length > 0 && (
          <Panel span={data.comparacao_disponivel ? 6 : 12} icon={IconListAdd} title={t('To get all the tables', 'Para ter todas as tabelas')} tag={t(`${faltando.length} pending`, `${faltando.length} pendências`)}>
            <Markdown>{faltando.map((m) => `- ${m}`).join('\n')}</Markdown>
            <Caption>
              {t(
                <>
                  Download from the NASA PSI portal, place in <Code>dados/</Code> and run <Code>uv run spaceapps-build</Code>.
                </>,
                <>
                  Baixe do portal NASA PSI, coloque em <Code>dados/</Code> e rode <Code>uv run spaceapps-build</Code>.
                </>,
              )}
            </Caption>
          </Panel>
        )}
      </Grid>

      <Callout icon={IconScale}>{meta.geral}</Callout>

      <Grid>
        <Panel
          span={5}
          spanMd={12}
          kind="chart"
          icon={IconDocument}
          title={t('Files in dados/', 'Arquivos em dados/')}
          tag={t(`${fontes.rows.length} files`, `${fontes.rows.length} arquivos`)}
          caption={t('One square per file, identified by its hash. Duplicates and derived copies are not loaded.', 'Um quadrado por arquivo, identificado pelo hash. Duplicatas e cópias derivadas não são carregadas.')}
          foot={status_fontes.slice(0, 3).map(({ status, n }) => ({ label: td(status), value: n }))}
        >
          <Waffle
            label={t('Data files by status', 'Arquivos de dados por situação')}
            colors={STATUS_COLORS}
            cells={[...fontes.rows]
              .sort((a, b) => String(a.status).localeCompare(String(b.status)))
              .map((f) => ({
                title: base(String(f.caminho)),
                category: String(f.status),
                rows: [
                  [t('Investigation', 'Investigação'), String(f.investigacao ?? '—')],
                  [t('Rows', 'Linhas'), f.linhas_carregadas === null ? '—' : int(Number(f.linhas_carregadas))],
                ],
              }))}
          />
        </Panel>
        <Panel
          span={7}
          spanMd={12}
          kind="chart"
          icon={IconChecklist}
          title={t('Quality alerts by type', 'Alertas de qualidade por tipo')}
          tag={t(`${totalAlerts} alerts`, `${totalAlerts} alertas`)}
          caption={t('Cells that could not be read as they are. The original value is kept on record; nothing is corrected.', 'Células que não puderam ser lidas como estão. O valor original fica registrado; nada é corrigido.')}
        >
          <BarList items={alertTypes.slice(0, 8)} label={t('Alerts by type', 'Alertas por tipo')} color="var(--magenta)" />
        </Panel>
      </Grid>

      <Panel kind="table" icon={IconDatabase} title={t('Sources', 'Fontes')} tag="fontes" caption={t('When there is both an original and a sample, the original wins.', 'Quando há original e amostra, o original vence.')} flush>
        <DataTable
          rows={fontes.rows}
          columns={fontes.columns}
          filename="fontes"
          config={{
            caminho: t('File', 'Arquivo'),
            investigacao: t('Investigation', 'Investigação'),
            papel: t('What it is', 'O que é'),
            status: 'Status',
            motivo: { label: t('Reason', 'Motivo'), wide: true },
            linhas_carregadas: t('Rows loaded', 'Linhas carregadas'),
            tamanho_bytes: 'Bytes',
          }}
        />
      </Panel>

      <Panel kind="table" icon={IconChecklist} title={t('Quality alerts', 'Alertas de qualidade')} tag="alertas" flush>
        <DataTable
          rows={alertas.rows}
          columns={alertas.columns}
          filename="alertas"
          config={{ valor_original: t('Value in the source', 'Valor na fonte'), teste_id: t('Test', 'Teste'), investigacao: t('Investigation', 'Investigação'), detalhe: { wide: true } }}
        />
      </Panel>
    </>
  )
}
