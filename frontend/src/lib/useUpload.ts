/** Estado de um envio (estudo novo ou documentos) e o rascunho da revisão, salvo no servidor. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getJson, send } from '@/api/client'
import { storage } from './storage'

interface UploadState {
  id: string
  estado: string
}

/**
 * Um envio em andamento: o servidor guarda tudo na pasta do envio e o navegador só lembra o
 * identificador, então recarregar a página (ou voltar outro dia) continua de onde parou.
 */
export function useUpload<T extends UploadState>(kind: 'envios' | 'documentos') {
  const client = useQueryClient()
  const key = `${kind}:atual`
  const [id, setIdState] = useState<string | null>(() => storage.get<string>(key))
  const setId = useCallback(
    (next: string | null) => {
      storage.set(key, next)
      setIdState(next)
    },
    [key],
  )
  const queryKey = [kind, id] as const
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getJson<T>(`/api/${kind}/${id}`, signal),
    enabled: !!id,
    retry: false,
  })
  // o envio foi descartado em outra aba, ou a pasta data/uploads foi limpa: a tela volta ao começo
  const gone = query.error instanceof ApiError && query.error.status === 404
  useEffect(() => {
    if (gone) storage.set(key, null)
  }, [gone, key])

  const store = (state: T) => {
    client.setQueryData([kind, state.id], state)
    setId(state.id)
  }
  const receive = useMutation({ mutationFn: (form: FormData) => send<T>('POST', `/api/${kind}`, form), onSuccess: store })
  const analyse = useMutation({ mutationFn: () => send<T>('POST', `/api/${kind}/${id}/analisar`), onSuccess: store })
  const approve = useMutation({
    mutationFn: (substituir: boolean) => send<T>('POST', `/api/${kind}/${id}/aprovar`, { substituir }),
    onSuccess: (state) => {
      store(state)
      // o banco foi refeito: tudo o que as outras páginas já baixaram ficou velho
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== kind })
    },
  })
  const discard = useMutation({
    mutationFn: () => send<{ ok: boolean }>('DELETE', `/api/${kind}/${id}`),
    onSettled: () => {
      client.removeQueries({ queryKey })
      setId(null)
    },
  })
  return { id, upload: id && !gone ? query.data : undefined, loading: !!id && query.isPending, error: gone ? null : query.error, receive, analyse, approve, discard, reset: () => setId(null) }
}

export type DraftStage = 'saved' | 'dirty' | 'saving' | 'error'

/**
 * Rascunho da revisão: cada edição vale na hora na tela e é gravada no envio meio segundo depois;
 * a conferência (problemas, prévia) volta com a gravação.
 */
export function useDraft<T, C>(initial: T, initialCheck: C, save: (value: T) => Promise<C>) {
  const [value, setValue] = useState(initial)
  const [check, setCheck] = useState(initialCheck)
  const [stage, setStage] = useState<DraftStage>('saved')
  const [failure, setFailure] = useState<string | null>(null)
  const latest = useRef(initial)
  const version = useRef(0)
  const saver = useRef(save)
  useEffect(() => {
    saver.current = save
  })

  const update = useCallback((edit: (draft: T) => void) => {
    const next = structuredClone(latest.current)
    edit(next)
    latest.current = next
    version.current += 1
    setValue(next)
    setStage('dirty')
  }, [])

  useEffect(() => {
    if (stage !== 'dirty') return
    const sent = version.current
    const timer = window.setTimeout(() => {
      setStage('saving')
      saver.current(latest.current).then(
        (result) => {
          setCheck(result)
          setFailure(null)
          // editou durante a gravação: grava de novo com o que ficou
          setStage(version.current === sent ? 'saved' : 'dirty')
        },
        (error: unknown) => {
          setFailure(error instanceof Error ? error.message : String(error))
          setStage('error')
        },
      )
    }, 500)
    return () => window.clearTimeout(timer)
  }, [stage, value])

  return { value, check, stage, failure, update }
}
