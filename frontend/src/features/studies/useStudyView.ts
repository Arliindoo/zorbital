import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type StudyView = 'painel' | 'simulacao'

/** A vista fica no endereço (`?vista=simulacao`): dá para voltar, recarregar e mandar o link. */
export function useStudyView(): [StudyView, (view: StudyView) => void] {
  const [params, setParams] = useSearchParams()
  const view: StudyView = params.get('vista') === 'simulacao' ? 'simulacao' : 'painel'
  const set = useCallback(
    (next: StudyView) =>
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev)
          if (next === 'painel') out.delete('vista')
          else out.set('vista', next)
          return out
        },
        { preventScrollReset: true },
      ),
    [setParams],
  )
  return [view, set]
}
