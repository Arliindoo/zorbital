import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { queries, send } from '@/api/client'
import type { DocSheet, DocsUpload, SheetCheck, Vocabulary } from '@/api/types'
import { FichaReview } from '@/components/FichaReview'
import { Toggle } from '@/components/filters'
import { Loading } from '@/components/Loading'
import { PageHeader } from '@/components/PageHeader'
import { Callout, Panel } from '@/components/ui'
import { AnalysisCard, DiscardButton, Dropzone, Problems, ReceivedFiles, SaveState, Steps, UploadBar, Warnings } from '@/components/upload'
import { IconArrowRightUp, IconClipboard, IconDocumentAdd, IconInfo, IconUpload, IconVerified } from '@/icons'
import { int } from '@/lib/format'
import { cleanSheet } from '@/lib/review'
import { shortName, studyPath } from '@/lib/studies'
import { useDraft, useUpload } from '@/lib/useUpload'

const STEPS = ['Receber', 'Ler a ficha', 'Revisar e aprovar'] as const
const DOC_TYPES = ['pdf', 'md', 'txt', 'zip', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz']
const when = (stamp: string) => stamp.replace('T', ' ')

function Receive({ onSend, pending, error, vocabulary }: { onSend: (form: FormData) => void; pending: boolean; error: Error | null; vocabulary: Vocabulary | undefined }) {
  const { data } = useSuspenseQuery(queries.sheets())
  const [psi, setPsi] = useState(data.estudos[0]?.id ?? '')
  const [files, setFiles] = useState<File[]>([])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = new FormData()
    form.append('psi', psi)
    for (const file of files) form.append('arquivos', file)
    onSend(form)
  }
  const limits = vocabulary ? ` A IA lê até ${vocabulary.limite_paginas_pdf} páginas por PDF e ${int(vocabulary.limite_caracteres)} caracteres no total: dois documentos bastam.` : ''
  return (
    <Panel hud icon={IconDocumentAdd} title="Receber documentos" tag="etapa 1 de 3">
      <form className="form" onSubmit={submit}>
        <label className="field form__psi">
          <span className="field__label">Estudo</span>
          <select className="select" value={psi} onChange={(e) => setPsi(e.target.value)}>
            {data.estudos.map((study) => (
              <option key={study.id} value={study.id}>
                {study.id} · {study.nome}
              </option>
            ))}
          </select>
        </label>
        <Dropzone files={files} onChange={setFiles} accept={DOC_TYPES} hint={`PDF, MD ou TXT, soltos ou compactados.${limits}`} />
        {error && <Callout tone="error">{error.message}</Callout>}
        {pending ? (
          <Loading label="Recebendo e abrindo os documentos…" />
        ) : (
          <button type="submit" className="button upload__go" disabled={!psi || !files.length}>
            <IconUpload size={16} /> Receber documentos
          </button>
        )}
      </form>
    </Panel>
  )
}

function Review({ upload, vocabulary, approve }: { upload: DocsUpload; vocabulary: Vocabulary; approve: ReturnType<typeof useUpload<DocsUpload>>['approve'] }) {
  const draft = useDraft<DocSheet, SheetCheck>(upload.ficha!, upload.conferencia!, (sheet) => send<SheetCheck>('PUT', `/api/documentos/${upload.id}/ficha`, cleanSheet(sheet)))
  const [replace, setReplace] = useState(false)
  const proposal = upload.proposta!
  const { problemas, itens, desmarcados } = draft.check
  const target = `dados/${upload.psi}/ficha.json`
  return (
    <>
      <UploadBar title="Revisão" action={<SaveState stage={draft.stage} failure={draft.failure} />}>
        Proposta de {proposal.modelo} em {when(proposal.criada_em)}
        {proposal.custo_zyt !== null && ` · ${proposal.custo_zyt} ZYT`}
      </UploadBar>
      <Panel icon={IconClipboard} title="Ficha lida dos documentos" tag={`${itens} entram · ${desmarcados} ficam de fora`}>
        <FichaReview sheet={draft.value} vocabulary={vocabulary} onEdit={draft.update} />
      </Panel>

      <UploadBar title="Conferência" />
      <Problems list={problemas} ok={`Ficha pronta para gravar: ${itens} item(ns)${desmarcados ? `; ${desmarcados} desmarcado(s) fica(m) de fora.` : '.'}`} />

      <Panel hud icon={IconVerified} title="Aprovar e gravar" tag="etapa 3 de 3" caption={`Os documentos vão para dados/${upload.psi}/documentos/ e a ficha para ${target}; a carga e a seed são refeitas, sem IA.`}>
        {upload.ja_existe && <Toggle label={`Substituir ${target}`} checked={replace} onChange={setReplace} help="Este estudo já tem uma ficha gravada a partir de documentos." />}
        {approve.isError && <Callout tone="error">{approve.error.message}</Callout>}
        {approve.isPending ? (
          <Loading label="Gravando em dados/, carregando o banco e atualizando a seed…" />
        ) : (
          <button type="button" className="button upload__go" disabled={problemas.length > 0 || draft.stage !== 'saved'} onClick={() => approve.mutate(replace)}>
            <IconVerified size={16} /> Aprovar e gravar
          </button>
        )}
      </Panel>
    </>
  )
}

