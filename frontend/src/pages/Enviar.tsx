import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { queries, send } from '@/api/client'
import type { Spec, SpecCheck, SpecColumn, SpecTable, StudyUpload, Vocabulary } from '@/api/types'
import { DataTable } from '@/components/DataTable'
import { type EditColumn, EditTable } from '@/components/EditTable'
import { FichaReview } from '@/components/FichaReview'
import { Toggle } from '@/components/filters'
import { Loading } from '@/components/Loading'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Callout, Caption, Code, Expander, Panel } from '@/components/ui'
import { AnalysisCard, DiscardButton, Dropzone, Problems, ReceivedFiles, SaveState, Steps, UploadBar, Warnings } from '@/components/upload'
import { IconArrowRightUp, IconChecklist, IconClipboard, IconCompare, IconDatabase, IconInfo, IconMinus, IconOrbit, IconQuestion, IconUpload, IconVerified } from '@/icons'
import { groupBy } from '@/lib/data'
import { cleanSpec, options, pendingColumns, sheetSize, specialValues } from '@/lib/review'
import { evidenceLabel, studyPath } from '@/lib/studies'
import { useDraft, useUpload } from '@/lib/useUpload'

const STEPS = ['Receber', 'Analisar', 'Revisar', 'Aprovar'] as const
const UPLOAD_TYPES = ['csv', 'xlsx', 'xlsm', 'xls', 'pdf', 'md', 'txt', 'zip', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz']
const when = (stamp: string) => stamp.replace('T', ' ')

function Receive({ onSend, pending, error }: { onSend: (form: FormData) => void; pending: boolean; error: Error | null }) {
  const [psi, setPsi] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = new FormData()
    form.append('psi', psi)
    for (const file of files) form.append('arquivos', file)
    onSend(form)
  }
  return (
    <Panel hud icon={IconUpload} title="Receber arquivos" tag="etapa 1 de 4" caption="Obrigatório: ao menos uma tabela (.csv, .xlsx) e um documento (.pdf, .md ou .txt).">
      <form className="form" onSubmit={submit}>
        <label className="field form__psi">
          <span className="field__label">Número do PSI</span>
          <input className="input mono" value={psi} placeholder="PSI-26" autoComplete="off" spellCheck={false} onChange={(e) => setPsi(e.target.value)} />
        </label>
        <Dropzone files={files} onChange={setFiles} accept={UPLOAD_TYPES} hint="Tabelas e documentos soltos, ou compactados em .zip, .rar ou .tar.gz. Até 200 MB." />
        {error && <Callout tone="error">{error.message}</Callout>}
        {pending ? (
          <Loading label="Recebendo e abrindo os arquivos…" />
        ) : (
          <button type="submit" className="button upload__go" disabled={!psi.trim() || !files.length}>
            <IconUpload size={16} /> Receber arquivos
          </button>
        )}
      </form>
    </Panel>
  )
}

