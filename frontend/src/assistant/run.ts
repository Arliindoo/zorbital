import { useCallback, useEffect, useRef, useState } from 'react'
import { askDemo, DEMO_MODE } from './demo'
import { useAssistant } from './store'
import { ask } from './stream'
import { type Box, collectTargets, pickVisible, type TargetEl, viewportBox } from './targets'
import type { ApiMessage, PageKey, Screen, ScreenDigest, Source, Study, ViewMessage } from './types'

/** As etapas são reais: saem dos eventos do fluxo (envio da tela, fichas dos estudos, consultas, texto, fim). */
export type StageId = 'ler' | 'estudos' | 'consultar' | 'compor' | 'concluido'

export const STAGES: readonly { id: StageId; n: string; label: string; doing: string }[] = [
  { id: 'ler', n: '01', label: 'Ler a tela', doing: 'Lendo a tela' },
  { id: 'estudos', n: '02', label: 'Estudos', doing: 'Consultando os estudos' },
  { id: 'consultar', n: '03', label: 'Consultar', doing: 'Consultando o banco' },
  { id: 'compor', n: '04', label: 'Compor', doing: 'Compondo a resposta' },
  { id: 'concluido', n: '05', label: 'Concluído', doing: 'Concluído' },
]
export const STAGE_COUNT = STAGES.length
export const LAST_N = STAGES[STAGE_COUNT - 1]!.n

export type RunStatus = 'running' | 'done' | 'error' | 'stopped'
export type StepState = 'pending' | 'active' | 'done' | 'skipped' | 'error' | 'stopped'

export interface Run {
  id: number
  page: PageKey
  question: string
  stage: StageId
  status: RunStatus
  tools: string[]
  /** Paralelo a `tools`: a consulta foi à ficha de um estudo (cautelas, origem, catálogo) e não aos dados. */
  studyTools: boolean[]
  /** Fichas dos estudos envolvidos que o servidor leu para este turno (vazio até a etapa começar). */
  studies: Study[]
  text: string
  error?: string
  cost: number | null
  startedAt: number
  /** Duração total, preenchida quando o turno acaba (de qualquer jeito). */
  ms: number | null
  /** Quando cada etapa começou, em ms desde o início. */
  stageAt: Partial<Record<StageId, number>>
  sources: Source[]
  digest: ScreenDigest
  /** As consultas já voltaram e o modelo está lendo os resultados (ainda sem texto). */
  thinking: boolean
}

const ORDER: Record<StageId, number> = { ler: 0, estudos: 1, consultar: 2, compor: 3, concluido: 4 }

type Progress = Pick<Run, 'stage' | 'status' | 'tools' | 'studyTools' | 'studies'>

/** Consultas aos dados (o que não foi à ficha de um estudo). */
export const dataQueries = (run: Pick<Run, 'tools' | 'studyTools'>): number => run.tools.filter((_, i) => !run.studyTools[i]).length
export const studyQueries = (run: Pick<Run, 'studyTools'>): number => run.studyTools.filter(Boolean).length

export function stepState(run: Progress, id: StageId): StepState {
  const at = ORDER[run.stage]
  const i = ORDER[id]
  const empty =
    (id === 'consultar' && dataQueries(run) === 0) || (id === 'estudos' && run.studies.length === 0 && studyQueries(run) === 0)
  const passed = empty ? 'skipped' : 'done'
  if (run.status === 'done') return passed
  if (i < at) return passed
  if (i > at) return 'pending'
  return run.status === 'running' ? 'active' : run.status
}

export function stepStates(run: Progress): StepState[] {
  return STAGES.map((s) => stepState(run, s.id))
}

/** Um turno já gravado visto como execução encerrada (para o histórico usar a mesma vista). */
export function settledSteps(message: ViewMessage): StepState[] {
  const tools = message.tools ?? []
  return stepStates({
    stage: 'concluido',
    status: 'done',
    tools,
    studyTools: tools.map((_, i) => message.studyTools?.[i] ?? false),
    studies: message.studies ?? [],
  })
}

