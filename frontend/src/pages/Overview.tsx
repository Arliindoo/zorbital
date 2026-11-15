import { useSuspenseQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { queries } from '@/api/client'
import { useScreen } from '@/assistant/store'
import { BarList } from '@/charts/BarList'
import { STATUS } from '@/charts/colors'
import { CommandFlow } from '@/charts/CommandFlow'
import { Waffle } from '@/charts/Waffle'
import { DataTable } from '@/components/DataTable'
import { Markdown } from '@/components/Markdown'
import { Badge, Callout, Caption, Code, Grid, Panel } from '@/components/ui'
import { CountUp } from '@/fx/CountUp'
import { Decrypt } from '@/fx/Decrypt'
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
} from '@/icons'
import { groupBy } from '@/lib/data'
import { int } from '@/lib/format'
import { studyPath } from '@/lib/studies'

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
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}

export default function Overview() {
  const { data } = useSuspenseQuery(queries.overview())
  const { meta, investigacoes, faltando, status_fontes, fontes, alertas } = data
  useScreen({ pagina: 'overview', titulo: 'Visão geral' })

  const totalRows = investigacoes.reduce((sum, inv) => sum + inv.linhas, 0)
  const totalAlerts = alertas.rows.length
  const loaded = fontes.rows.filter((f) => f.status === 'Carregado')
  const alertTypes = [...groupBy(alertas.rows, (a) => a.tipo).entries()]
    .map(([tipo, list]) => ({ label: tipo.replaceAll('_', ' '), value: list.length }))
    .sort((a, b) => b.value - a.value)

  return (
    <>
      <header className="page-header">
        <p className="page-header__eyebrow label">
          <i className="dot" />
          <span>NASA Physical Sciences Informatics</span>
        </p>
        <h1>
          <em>{greeting()}.</em> <Decrypt text="Combustão em microgravidade" />
        </h1>
        <p className="lead">
          {investigacoes.length} investigações da NASA, cada uma respondendo a uma pergunta diferente. Elas ficam{' '}
          <strong>separadas por tipo de evidência</strong>; a única comparação numérica entre elas tem página própria.
        </p>
      </header>

      <Panel
        hud
        flush
        kind="flow"
        label="Fluxo dos dados: arquivos, linhas carregadas e investigações"
        foot={[
          { label: 'Arquivos em dados/', value: <CountUp value={fontes.rows.length} /> },
          { label: 'Carregados', value: <CountUp value={loaded.length} /> },
          { label: 'Linhas no banco', value: <CountUp value={totalRows} /> },
          { label: 'Investigações', value: <CountUp value={investigacoes.length} /> },
          { label: 'Alertas de qualidade', value: <CountUp value={totalAlerts} /> },
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
              <span className="inv-card__meter" title={`${inv.alertas} alertas em ${int(inv.linhas)} linhas`}>
                <i style={{ '--w': `${Math.max(2, share * 100)}%` } as CSSProperties} />
              </span>
              <span className="meta-row">
                {inv.amostra ? (
                  <Badge tone="orange" icon={IconWarning}>
                    Amostra
                  </Badge>
                ) : (
                  <Badge tone="green" icon={IconCheck}>
                    Completo
                  </Badge>
                )}
                <Badge>{inv.alertas} alertas</Badge>
                <Badge>{inv.tipo_evidencia}</Badge>
              </span>
              <span className="inv-card__question">{inv.pergunta}</span>
            </Link>
          )
        })}
      </div>

      <Grid>
        {data.comparacao_disponivel && (
          <Panel span={faltando.length ? 6 : 12} icon={IconCompare} title="Comparação disponível: PSI-117 × CFI" tag="n-dodecano">
            <Caption>
              Diâmetro de extinção de gotas de n-dodecano por pressão: o modelo e as medições do PSI-117 (solo) ao lado dos
              ensaios de voo do CFI. Atenção: parte das medições do PSI-117 são ensaios do próprio CFI.
            </Caption>
            <Link className="link-arrow" to="/comparacao">
              Abrir comparação <IconArrowRightUp size={16} />
            </Link>
          </Panel>
        )}
        {faltando.length > 0 && (
          <Panel span={data.comparacao_disponivel ? 6 : 12} icon={IconListAdd} title="Para ter todas as tabelas" tag={`${faltando.length} pendências`}>
            <Markdown>{faltando.map((m) => `- ${m}`).join('\n')}</Markdown>
            <Caption>
              Baixe do portal NASA PSI, coloque em <Code>dados/</Code> e rode <Code>uv run spaceapps-build</Code>.
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
          title="Arquivos em dados/"
          tag={`${fontes.rows.length} arquivos`}
          caption="Um quadrado por arquivo, identificado pelo hash. Duplicatas e cópias derivadas não são carregadas."
          foot={status_fontes.slice(0, 3).map(({ status, n }) => ({ label: status, value: n }))}
        >
          <Waffle
            label="Arquivos de dados por situação"
            colors={STATUS_COLORS}
            cells={[...fontes.rows]
              .sort((a, b) => String(a.status).localeCompare(String(b.status)))
              .map((f) => ({
                title: base(String(f.caminho)),
                category: String(f.status),
                rows: [
                  ['Investigação', String(f.investigacao ?? '—')],
                  ['Linhas', f.linhas_carregadas === null ? '—' : int(Number(f.linhas_carregadas))],
                ],
              }))}
          />
        </Panel>
        <Panel
          span={7}
          spanMd={12}
          kind="chart"
          icon={IconChecklist}
          title="Alertas de qualidade por tipo"
          tag={`${totalAlerts} alertas`}
          caption="Células que não puderam ser lidas como estão. O valor original fica registrado; nada é corrigido."
        >
          <BarList items={alertTypes.slice(0, 8)} label="Alertas por tipo" color="var(--magenta)" />
        </Panel>
      </Grid>

      <Panel kind="table" icon={IconDatabase} title="Fontes" tag="fontes" caption="Quando há original e amostra, o original vence." flush>
        <DataTable
          rows={fontes.rows}
          columns={fontes.columns}
          filename="fontes"
          config={{
            caminho: 'Arquivo',
            investigacao: 'Investigação',
            papel: 'O que é',
            status: 'Status',
            motivo: { label: 'Motivo', wide: true },
            linhas_carregadas: 'Linhas carregadas',
            tamanho_bytes: 'Bytes',
          }}
        />
      </Panel>

      <Panel kind="table" icon={IconChecklist} title="Alertas de qualidade" tag="alertas" flush>
        <DataTable
          rows={alertas.rows}
          columns={alertas.columns}
          filename="alertas"
          config={{ valor_original: 'Valor na fonte', teste_id: 'Teste', investigacao: 'Investigação', detalhe: { wide: true } }}
        />
      </Panel>
    </>
  )
}
