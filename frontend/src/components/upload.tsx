/** Peças do envio (estudo novo ou documentos): etapas, área de arquivos e os blocos comuns às duas telas. */

import { type CSSProperties, type DragEvent, type ReactNode, useRef, useState } from 'react'
import type { AnalysisEstimate, StoredFile } from '@/api/types'
import { IconAdd, IconCheck, IconClose, IconDocument, IconMagic, IconTrash, IconUpload } from '@/icons'
import { int } from '@/lib/format'
import type { DraftStage } from '@/lib/useUpload'
import { DataTable } from './DataTable'
import { Loading } from './Loading'
import { Callout, Caption, Expander, Panel } from './ui'

// ---------- Etapas --------------------------------------------------------------------------------

export function Steps({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="steps" aria-label="Etapas do envio">
      {steps.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li key={step} data-state={state} aria-current={state === 'current' ? 'step' : undefined} style={{ '--i': i } as CSSProperties}>
            <i>{state === 'done' ? <IconCheck size={15} /> : i + 1}</i>
            <span className="label">{step}</span>
          </li>
        )
      })}
    </ol>
  )
}

// ---------- Área de arquivos ----------------------------------------------------------------------

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`)

export function Dropzone({ files, onChange, accept, hint }: { files: readonly File[]; onChange: (files: File[]) => void; accept: readonly string[]; hint: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const allowed = (file: File) => accept.some((suffix) => file.name.toLowerCase().endsWith(`.${suffix}`))
  const add = (list: FileList | null) => {
    if (!list) return
    const known = new Set(files.map((f) => `${f.name}:${f.size}`))
    onChange([...files, ...[...list].filter((f) => allowed(f) && !known.has(`${f.name}:${f.size}`))])
  }
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    add(event.dataTransfer.files)
  }
  return (
    <div className="field">
      <div
        className="dropzone"
        data-over={over || undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <span className="hud-corners" aria-hidden />
        <IconUpload size={26} />
        <p>
          Solte os arquivos aqui ou{' '}
          <button type="button" className="link-button" onClick={() => input.current?.click()}>
            escolha no computador
          </button>
        </p>
        <span className="caption">{hint}</span>
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          accept={accept.map((suffix) => `.${suffix}`).join(',')}
          aria-label="Arquivos do envio"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {files.length > 0 && (
        <div className="chips">
          {files.map((file) => (
            <span key={`${file.name}:${file.size}`} className="chip">
              <IconDocument size={13} />
              {file.name}
              <small>{size(file.size)}</small>
              <button type="button" aria-label={`Tirar ${file.name}`} onClick={() => onChange(files.filter((f) => f !== file))}>
                <IconClose size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function SaveState({ stage, failure }: { stage: DraftStage; failure: string | null }) {
  const text = { saved: 'Revisão salva no envio', dirty: 'Salvando…', saving: 'Salvando…', error: `Não foi possível salvar: ${failure ?? ''}` }[stage]
  return (
    <span className="save-state label" data-stage={stage} role="status">
      <i /> {text}
    </span>
  )
}

// ---------- Blocos comuns às duas telas -----------------------------------------------------------

export function UploadBar({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="upload-bar">
      <div>
        <h2>{title}</h2>
        {children && <p className="caption">{children}</p>}
      </div>
      {action}
    </div>
  )
}

export function DiscardButton({ approved, pending, onDiscard, onNew }: { approved: boolean; pending: boolean; onDiscard: () => void; onNew: () => void }) {
  return approved ? (
    <button type="button" className="button button--ghost" onClick={onNew}>
      <IconAdd size={14} /> Novo envio
    </button>
  ) : (
    <button type="button" className="button button--ghost" disabled={pending} onClick={onDiscard}>
      <IconTrash size={14} /> Descartar envio
    </button>
  )
}

const KIND: Record<string, string> = { tabela: 'Tabela', documento: 'Documento', tabela_nao_suportada: 'Tabela não suportada', outro: 'Outro' }

export function ReceivedFiles({ files, title, defaultOpen }: { files: readonly StoredFile[]; title: string; defaultOpen?: boolean }) {
  return (
    <Expander title={`${title} (${files.length})`} icon={IconDocument} defaultOpen={defaultOpen}>
      <DataTable
        rows={files.map((f) => ({ caminho: f.caminho, tipo: KIND[f.tipo] ?? f.tipo, tamanho: f.tamanho, origem: f.origem }))}
        filename="arquivos_do_envio"
        config={{ caminho: 'Arquivo', tipo: 'Tipo', tamanho: 'Bytes', origem: { label: 'Enviado como', wide: true } }}
        maxHeight={260}
      />
    </Expander>
  )
}

export function Warnings({ list }: { list: readonly string[] }) {
  return (
    <>
      {list.map((warning) => (
        <Callout key={warning} tone="warning">
          {warning}
        </Callout>
      ))}
    </>
  )
}

/** O que vai para a IA e quanto custa, antes de chamar. */
export function AnalysisCard({
  title,
  estimate,
  children,
  action,
  waiting,
  pending,
  error,
  onRun,
}: {
  title: string
  estimate: AnalysisEstimate
  children: ReactNode
  action: string
  waiting: string
  pending: boolean
  error: Error | null
  onRun: () => void
}) {
  return (
    <Panel
      hud
      icon={IconMagic}
      title={title}
      tag={estimate.modelo}
      foot={[
        ...(estimate.abas === undefined ? [] : [{ label: 'Abas de tabela', value: estimate.abas }]),
        { label: 'Documentos', value: estimate.documentos },
        { label: 'Tokens de entrada', value: `≈ ${int(estimate.tokens_entrada_aprox)}` },
        { label: 'Custo estimado', value: `≈ ${estimate.custo_zyt_aprox}`, unit: 'ZYT' },
      ]}
    >
      <Caption>{children}</Caption>
      {estimate.documentos_cortados && <Callout tone="warning">Os documentos passam do limite de leitura e foram cortados: mande menos ou menores.</Callout>}
      {error && <Callout tone="error">{error.message}</Callout>}
      {pending ? (
        <Loading label={waiting} />
      ) : (
        <button type="button" className="button upload__go" onClick={onRun}>
          <IconMagic size={16} /> {action}
        </button>
      )}
    </Panel>
  )
}

export function Problems({ list, ok }: { list: readonly string[]; ok: ReactNode }) {
  return list.length ? (
    <Callout tone="error">
      <strong>{list.length} ponto(s) impedem aprovar:</strong>
      <ul className="problems">
        {list.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </Callout>
  ) : (
    <Callout tone="success">{ok}</Callout>
  )
}
