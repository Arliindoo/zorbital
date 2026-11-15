import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import '@/styles/assistant.css'
import { Dock, type DockMode } from './Dock'
import { Overlay, type OverlayPhase } from './Overlay'
import { Panel, type PanelLayout, type Turn } from './Panel'
import { digestOf, settledSteps, STAGE_COUNT, STAGES, stepStates, useAgentRun } from './run'
import { useAssistant } from './store'
import { collectTargets, stageElement, type TargetEl } from './targets'
import type { PageKey, ScreenDigest, ViewMessage } from './types'
import { useMediaQuery } from './util'

const SUGGESTIONS: Record<PageKey, string[]> = t(
  {
    overview: ['What is the difference between the three investigations?', 'Which files were duplicates?'],
    flex: ['Explain the chart of tested conditions', 'Why are some tests missing from the 2nd chart?'],
    bass: ['Which materials were tested the most?', 'Which tests have alerts, and why?'],
    psi117: ['At which pressures does the model leave the uncertainty band?', 'What is a cool flame?'],
    cfi: ['How does cool flame extinction change with pressure?', 'What does cool Dext = 0 mean in the source?'],
    psi142: ['What does this dataset show?', 'Why are there alerts in this dataset?'],
    comparacao: ['Does the PSI-117 model follow the CFI flights?', 'Why is this not independent validation?'],
    estudos: ['What did this study measure?', 'Which interpretations came from the document and which were inferred?'],
    fichas: ['What do these studies have in common?', 'Can the extinction diameter be compared across them?'],
    explore: ['What does this chart show?', 'Which series has the highest value?'],
  },
  {
    overview: ['Qual a diferença entre as três investigações?', 'Quais arquivos eram repetidos?'],
    flex: ['Explique o gráfico de condições testadas', 'Por que alguns ensaios não aparecem no 2º gráfico?'],
    bass: ['Quais materiais foram mais testados?', 'Quais testes têm alertas e por quê?'],
    psi117: ['Em que pressões o modelo sai da faixa de incerteza?', 'O que é uma chama fria?'],
    cfi: ['Como a extinção da chama fria muda com a pressão?', 'O que quer dizer Dext fria = 0 na fonte?'],
    psi142: ['O que este conjunto mostra?', 'Por que há alertas neste conjunto?'],
    comparacao: ['O modelo do PSI-117 acompanha os voos do CFI?', 'Por que isso não é validação independente?'],
    estudos: ['O que este estudo mediu?', 'Quais interpretações vieram do documento e quais foram inferidas?'],
    fichas: ['O que estes estudos têm em comum?', 'Dá para comparar o diâmetro de extinção entre eles?'],
    explore: ['O que este gráfico mostra?', 'Qual série tem o maior valor?'],
  },
)
const FOLLOW_UPS = t(
  ['Summarize in three points', 'Which cautions apply to this data?', 'Show the numbers behind this'],
  ['Resuma em três pontos', 'Quais cautelas valem para estes dados?', 'Mostre os números por trás disso'],
)

const PANEL_W = 468
const PANEL_W_WIDE = 620
const PANEL_GAP = 12

function sameDigest(a: ScreenDigest | null, b: ScreenDigest): boolean {
  return !!a && a.blocos === b.blocos && a.graficos === b.graficos && a.linhas === b.linhas && a.filtros === b.filtros
}

/**
 * O agente na própria dashboard.
 *
 * Uma barra de comando fica no rodapé (⌘K). Ao perguntar, ela vira o trilho das quatro etapas, a página
 * escurece e os blocos à vista são "lidos": cantoneiras, varredura e feixes que convergem para o núcleo,
 * no painel que abre ao lado. As consultas ao banco entram na linha do tempo, a resposta cresce a partir
 * dela e, no fim, a página volta ao brilho normal com a resposta e o recibo da execução ao lado.
 *
 * No celular não há página ao lado para acender: o chat se expande e cobre a tela inteira, e as conexões
 * (blocos lidos, fichas dos estudos, consultas ao banco) nascem dentro dele, como ramos da linha do tempo.
 */
