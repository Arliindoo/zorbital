import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { queries, send } from '@/shared/api/client'
import type { DocSheet, DocsUpload, SheetCheck, Vocabulary } from '@/shared/api/types'
import { FichaReview } from '@/features/submissions/components/FichaReview'
import { Toggle } from '@/shared/ui/filters'
import { Loading } from '@/shared/ui/Loading'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Callout, Panel } from '@/shared/ui/ui'
import { AnalysisCard, DiscardButton, Dropzone, Problems, ReceivedFiles, SaveState, Steps, UploadBar, Warnings } from '@/features/submissions/components/upload'
import { IconArrowRightUp, IconClipboard, IconDocumentAdd, IconInfo, IconUpload, IconVerified } from '@/shared/icons/index'
import { int } from '@/shared/lib/format'
import { t } from '@/shared/lib/i18n'
import { cleanSheet } from '@/features/submissions/review'
import { shortName, studyPath } from '@/features/studies/studies'
import { useDraft, useUpload } from '@/features/submissions/useUpload'
import { td } from '@/shared/lib/i18n-data'

const STEPS = [t('Receive', 'Receber'), t('Read the study sheet', 'Ler a ficha'), t('Review and approve', 'Revisar e aprovar')] as const
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
  const limits = vocabulary
    ? t(
        ` The AI reads up to ${vocabulary.limite_paginas_pdf} pages per PDF and ${int(vocabulary.limite_caracteres)} characters in total: two documents are enough.`,
        ` A IA lê até ${vocabulary.limite_paginas_pdf} páginas por PDF e ${int(vocabulary.limite_caracteres)} caracteres no total: dois documentos bastam.`,
      )
    : ''
  return (
    <Panel hud icon={IconDocumentAdd} title={t('Receive documents', 'Receber documentos')} tag={t('step 1 of 3', 'etapa 1 de 3')}>
      <form className="form" onSubmit={submit}>
        <label className="field form__psi">
          <span className="field__label">{t('Study', 'Estudo')}</span>
          <select className="select" value={psi} onChange={(e) => setPsi(e.target.value)}>
            {data.estudos.map((study) => (
              <option key={study.id} value={study.id}>
                {study.id} · {study.nome}
              </option>
            ))}
          </select>
        </label>
        <Dropzone files={files} onChange={setFiles} accept={DOC_TYPES} hint={t(`PDF, MD or TXT, loose or compressed.${limits}`, `PDF, MD ou TXT, soltos ou compactados.${limits}`)} />
        {error && <Callout tone="error">{error.message}</Callout>}
        {pending ? (
          <Loading label={t('Receiving and opening the documents…', 'Recebendo e abrindo os documentos…')} />
        ) : (
          <button type="submit" className="button upload__go" disabled={!psi || !files.length}>
            <IconUpload size={16} /> {t('Receive documents', 'Receber documentos')}
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
      <UploadBar title={t('Review', 'Revisão')} action={<SaveState stage={draft.stage} failure={draft.failure} />}>
        {t(`Proposal by ${proposal.modelo} on ${when(proposal.criada_em)}`, `Proposta de ${proposal.modelo} em ${when(proposal.criada_em)}`)}
        {proposal.custo_zyt !== null && ` · ${proposal.custo_zyt} ZYT`}
      </UploadBar>
      <Panel icon={IconClipboard} title={t('Study sheet read from the documents', 'Ficha lida dos documentos')} tag={t(`${itens} included · ${desmarcados} left out`, `${itens} entram · ${desmarcados} ficam de fora`)}>
        <FichaReview sheet={draft.value} vocabulary={vocabulary} onEdit={draft.update} />
      </Panel>

      <UploadBar title={t('Check', 'Conferência')} />
      <Problems list={problemas} ok={t(
          `Study sheet ready to save: ${itens} item(s)${desmarcados ? `; ${desmarcados} unchecked item(s) left out.` : '.'}`,
          `Ficha pronta para gravar: ${itens} item(ns)${desmarcados ? `; ${desmarcados} desmarcado(s) fica(m) de fora.` : '.'}`,
        )} />

      <Panel hud icon={IconVerified} title={t('Approve and save', 'Aprovar e gravar')} tag={t('step 3 of 3', 'etapa 3 de 3')} caption={t(
          `The documents go to dados/${upload.psi}/documentos/ and the study sheet to ${target}; the load and the seed are rebuilt, without AI.`,
          `Os documentos vão para dados/${upload.psi}/documentos/ e a ficha para ${target}; a carga e a seed são refeitas, sem IA.`,
        )}>
        {upload.ja_existe && <Toggle label={t(`Replace ${target}`, `Substituir ${target}`)} checked={replace} onChange={setReplace} help={t('This study already has a study sheet saved from documents.', 'Este estudo já tem uma ficha gravada a partir de documentos.')} />}
        {approve.isError && <Callout tone="error">{approve.error.message}</Callout>}
        {approve.isPending ? (
          <Loading label={t('Saving to dados/, loading the database and updating the seed…', 'Gravando em dados/, carregando o banco e atualizando a seed…')} />
        ) : (
          <button type="button" className="button upload__go" disabled={problemas.length > 0 || draft.stage !== 'saved'} onClick={() => approve.mutate(replace)}>
            <IconVerified size={16} /> {t('Approve and save', 'Aprovar e gravar')}
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
      <PageHeader eyebrow={[t('Data', 'Dados'), t('For a study already in the system', 'Para um estudo que já está no sistema')]} title={t('Add documents', 'Adicionar documentos')}>
        {t(
          "Upload the study's documents — preferably the DLD and the SRD from the portal. The AI reads what is only written in them: sensors, conditions held fixed and the objective.",
          'Envie os documentos do estudo — de preferência o DLD e o SRD do portal. A IA lê o que só está escrito neles: sensores, condições mantidas fixas e o objetivo.',
        )}
      </PageHeader>
      <Steps steps={STEPS} current={step} />

      {flow.loading ? (
        <Loading label={t('Opening the upload…', 'Abrindo o envio…')} />
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
            {t(`Upload ${upload.id} · status:`, `Envio ${upload.id} · estado:`)} <strong>{td(upload.estado)}</strong>
          </UploadBar>
          <ReceivedFiles files={upload.arquivos} title={t(`Files received · ${documents.length} document(s)`, `Arquivos recebidos · ${documents.length} documento(s)`)} />
          <Warnings list={upload.avisos} />

          {approved ? (
            <Callout tone="success">
              <strong>{t('Study sheet saved and loaded.', 'Ficha gravada e carregada.')}</strong>
              <Link className="link-arrow" to={studyPath(upload.psi)}>
                {t('Open the study', 'Abrir o estudo')} <IconArrowRightUp size={16} />
              </Link>
            </Callout>
          ) : upload.analise ? (
            <AnalysisCard
              title={t('AI reading', 'Leitura pela IA')}
              estimate={upload.analise}
              action={t(`Read the study sheet with ${upload.analise.modelo} · ≈ ${upload.analise.custo_zyt_aprox} ZYT`, `Ler a ficha com ${upload.analise.modelo} · ≈ ${upload.analise.custo_zyt_aprox} ZYT`)}
              waiting={t('The AI is reading the documents…', 'A IA está lendo os documentos…')}
              pending={flow.analyse.isPending}
              error={flow.analyse.error}
              onRun={() => flow.analyse.mutate()}
            >
              {t(
                'The AI receives the text of the documents and what the data already say about the study, so it does not repeat it. Each item it returns cites the file, the page and a copied excerpt.',
                'Vai para a IA o texto dos documentos e o que os dados já dizem do estudo, para ela não repetir. Cada item que ela devolve cita arquivo, página e um trecho copiado.',
              )}
            </AnalysisCard>
          ) : upload.ficha && upload.conferencia && vocabulary.data ? (
            <Review key={upload.id} upload={upload} vocabulary={vocabulary.data} approve={flow.approve} />
          ) : vocabulary.isError ? (
            <Callout tone="error">{vocabulary.error.message}</Callout>
          ) : (
            <Loading label={t('Opening the review…', 'Abrindo a revisão…')} />
          )}
        </>
      )}

      <Callout icon={IconInfo}>
        {t(
          'Each item cites the page; the code checks the excerpt against the document text and nothing is saved without your review. The data outweigh the document: if the written range does not cover the range in the data, the study sheet shows both and records an alert.',
          'Cada item cita a página; o código confere o trecho no texto do documento e nada é gravado sem a sua revisão. Os dados valem mais que o documento: se a faixa escrita não cobre a dos dados, a ficha mostra os dois e registra um alerta.',
        )}
      </Callout>
    </>
  )
}