function TableReview({ table, lists, onEdit }: { table: SpecTable; lists: ReturnType<typeof options>; onEdit: (edit: (table: SpecTable) => void) => void }) {
  const pending = pendingColumns(table)
  const sourceColumns: EditColumn<SpecTable['fontes'][number]>[] = [
    { key: 'arquivo', label: 'Arquivo', kind: 'static', wide: true },
    { key: 'aba', label: 'Aba', kind: 'static' },
    { key: 'linha_cabecalho', label: 'Linha do cabeçalho', kind: 'number' },
    { key: 'rotulo', label: 'Rótulo (empilhado)', kind: 'text' },
  ]
  // o que a pessoa precisa conferir vem primeiro: de onde saiu a leitura, e se ela confirma
  const columns: EditColumn<SpecColumn>[] = [
    { key: 'origem', label: 'Cabeçalho na fonte', kind: 'static' },
    { key: 'confirmado', label: 'Confirmado', kind: 'check' },
    { key: 'evidencia', label: 'De onde saiu', kind: 'static', wide: true, render: (c) => evidenceLabel(c.evidencia) },
    { key: 'destino', label: 'Nome no banco', kind: 'text' },
    { key: 'natureza', label: 'Natureza', kind: 'select', options: lists.natures },
    { key: 'atributo', label: 'Atributo (ficha)', kind: 'select', options: lists.attributes, help: 'O que a condição representa na ficha do estudo (O₂, pressão, combustível…). Vazio para identificadores e medições.' },
    { key: 'grandeza', label: 'Grandeza (medição)', kind: 'select', options: lists.quantities, help: 'O que a coluna mede, para comparar estudos. Vazio nas condições e identificadores.' },
    { key: 'tipo', label: 'Tipo', kind: 'select', options: lists.types },
    { key: 'unidade', label: 'Unidade', kind: 'text' },
    { key: 'descricao', label: 'Descrição', kind: 'text', wide: true },
    { key: 'valores_especiais', label: 'Valores especiais', kind: 'static', render: (c) => specialValues(c) || '—' },
  ]
  return (
    <Panel icon={IconDatabase} title={<Code>{table.nome}</Code>} tag={`layout ${table.layout}`} caption={table.descricao}>
      <EditTable
        label={`Fontes da tabela ${table.nome}`}
        rows={table.fontes}
        columns={sourceColumns}
        onChange={(index, patch) =>
          onEdit((draft) => {
            Object.assign(draft.fontes[index]!, patch)
          })
        }
      />
      {pending.length > 0 && (
        <Callout tone="warning" icon={IconChecklist}>
          Aguardam a sua confirmação (inferidas pela IA, sem fonte escrita): <strong>{pending.join(', ')}</strong>
        </Callout>
      )}
      <EditTable
        label={`Colunas da tabela ${table.nome}`}
        rows={table.colunas}
        columns={columns}
        flagged={(c) => c.natureza !== 'IGNORAR' && !c.confirmado}
        onChange={(index, patch) =>
          onEdit((draft) => {
            Object.assign(draft.colunas[index]!, patch)
          })
        }
      />
      {(table.excluir_linhas ?? []).map((exclusion) => (
        <p key={exclusion.coluna + exclusion.motivo} className="caption review__excluded">
          <IconMinus size={15} />
          <span>
            Linhas excluídas onde <Code>{exclusion.coluna}</Code> = {exclusion.valores.map(String).join(', ')}: {exclusion.motivo}
          </span>
        </p>
      ))}
    </Panel>
  )
}

function Preview({ check }: { check: SpecCheck }) {
  if (!check.previa) return <Callout tone="warning">Prévia indisponível: {check.previa_erro}</Callout>
  const alerts = check.previa.alertas
  const byType = alerts ? [...groupBy(alerts.rows, (a) => String(a.tipo)).entries()].map(([tipo, list]) => ({ tipo, ocorrencias: list.length })) : []
  return (
    <>
      {check.previa.tabelas.map((table) => (
        <Expander key={table.nome} title={`Prévia de ${table.nome} (${table.linhas} linhas)`} icon={IconDatabase} defaultOpen={!check.problemas.length}>
          <DataTable rows={table.dados.rows} columns={table.dados.columns} filename={`previa_${table.nome}`} maxHeight={320} />
        </Expander>
      ))}
      {alerts && (
        <Expander title={`Alertas que a leitura vai registrar (${alerts.rows.length})`} icon={IconChecklist}>
          <DataTable rows={byType} filename="alertas_por_tipo" config={{ tipo: 'Tipo', ocorrencias: 'Ocorrências' }} maxHeight={200} />
          <DataTable rows={alerts.rows} columns={alerts.columns} filename="alertas_da_previa" maxHeight={320} />
        </Expander>
      )}
    </>
  )
}