export function AssistantWidget() {
  const { open, docked, setOpen, setDocked, focusTick, current, screenRef, conversation, saveConversation } = useAssistant()
  const { run, targets, start, stop, dismiss } = useAgentRun()
  const [input, setInput] = useState('')
  const [digest, setDigest] = useState<ScreenDigest | null>(null)
  const [settledId, setSettledId] = useState<number | null>(null)
  // a barra só se expande (sugestões, faixa "na tela") enquanto o foco está nela; em repouso é uma pílula
  const [engaged, setEngaged] = useState(false)
  const [peek, setPeek] = useState<readonly TargetEl[] | null>(null)
  const [left, setLeft] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const stopRef = useRef<HTMLButtonElement>(null)
  const side = useMediaQuery('(min-width: 1180px)')
  const roomy = useMediaQuery('(min-width: 1500px)')
  const phone = useMediaQuery('(max-width: 760px)')
  const layout: PanelLayout = side ? 'side' : phone ? 'full' : 'sheet'

  const page = current?.pagina
  const running = run?.status === 'running'
  const conv = page ? conversation(page) : null

  const turns = useMemo(() => {
    const list: Turn[] = []
    const view: readonly ViewMessage[] = conv?.view ?? []
    for (let i = 0; i < view.length; i++) {
      const user = view[i]!
      const answer = view[i + 1]
      if (user.role !== 'user' || answer?.role !== 'assistant') continue
      i++
      list.push({
        key: `t${list.length}`,
        question: user.text,
        at: user.at,
        text: answer.text,
        tools: answer.tools ?? [],
        studyTools: answer.studyTools ?? [],
        studies: answer.studies ?? [],
        steps: settledSteps(answer),
        status: 'done',
        stage: 'concluido',
        cost: answer.cost ?? null,
        ms: answer.ms ?? null,
        sources: answer.sources ?? [],
        digest: answer.digest ?? null,
        live: false,
      })
    }
    if (run && run.page === page) {
      const last = list[list.length - 1]
      if (run.status === 'done') {
        // o turno que acabou de fechar já está gravado: só ganha os tempos por etapa e as entradas animadas
        if (last && last.question === run.question) list[list.length - 1] = { ...last, live: true, stageAt: run.stageAt }
      } else {
        list.push({
          key: `t${list.length}`,
          question: run.question,
          at: run.startedAt,
          text: run.text,
          tools: run.tools,
          studyTools: run.studyTools,
          studies: run.studies,
          thinking: run.thinking,
          steps: stepStates(run),
          status: run.status,
          stage: run.stage,
          error: run.error,
          cost: run.cost,
          ms: run.ms,
          stageAt: run.stageAt,
          sources: run.sources,
          digest: run.digest,
          live: true,
        })
      }
    }
    return list
  }, [conv, run, page])

  // no celular o chat abre inteiro já ao tocar na barra, mesmo antes da primeira pergunta
  const panelShown = open && (layout === 'full' || turns.length > 0)
  const cover = panelShown && layout === 'full'
  const wide = docked && side && roomy
  const inset = panelShown && side ? (wide ? PANEL_W_WIDE : PANEL_W) + PANEL_GAP : 0

  // a página abre espaço para o painel lateral (o palco aplica --agent-inset como recuo à direita)
  useEffect(() => {
    document.documentElement.style.setProperty('--agent-inset', `${inset}px`)
    return () => {
      document.documentElement.style.setProperty('--agent-inset', '0px')
    }
  }, [inset])

  // com o chat cobrindo a tela, ele ocupa só o que está visível de fato: o teclado do celular encolhe a
  // área visível sem encolher a janela, então a medida vem de visualViewport; a página por baixo não rola
  useEffect(() => {
    if (!cover) return
    const el = root.current
    const html = document.documentElement
    const view = window.visualViewport
    const sync = () => {
      el?.style.setProperty('--ag-vh', `${Math.round(view?.height ?? window.innerHeight)}px`)
      el?.style.setProperty('--ag-vtop', `${Math.round(view?.offsetTop ?? 0)}px`)
    }
    sync()
    html.setAttribute('data-agent-cover', '')
    view?.addEventListener('resize', sync)
    view?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    return () => {
      html.removeAttribute('data-agent-cover')
      view?.removeEventListener('resize', sync)
      view?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      el?.style.removeProperty('--ag-vh')
      el?.style.removeProperty('--ag-vtop')
    }
  }, [cover])

  // onde o palco começa (trilho + filtros), para centralizar a barra no conteúdo; e o resumo da tela
  useEffect(() => {
    const read = () => {
      const stage = stageElement()
      setLeft(stage ? Math.max(0, Math.round(stage.getBoundingClientRect().left)) : 0)
      if (open) {
        const next = digestOf(screenRef.current, collectTargets().length)
        setDigest((prev) => (sameDigest(prev, next) ? prev : next))
      }
    }
    read()
    const timer = window.setInterval(read, 600)
    window.addEventListener('resize', read)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', read)
    }
  }, [open, page, screenRef])

  // depois de acabar, o trilho fica um instante com o resultado e só então a barra volta a ser pergunta
  const runId = run?.id ?? null
  const runStatus = run?.status
  useEffect(() => {
    if (runId === null || runStatus === 'running') return
    const timer = window.setTimeout(() => setSettledId(runId), runStatus === 'done' ? 1700 : 2400)
    return () => window.clearTimeout(timer)
  }, [runId, runStatus])

  const mode: DockMode = run && open && (running || settledId !== run.id) ? 'run' : engaged ? 'open' : 'idle'

  // em tela estreita o painel cobre a página: não reabre sozinho ao recarregar
  const openAtMount = useRef(open)
  useEffect(() => {
    if (openAtMount.current && !window.matchMedia('(min-width: 1180px)').matches) setOpen(false)
  }, [setOpen])

  // foco: pedido de abrir → campo; execução → "Parar"; fim → de volta ao campo (sem roubar foco da página)
  useEffect(() => {
    if (focusTick > 0) inputRef.current?.focus({ preventScroll: true })
  }, [focusTick])
  const lastMode = useRef(mode)
  const hasRun = run !== null
  useEffect(() => {
    const before = lastMode.current
    lastMode.current = mode
    const active = document.activeElement
    const mine = !active || active === document.body || !!root.current?.contains(active)
    if (mode === 'run' && before !== 'run') stopRef.current?.focus({ preventScroll: true })
    // no celular o foco não volta sozinho ao campo: abriria o teclado por cima da resposta
    else if (mode !== 'run' && before === 'run' && mine && hasRun && layout !== 'full') inputRef.current?.focus({ preventScroll: true })
    // o botão "Parar" some com o foco dentro e o navegador não avisa: confere se a barra ainda tem o foco
    const frame = window.requestAnimationFrame(() => {
      const dock = root.current?.querySelector('.ag-dock')
      if (!dock?.contains(document.activeElement)) setEngaged(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mode, page, hasRun, layout])

  const submit = useCallback(
    (question: string) => {
      if (!screenRef.current) return
      setPeek(null)
      setInput('')
      if (!open) setOpen(true)
      start(question, layout === 'full' ? 'page' : 'view')
    },
    [open, setOpen, start, screenRef, layout],
  )

  const close = useCallback(() => {
    setOpen(false)
    setPeek(null)
    const active = document.activeElement
    if (active instanceof HTMLElement && root.current?.contains(active)) active.blur()
  }, [setOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open && document.activeElement === inputRef.current) close()
        else setOpen(true)
        return
      }
      if (e.key !== 'Escape' || e.defaultPrevented || !open) return
      const active = document.activeElement
      const mine = !active || active === document.body || !!root.current?.contains(active)
      if (!mine) return
      e.preventDefault()
      if (running) stop()
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, running, setOpen, stop, close])

  const resolve = useCallback((id: string): TargetEl | null => {
    const all = collectTargets()
    const label = turns.flatMap((t) => t.sources).find((s) => s.id === id)?.label
    return all.find((t) => t.id === id && (!label || t.label === label)) ?? all.find((t) => t.label === label) ?? null
  }, [turns])

  const onPeek = useCallback(
    (id: string | null) => {
      const target = id && !running ? resolve(id) : null
      setPeek(target ? [target] : null)
    },
    [resolve, running],
  )
  const onLocate = useCallback(
    (id: string) => {
      const target = running ? null : resolve(id)
      if (!target) return
      const show = (smooth: boolean) => {
        target.el.scrollIntoView({ block: 'center', behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' })
        setPeek([target])
      }
      if (layout !== 'full') return show(true)
      // no celular o chat está por cima do bloco: a página vai até ele ainda coberta e o chat sai da frente
      close()
      window.requestAnimationFrame(() => show(false))
    },
    [resolve, running, layout, close],
  )

  // sem ponteiro para "sair de cima", o destaque do bloco no celular se apaga sozinho
  useEffect(() => {
    if (layout !== 'full' || !peek) return
    const timer = window.setTimeout(() => setPeek(null), 3600)
    return () => window.clearTimeout(timer)
  }, [layout, peek])

  const asked = new Set(turns.map((t) => t.question))
  const suggestions = page ? SUGGESTIONS[page] : []
  const followUps = [...suggestions.filter((s) => !asked.has(s)), ...FOLLOW_UPS.filter((s) => !asked.has(s))].slice(0, 3)

  // com o chat cobrindo a tela não há palco: as conexões aparecem na linha do tempo do próprio chat
  const phase: OverlayPhase | null = cover ? null : running && run.stage !== 'concluido' ? run.stage : peek && !running ? 'peek' : null
  const overlayTargets = phase === 'peek' ? (peek ?? []) : targets
  const stageIndex = run ? STAGES.findIndex((s) => s.id === run.stage) : -1
  const status = !run
    ? ''
    : run.status === 'running'
      ? t(`Step ${stageIndex + 1} of ${STAGE_COUNT}: ${STAGES[stageIndex]!.doing}.`, `Etapa ${stageIndex + 1} de ${STAGE_COUNT}: ${STAGES[stageIndex]!.doing}.`)
      : run.status === 'done'
        ? t('Answer complete.', 'Resposta concluída.')
        : run.status === 'error'
          ? t(`The run failed: ${run.error ?? ''}`, `A execução falhou: ${run.error ?? ''}`)
          : t('Run stopped.', 'Execução interrompida.')

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={root}
        className="ag-root"
        data-agent-ui=""
        data-open={open || undefined}
        data-running={running || undefined}
        data-layout={layout}
        data-panel={panelShown || undefined}
        style={{ '--ag-left': `${left}px`, '--ag-right': `${inset}px`, '--ag-panel-w': `${wide ? PANEL_W_WIDE : PANEL_W}px` } as CSSProperties}
      >
        <AnimatePresence>
          {phase && (
            <motion.div
              key={phase === 'peek' ? 'peek' : `run-${run?.id}`}
              className="ag-overlay-wrap"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: phase === 'peek' ? 0.24 : 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <Overlay phase={phase} targets={overlayTargets} fallbackLabel={current?.titulo ?? t('Screen', 'Tela')} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {panelShown && (
            <Panel
              key="panel"
              layout={layout}
              wide={wide}
              title={current?.titulo ?? null}
              suggestions={turns.length === 0 ? suggestions : []}
              run={run && run.page === page ? run : null}
              turns={turns}
              steps={run ? stepStates(run) : undefined}
              followUps={running ? [] : followUps}
              canClear={!running && turns.length > 0}
              onWide={side && roomy ? () => setDocked(!docked) : undefined}
              onClose={close}
              onClear={() => {
                if (!page) return
                saveConversation(page, { api: [], view: [] })
                dismiss()
                setPeek(null)
                inputRef.current?.focus()
              }}
              onAsk={submit}
              onRetry={() => run && submit(run.question)}
              onPeek={onPeek}
              onLocate={onLocate}
            />
          )}
        </AnimatePresence>

        <Dock
          mode={mode}
          run={run}
          title={current?.titulo ?? null}
          digest={digest}
          compact={phone}
          suggestions={turns.length === 0 && !cover ? suggestions : []}
          input={input}
          onInput={setInput}
          onSubmit={submit}
          onStop={stop}
          onFocus={() => {
            // focar o campo encerra a pausa em que o trilho mostra o resultado
            if (run && !running) setSettledId(run.id)
            if (!open) setOpen(true)
          }}
          onEngage={setEngaged}
          inputRef={inputRef}
          stopRef={stopRef}
        />

        <div className="ag-sr" role="status" aria-live="polite">
          {status}
        </div>
      </div>
    </MotionConfig>
  )
}