export default function Documentos() {
  const flow = useUpload<DocsUpload>('documentos')
  const vocabulary = useQuery(queries.vocabulary())
  const upload = flow.upload
  const approved = upload?.estado === 'aprovado'
  const step = !upload ? 0 : approved ? 3 : upload.ficha ? 2 : 1
  const documents = upload?.arquivos.filter((f) => f.tipo === 'documento') ?? []

  return (
    <>
      <PageHeader eyebrow={['Dados', 'Para um estudo que já está no sistema']} title="Adicionar documentos">
        Envie os documentos do estudo — de preferência o DLD e o SRD do portal. A IA lê o que só está escrito neles: sensores, condições mantidas fixas e o objetivo.
      </PageHeader>
      <Steps steps={STEPS} current={step} />

      {flow.loading ? (
        <Loading label="Abrindo o envio…" />
      ) : !upload ? (
        <>
          {flow.error && <Callout tone="error">{flow.error.message}</Callout>}
          <Receive onSend={flow.receive.mutate} pending={flow.receive.isPending} error={flow.receive.error} vocabulary={vocabulary.data} />
        </>
      ) : (
        <>
          <UploadBar
            title={
              <>
                {upload.psi} <em>· {shortName(upload.estudo.nome)}</em>
              </>
            }
            action={<DiscardButton approved={approved} pending={flow.discard.isPending} onDiscard={() => flow.discard.mutate()} onNew={flow.reset} />}
          >
            Envio {upload.id} · estado: <strong>{upload.estado}</strong>
          </UploadBar>
          <ReceivedFiles files={upload.arquivos} title={`Arquivos recebidos · ${documents.length} documento(s)`} />
          <Warnings list={upload.avisos} />

          {approved ? (
            <Callout tone="success">
              <strong>Ficha gravada e carregada.</strong>
              <Link className="link-arrow" to={studyPath(upload.psi)}>
                Abrir o estudo <IconArrowRightUp size={16} />
              </Link>
            </Callout>
          ) : upload.analise ? (
            <AnalysisCard
              title="Leitura pela IA"
              estimate={upload.analise}
              action={`Ler a ficha com ${upload.analise.modelo} · ≈ ${upload.analise.custo_zyt_aprox} ZYT`}
              waiting="A IA está lendo os documentos…"
              pending={flow.analyse.isPending}
              error={flow.analyse.error}
              onRun={() => flow.analyse.mutate()}
            >
              Vai para a IA o texto dos documentos e o que os dados já dizem do estudo, para ela não repetir. Cada item que ela devolve cita arquivo, página e um trecho copiado.
            </AnalysisCard>
          ) : upload.ficha && upload.conferencia && vocabulary.data ? (
            <Review key={upload.id} upload={upload} vocabulary={vocabulary.data} approve={flow.approve} />
          ) : vocabulary.isError ? (
            <Callout tone="error">{vocabulary.error.message}</Callout>
          ) : (
            <Loading label="Abrindo a revisão…" />
          )}
        </>
      )}

      <Callout icon={IconInfo}>
        Cada item cita a página; o código confere o trecho no texto do documento e nada é gravado sem a sua revisão. Os dados valem mais que o documento: se a faixa escrita não cobre a dos dados, a ficha mostra os dois e registra um alerta.
      </Callout>
    </>
  )
}
