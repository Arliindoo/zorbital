import { queryOptions } from '@tanstack/react-query'
import { td, translateResponse } from '@/shared/lib/i18n-data'
import type {
  BassPage,
  CfiPage,
  ComparisonPage,
  Dataset,
  FlexPage,
  Overview,
  Psi117Page,
  Psi142Page,
  Psi142Point,
  SheetComparison,
  SheetsPage,
  StudiesPage,
  SubmittedStudyPage,
  Vocabulary,
} from '@/shared/api/types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Lê o `detail` do FastAPI quando a resposta é um erro, para a mensagem chegar à tela. */
async function failure(response: Response): Promise<ApiError> {
  let message = `${response.status} ${response.statusText}`
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') message = td(body.detail)
  } catch {
    // corpo não é JSON: fica o status
  }
  return new ApiError(response.status, message)
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw await failure(response)
  // o banco está em português: com a interface em inglês, o texto conhecido é trocado já aqui
  return translateResponse((await response.json()) as T)
}

export async function postFile<T>(path: string, file: File): Promise<T> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(path, { method: 'POST', body })
  if (!response.ok) throw await failure(response)
  return (await response.json()) as T
}

/** Pedido que escreve (envio, revisão, aprovação): corpo em JSON ou formulário com arquivos. */
export async function send<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: FormData | object): Promise<T> {
  const form = body instanceof FormData
  const response = await fetch(path, {
    method,
    body: form ? body : body === undefined ? undefined : JSON.stringify(body),
    headers: form || body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw await failure(response)
  return (await response.json()) as T
}

const page = <T>(name: string) =>
  queryOptions({
    queryKey: ['page', name],
    queryFn: ({ signal }) => getJson<T>(`/api/pages/${name}`, signal),
  })

// O banco é só leitura enquanto o servidor roda: os dados não ficam velhos.
export const queries = {
  overview: () =>
    queryOptions({ queryKey: ['overview'], queryFn: ({ signal }) => getJson<Overview>('/api/overview', signal) }),
  flex: () => page<FlexPage>('flex'),
  bass: () => page<BassPage>('bass'),
  cfi: () => page<CfiPage>('cfi'),
  psi117: () => page<Psi117Page>('psi117'),
  psi142: () => page<Psi142Page>('psi142'),
  psi142Set: (id: number) =>
    queryOptions({
      queryKey: ['page', 'psi142', id],
      queryFn: ({ signal }) => getJson<Dataset<Psi142Point>>(`/api/pages/psi142/${id}`, signal),
    }),
  comparison: () => page<ComparisonPage>('comparacao'),
  exploreSources: () =>
    queryOptions({
      queryKey: ['explore', 'sources'],
      queryFn: ({ signal }) => getJson<string[]>('/api/explore/sources', signal),
    }),
  exploreSource: (name: string) =>
    queryOptions({
      queryKey: ['explore', 'source', name],
      queryFn: ({ signal }) => getJson<Dataset>(`/api/explore/sources/${encodeURIComponent(name)}`, signal),
    }),
  studies: () =>
    queryOptions({
      queryKey: ['studies'],
      queryFn: ({ signal }) => getJson<StudiesPage>('/api/studies', signal),
    }),
  submittedStudy: (id: string) =>
    queryOptions({
      queryKey: ['page', 'estudos', id],
      queryFn: ({ signal }) => getJson<SubmittedStudyPage>(`/api/pages/estudos/${encodeURIComponent(id)}`, signal),
    }),
  sheets: () => page<SheetsPage>('fichas'),
  sheetComparison: (ids: readonly string[]) =>
    queryOptions({
      queryKey: ['fichas', 'comparar', ...ids],
      queryFn: ({ signal }) =>
        getJson<SheetComparison>(`/api/fichas/comparar?${ids.map((id) => `ids=${encodeURIComponent(id)}`).join('&')}`, signal),
    }),
  vocabulary: () =>
    queryOptions({
      queryKey: ['envios', 'vocabulario'],
      queryFn: ({ signal }) => getJson<Vocabulary>('/api/envios/vocabulario', signal),
    }),
  assistantPages: () =>
    queryOptions({
      queryKey: ['assistant', 'pages'],
      queryFn: ({ signal }) => getJson<Record<string, string[]>>('/api/assistant/pages', signal),
    }),
}