function Review({ upload, vocabulary, approve }: { upload: StudyUpload; vocabulary: Vocabulary; approve: ReturnType<typeof useUpload<StudyUpload>>['approve'] }) {
  const lists = useMemo(() => options(vocabulary), [vocabulary])
  const draft = useDraft<Spec, SpecCheck>(upload.especificacao!, upload.conferencia!, (spec) => send<SpecCheck>('PUT', `/api/envios/${upload.id}/especificacao`, cleanSpec(spec)))
  const [replace, setReplace] = useState(false)
  const spec = draft.value
  const inv = spec.investigacao
  const proposal = upload.proposta!
  const problems = draft.check.problemas
  const field = (key: 'nome' | 'categoria' | 'ambiente' | 'tipo_evidencia' | 'pergunta', label: string, wide = false) => (
    <label className={wide ? 'field form__wide' : 'field'}>
      <span className="field__label">{label}</span>
      <input
        className="input"
        value={inv[key] ?? ''}
        onChange={(e) =>
          draft.update((d) => {
            d.investigacao[key] = e.target.value
          })
        }
      />
    </label>
  )

  return (
    <>
      <UploadBar title="Revisão" action={<SaveState stage={draft.stage} failure={draft.failure} />}>
        Proposta de {proposal.modelo} em {when(proposal.criada_em)} · {proposal.tentativas} tentativa(s)
        {proposal.custo_zyt !== null && ` · ${proposal.custo_zyt} ZYT`}. Confira cada interpretação: as marcadas <strong>inferido</strong> precisam da sua confirmação.
      </UploadBar>

      <Panel icon={IconOrbit} title="Investigação" tag={upload.psi}>
        <div className="form form--grid">
          {field('nome', 'Nome')}
          {field('categoria', 'Categoria')}
          {field('ambiente', 'Ambiente')}
          {field('tipo_evidencia', 'Tipo de evidência')}
          {field('pergunta', 'Pergunta que estes dados respondem', true)}
        </div>
        <EditTable
          label="Cautelas da investigação"
          rows={inv.cautelas ?? []}
          columns={[
            { key: 'texto', label: 'Cautela (o que não concluir)', kind: 'text', wide: true },
            { key: 'evidencia', label: 'Fonte', kind: 'static', render: (c) => evidenceLabel(c.evidencia) },
          ]}
          empty="Nenhuma cautela registrada."
          onChange={(index, patch) =>
            draft.update((d) => {
              Object.assign((d.investigacao.cautelas ??= [])[index]!, patch)
            })
          }
          onAdd={() =>
            draft.update((d) => {
              ;(d.investigacao.cautelas ??= []).push({ texto: '', evidencia: { tipo: 'inferido' } })
            })
          }
          onRemove={(index) =>
            draft.update((d) => {
              d.investigacao.cautelas?.splice(index, 1)
            })
          }
        />
      </Panel>

      {(spec.lacunas ?? []).length > 0 && (
        <Callout icon={IconQuestion}>
          <strong>O que os documentos não responderam</strong>
          <ul className="problems">
            {spec.lacunas!.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </Callout>
      )}

      {spec.tabelas.map((table, index) => (
        <TableReview
          key={table.nome}
          table={table}
          lists={lists}
          onEdit={(edit) =>
            draft.update((d) => {
              edit(d.tabelas[index]!)
            })
          }
        />
      ))}

      <Panel icon={IconClipboard} title="Ficha do estudo (dos documentos)" tag={`${sheetSize(spec.ficha)} itens`}>
        {sheetSize(spec.ficha) ? (
          <FichaReview
            sheet={spec.ficha!}
            vocabulary={vocabulary}
            onEdit={(edit) =>
              draft.update((d) => {
                edit((d.ficha ??= {}))
              })
            }
          />
        ) : (
          <Caption>A IA não encontrou nos documentos nada além do que as tabelas já mostram.</Caption>
        )}
      </Panel>

      {(spec.comparacoes_sugeridas ?? []).length > 0 && (
        <Expander title={`Comparações sugeridas pela IA (${spec.comparacoes_sugeridas!.length})`} icon={IconCompare}>
          <Caption>Ficam gravadas com o estudo. A comparação automática, com regras de compatibilidade, é a próxima fase.</Caption>
          <DataTable rows={spec.comparacoes_sugeridas!} filename="comparacoes_sugeridas" maxHeight={260} />
        </Expander>
      )}

      <UploadBar title="Conferência">Refeita a cada edição, com os arquivos do envio: o que impede aprovar e como as tabelas ficam depois de lidas.</UploadBar>
      <Problems list={problems} ok="Especificação válida." />
      <Preview check={draft.check} />

      <Panel hud icon={IconVerified} title="Aprovar e gravar no sistema" tag="etapa 4 de 4" caption={`Os arquivos vão para dados/${upload.psi}/ com a especificação aprovada; a carga e a seed são refeitas.`}>
        <Toggle label={`Substituir dados/${upload.psi}/ se já existir`} checked={replace} onChange={setReplace} />
        {approve.isError && <Callout tone="error">{approve.error.message}</Callout>}
        {approve.isPending ? (
          <Loading label="Gravando em dados/, carregando o banco e atualizando a seed…" />
        ) : (
          <button type="button" className="button upload__go" disabled={problems.length > 0 || draft.stage !== 'saved'} onClick={() => approve.mutate(replace)}>
            <IconVerified size={16} /> Aprovar e gravar no sistema
          </button>
        )}
      </Panel>
    </>
  )
}

export default function Enviar() {
  const flow = useUpload<StudyUpload>('envios')
  const vocabulary = useQuery(queries.vocabulary())
  const upload = flow.upload
  const approved = upload?.estado === 'aprovado'
  const step = !upload ? 0 : approved ? 4 : upload.especificacao ? 2 : 1
  const written = Object.entries(upload?.gravadas ?? {})

  return (
    <>
      <PageHeader eyebrow={['Dados', 'A IA propõe · você aprova']} title="Enviar estudo">
        Envie as tabelas e o documento do estudo (relatório, artigo ou ReadMe). A IA propõe como ler cada coluna; nada é gravado sem a sua revisão.
      </PageHeader>
      <Steps steps={STEPS} current={step} />

      {flow.loading ? (
        <Loading label="Abrindo o envio…" />
      ) : !upload ? (
        <>
          {flow.error && <Callout tone="error">{flow.error.message}</Callout>}
          <Receive onSend={flow.receive.mutate} pending={flow.receive.isPending} error={flow.receive.error} />
        </>
      ) : (
        <>
          <UploadBar
            title={
              <>
                {upload.psi} <em>· envio {upload.id}</em>
              </>
            }
            action={<DiscardButton approved={approved} pending={flow.discard.isPending} onDiscard={() => flow.discard.mutate()} onNew={flow.reset} />}
          >
            Recebido em {when(upload.criado_em)} · estado: <strong>{upload.estado}</strong>
          </UploadBar>
          <ReceivedFiles files={upload.arquivos} title="Arquivos recebidos" defaultOpen={upload.estado === 'recebido'} />
          <Warnings list={upload.avisos} />

          {approved ? (
            <Callout tone="success">
              <strong>{upload.psi} foi aprovado e já está no sistema.</strong>
              {written.length > 0 && (
                <span className="meta-row">
                  {written.map(([name, rows]) => (
                    <Badge key={name} icon={IconDatabase}>
                      {name} · {rows} linhas
                    </Badge>
                  ))}
                </span>
              )}
              <Link className="link-arrow" to={studyPath(upload.psi)}>
                Abrir o estudo <IconArrowRightUp size={16} />
              </Link>
            </Callout>
          ) : upload.analise ? (
            <AnalysisCard
              title="Análise pela IA"
              estimate={upload.analise}
              action={`Analisar com ${upload.analise.modelo} · ≈ ${upload.analise.custo_zyt_aprox} ZYT`}
              waiting="A IA está lendo o perfil das tabelas e os documentos…"
              pending={flow.analyse.isPending}
              error={flow.analyse.error}
              onRun={() => flow.analyse.mutate()}
            >
              Vai para a IA o perfil das tabelas e o texto dos documentos — não as planilhas inteiras. Ela devolve uma especificação de leitura: o que cada coluna é, a unidade, valores especiais e de onde saiu cada interpretação.
            </AnalysisCard>
          ) : upload.especificacao && upload.conferencia && vocabulary.data ? (
            <Review key={upload.id} upload={upload} vocabulary={vocabulary.data} approve={flow.approve} />
          ) : vocabulary.isError ? (
            <Callout tone="error">{vocabulary.error.message}</Callout>
          ) : (
            <Loading label="Abrindo a revisão…" />
          )}
        </>
      )}

      <Callout icon={IconInfo}>
        <strong>A IA não grava dados.</strong> Quem lê as tabelas é o leitor genérico, que aplica a especificação aprovada de forma determinística: toda carga dá o mesmo resultado, sem chamar a IA, e cada linha guarda o arquivo, a aba e a linha de
        origem.
      </Callout>
    </>
  )
}