export function digestOf(screen: Screen | null, blocos: number): ScreenDigest {
  const filtros = Object.values(screen?.filtros ?? {}).filter(
    (v) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0),
  ).length
  return {
    blocos,
    graficos: screen?.graficos?.length ?? 0,
    linhas: screen?.dados ? screen.dados.length : null,
    filtros,
  }
}

function toSource(t: TargetEl): Source {
  return { id: t.id, kind: t.kind, label: t.label }
}

/**
 * De onde saem os blocos da etapa "Ler a tela": só os que estão à vista (o palco os acende na página) ou
 * os da página inteira (no celular o chat cobre a página, então "à vista" não quer dizer nada).
 */
export type ReadScope = 'view' | 'page'

const WHOLE_PAGE: Box = { x: -1e6, y: -1e6, w: 2e6, h: 2e6 }

export interface AgentRun {
  run: Run | null
  /** Blocos da página que entraram na leitura (os mesmos de `run.sources`, com o elemento vivo). */
  targets: readonly TargetEl[]
  start: (question: string, scope?: ReadScope) => void
  stop: () => void
  /** Tira da tela um turno que parou ou falhou. */
  dismiss: () => void
}

let nextId = 1

/**
 * Cadência da encenação. O servidor manda as consultas de uma rodada todas de uma vez e, com alguns
 * modelos, a resposta inteira num só jato; aqui os eventos entram numa fila e são mostrados no ritmo de
 * leitura: uma consulta por vez e o texto "digitado". Nada é inventado, só espaçado (no máximo ~2 s).
 */
const MIN_READ_MS = 1000 // a etapa "Ler a tela" fica à vista pelo menos uma varredura
const STUDY_MS = 1100 // as fichas dos estudos ficam à vista antes da primeira consulta
const STUDY_EACH_MS = 220 // …e um pouco mais por estudo (a visão geral traz todos)
const TOOL_GAP_MS = 260
const TEXT_AFTER_TOOL_MS = 420
const THINKING_AFTER_MS = 900
const MIN_COMPOSE_MS = 650
const TYPE_MIN_CPS = 260
const TYPE_BACKLOG_RATE = 2.4

type Queued = { kind: 'studies'; items: Study[] } | { kind: 'tool'; label: string; study: boolean } | { kind: 'text'; text: string }
type Ending =
  | { kind: 'done'; cost: number | null; history: ApiMessage[] }
  | { kind: 'error'; message: string }

interface Active {
  controller: AbortController
  /** Para a encenação sem mexer no estado (troca de página). */
  cancel: () => void
  /** O fluxo já acabou e só falta mostrar: mostra tudo de uma vez. Devolve false se ainda há fluxo. */
  flush: () => boolean
}

/**
 * Faz a pergunta e mantém o estado da execução. A conversa só é gravada quando o servidor fecha o turno
 * (`done`); trocar de página ou fechar o agente interrompe o que estava em andamento.
 */
export function useAgentRun(): AgentRun {
  const { open, current, screenRef, conversation, saveConversation } = useAssistant()
  const [run, setRun] = useState<Run | null>(null)
  const [targets, setTargets] = useState<readonly TargetEl[]>([])
  const active = useRef<Active | null>(null)
  const page = current?.pagina

  useEffect(
    () => () => {
      const now = active.current
      active.current = null
      now?.cancel()
      now?.controller.abort()
      setRun(null)
      setTargets([])
    },
    [page],
  )
  // fechar o agente interrompe a execução; o turno parado continua lá para quem reabrir
  useEffect(() => {
    if (!open) active.current?.controller.abort()
  }, [open])

  const start = useCallback(
    (question: string, scope: ReadScope = 'view') => {
      const screen = screenRef.current
      if (!screen || active.current) return
      const state = conversation(screen.pagina)
      const controller = new AbortController()

      const all = collectTargets()
      const seen = pickVisible(all, scope === 'page' ? WHOLE_PAGE : viewportBox())
      const startedAt = Date.now()
      const draft: Run = {
        id: nextId++,
        page: screen.pagina,
        question,
        stage: 'ler',
        status: 'running',
        tools: [],
        studyTools: [],
        studies: [],
        text: '',
        cost: null,
        startedAt,
        ms: null,
        stageAt: { ler: 0 },
        sources: seen.map(toSource),
        digest: digestOf(screen, all.length),
        thinking: false,
      }

      const queue: Queued[] = []
      let ending: Ending | null = null
      let instant = false
      let frame = 0
      let timer = 0
      let lastTick = performance.now()
      let lastToolAt = -Infinity
      let firstTextAt = -Infinity
      /** Até quando as fichas dos estudos seguram a fila (para dar tempo de ler quem está em jogo). */
      let studiesUntil = -Infinity
      const t0 = lastTick

      const mine = () => active.current === me
      const publish = () => {
        if (mine()) setRun({ ...draft, tools: [...draft.tools], studyTools: [...draft.studyTools], stageAt: { ...draft.stageAt } })
      }
      const halt = () => {
        window.cancelAnimationFrame(frame)
        window.clearInterval(timer)
      }
      const addTool = (label: string, study: boolean) => {
        draft.tools.push(label)
        draft.studyTools.push(study)
        // uma ida à ficha de um estudo pertence à etapa de estudos; só avança para "Consultar" com dados
        if (!study) enter('consultar')
        else if (ORDER[draft.stage] < ORDER.estudos) enter('estudos')
      }
      const enter = (stage: StageId) => {
        if (draft.stage === stage) return
        draft.stage = stage
        draft.stageAt[stage] ??= Date.now() - startedAt
      }
      const finish = (status: RunStatus, error?: string) => {
        halt()
        draft.status = status
        draft.thinking = false
        draft.error = error ?? draft.error
        draft.ms ??= Date.now() - startedAt
        if (!mine()) return
        active.current = null
        setRun({ ...draft, tools: [...draft.tools], studyTools: [...draft.studyTools], stageAt: { ...draft.stageAt } })
      }
      const conclude = (end: Ending) => {
        if (end.kind === 'error') return finish('error', end.message)
        draft.cost = end.cost
        enter('concluido')
        if (mine()) {
          saveConversation(screen.pagina, {
            api: end.history,
            view: [
              ...state.view,
              { role: 'user', text: question, at: startedAt },
              {
                role: 'assistant',
                text: draft.text,
                tools: [...draft.tools],
                studyTools: [...draft.studyTools],
                studies: draft.studies,
                cost: draft.cost,
                ms: draft.ms ?? Date.now() - startedAt,
                sources: draft.sources,
                digest: draft.digest,
              },
            ],
          })
        }
        finish('done')
      }

      /** Um passo da encenação: tira da fila o que já pode aparecer. Chamado a cada quadro. */
      const tick = () => {
        if (!mine()) return halt()
        const now = performance.now()
        const dt = Math.min(250, now - lastTick)
        lastTick = now
        let changed = false

        if (instant) {
          for (const item of queue.splice(0)) {
            if (item.kind === 'studies') {
              draft.studies = item.items
              if (item.items.length) enter('estudos')
            } else if (item.kind === 'tool') addTool(item.label, item.study)
            else draft.text += item.text
          }
          if (draft.text) enter('compor')
          if (ending) return conclude(ending)
        }

        const head = queue[0]
        if (head && now - t0 >= MIN_READ_MS && now >= studiesUntil) {
          if (head.kind === 'studies') {
            draft.studies = head.items
            if (head.items.length) {
              enter('estudos')
              studiesUntil = now + STUDY_MS + STUDY_EACH_MS * Math.min(5, head.items.length - 1)
            }
            queue.shift()
            changed = true
          } else if (head.kind === 'tool') {
            if (now - lastToolAt >= TOOL_GAP_MS) {
              addTool(head.label, head.study)
              draft.thinking = false
              lastToolAt = now
              queue.shift()
              changed = true
            }
          } else if (now - lastToolAt >= TEXT_AFTER_TOOL_MS) {
            const backlog = queue.reduce((n, q) => (q.kind === 'text' ? n + q.text.length : n), 0)
            let budget = Math.max(1, Math.ceil((Math.max(TYPE_MIN_CPS, backlog * TYPE_BACKLOG_RATE) * dt) / 1000))
            if (firstTextAt === -Infinity) firstTextAt = now
            enter('compor')
            draft.thinking = false
            while (budget > 0 && queue[0]?.kind === 'text') {
              const item = queue[0]
              const piece = item.text.slice(0, budget)
              draft.text += piece
              budget -= piece.length
              item.text = item.text.slice(piece.length)
              if (!item.text) queue.shift()
            }
            changed = true
          }
        } else if (!head && ending) {
          if (ending.kind === 'error' || now - firstTextAt >= MIN_COMPOSE_MS) return conclude(ending)
        } else if (
          !head &&
          !draft.thinking &&
          ((draft.stage === 'consultar' && now - lastToolAt >= THINKING_AFTER_MS) ||
            (draft.stage === 'estudos' && now >= studiesUntil + 500 && now - lastToolAt >= THINKING_AFTER_MS))
        ) {
          draft.thinking = true
          changed = true
        }
        if (changed) publish()
      }

      const me: Active = {
        controller,
        cancel: halt,
        flush: () => {
          if (!ending) return false
          instant = true
          return true
        },
      }
      active.current = me
      setTargets(seen)
      setRun({ ...draft })

      const loop = () => {
        tick()
        if (mine()) frame = window.requestAnimationFrame(loop)
      }
      frame = window.requestAnimationFrame(loop)
      // com a aba em segundo plano não há quadros: o temporizador mantém a fila andando
      timer = window.setInterval(() => {
        if (performance.now() - lastTick > 200) tick()
      }, 250)

      void (async () => {
        try {
          const events = DEMO_MODE
            ? askDemo(DEMO_MODE, screen, state.api, question, controller.signal)
            : ask(screen, state.api, question, controller.signal)
          let error: string | null = null
          for await (const event of events) {
            if (event.type === 'text') {
              const last = queue[queue.length - 1]
              if (last?.kind === 'text') last.text += event.text
              else queue.push({ kind: 'text', text: event.text })
            } else if (event.type === 'studies') {
              queue.push({ kind: 'studies', items: event.items })
            } else if (event.type === 'tool') {
              queue.push({ kind: 'tool', label: event.label, study: event.study ?? false })
            } else if (event.type === 'error') {
              error = event.message
            } else {
              // o relógio para quando o servidor fecha o turno, não quando a encenação termina
              draft.ms = Date.now() - startedAt
              ending = { kind: 'done', cost: event.cost, history: event.history }
              return
            }
          }
          // o fluxo acabou sem "done": o erro já explicado fica na tela até a próxima pergunta
          draft.ms = Date.now() - startedAt
          ending = { kind: 'error', message: error ?? 'A resposta foi interrompida antes do fim.' }
        } catch (error) {
          if (controller.signal.aborted) {
            // "Parar" mantém o que já apareceu; troca de página já limpou tudo
            finish('stopped')
            return
          }
          draft.ms = Date.now() - startedAt
          ending = { kind: 'error', message: `Sem resposta do servidor (${String(error)}).` }
        }
      })()
    },
    [conversation, saveConversation, screenRef],
  )

  const stop = useCallback(() => {
    const now = active.current
    // se o servidor já terminou e só falta mostrar, "Parar" pula a animação em vez de descartar a resposta
    if (now && !now.flush()) now.controller.abort()
  }, [])

  const dismiss = useCallback(() => {
    if (active.current) return
    setRun(null)
  }, [])

  return { run, targets, start, stop, dismiss }
}
