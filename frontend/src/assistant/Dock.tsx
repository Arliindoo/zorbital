import { AnimatePresence, motion } from 'motion/react'
import type { FormEvent, RefObject } from 'react'
import { t } from '@/lib/i18n'
import { IconArrowUp, IconCheck, IconClose, IconStop, IconWarning } from './icons'
import { Orb, type OrbMood } from './Orb'
import { dataQueries, type Run, STAGES, type StepState, stepStates } from './run'
import type { ScreenDigest } from './types'
import { digestText, seconds, useElapsed, useScramble, zyt } from './util'

export type DockMode = 'idle' | 'open' | 'run'


function ticker(run: Run): string {
  if (run.status === 'error') return run.error ?? t('The run failed.', 'A execução falhou.')
  if (run.status === 'stopped') return t('Stopped by you.', 'Interrompido por você.')
  if (run.status === 'done') {
    const parts = [
      run.tools.length
        ? t(`${run.tools.length} ${run.tools.length > 1 ? 'queries' : 'query'}`, `${run.tools.length} consulta${run.tools.length > 1 ? 's' : ''}`)
        : t('no queries', 'sem consultas'),
    ]
    if (run.cost !== null) parts.push(`${zyt(run.cost)} ZYT`)
    if (run.ms !== null) parts.push(seconds(run.ms))
    return parts.join(' · ')
  }
  if (run.stage === 'ler') return t(`sending the screen · ${digestText(run.digest)}`, `enviando a tela · ${digestText(run.digest)}`)
  if (run.stage === 'estudos') {
    if (run.thinking) return t('study sheets read · planning the queries', 'fichas lidas · planejando as consultas')
    const ids = run.studies.map((s) => s.id)
    const last = run.tools[run.tools.length - 1]
    const list = `${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ` +${ids.length - 3}` : ''}`
    return last && run.studyTools[run.tools.length - 1] ? last : t(`study sheet for ${list} · question and cautions`, `ficha de ${list} · pergunta e cautelas`)
  }
  if (run.stage === 'consultar') {
    const n = dataQueries(run)
    if (run.thinking) return t(`${n} ${n === 1 ? 'query' : 'queries'} answered · analyzing the results`, `${n} consulta${n === 1 ? ' respondida' : 's respondidas'} · analisando os resultados`)
    return run.tools[run.tools.length - 1] ?? t('querying the database', 'consultando o banco')
  }
  const words = run.text.trim().split(/\s+/).filter(Boolean).length
  return t(`${words} word${words === 1 ? '' : 's'} in the answer`, `${words} palavra${words === 1 ? '' : 's'} na resposta`)
}

function StepMark({ state, n }: { state: StepState; n: string }) {
  return (
    <span className="ag-step__mark">
      {state === 'done' ? (
        <IconCheck size={11} />
      ) : state === 'error' ? (
        <IconWarning size={11} />
      ) : state === 'stopped' ? (
        <IconClose size={10} />
      ) : (
        n
      )}
    </span>
  )
}

function Tracker({ run, onStop, stopRef }: { run: Run; onStop: () => void; stopRef: RefObject<HTMLButtonElement | null> }) {
  const states = stepStates(run)
  const elapsed = useElapsed(run.startedAt, run.status === 'running' ? null : run.ms)
  const line = useScramble(ticker(run), run.stage !== 'compor' || run.status !== 'running')
  const running = run.status === 'running'
  return (
    <div className="ag-tracker" data-status={run.status}>
      <ol className="ag-steps" aria-label={t('Run steps', 'Etapas da execução')}>
        {STAGES.map((stage, i) => (
          <li key={stage.id} className="ag-step" data-state={states[i]} aria-current={states[i] === 'active' ? 'step' : undefined}>
            <StepMark state={states[i]!} n={stage.n} />
            <span className="ag-step__label">{stage.label}</span>
            {i < STAGES.length - 1 && <span className="ag-step__link" aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="ag-ticker" title={ticker(run)}>
        <span className="ag-ticker__caret" aria-hidden>
          ›
        </span>
        <b className="ag-ticker__stage">{STAGES.find((st) => st.id === run.stage)?.label}</b>
        <span className="ag-ticker__text">{line}</span>
      </p>
      <span className="ag-clock" aria-hidden>
        {elapsed}
      </span>
      {running && (
        <button ref={stopRef} type="button" className="ag-stop" onClick={onStop}>
          <IconStop size={13} />
          <span>{t('Stop', 'Parar')}</span>
        </button>
      )}
    </div>
  )
}

export interface DockProps {
  mode: DockMode
  run: Run | null
  title: string | null
  digest: ScreenDigest | null
  /** Tela de celular: os textos de apoio do campo ficam curtos para caber na barra. */
  compact?: boolean
  suggestions: readonly string[]
  input: string
  onInput: (value: string) => void
  onSubmit: (question: string) => void
  onStop: () => void
  onFocus: () => void
  /** O foco entrou ou saiu da barra: é isso que a expande (sugestões, faixa "na tela") ou a recolhe. */
  onEngage: (engaged: boolean) => void
  inputRef: RefObject<HTMLInputElement | null>
  stopRef: RefObject<HTMLButtonElement | null>
}

export function Dock({ mode, run, title, digest, compact, suggestions, input, onInput, onSubmit, onStop, onFocus, onEngage, inputRef, stopRef }: DockProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const question = input.trim()
    if (question && mode !== 'run') onSubmit(question)
  }
  const disabled = !title
  const busy = mode === 'run'
  const running = run?.status === 'running'
  const mood: OrbMood = busy && run ? (run.status === 'running' ? 'working' : run.status) : mode === 'open' ? 'ready' : 'idle'
  const placeholder = disabled
    ? compact
      ? t('Open a page to ask', 'Abra uma página para perguntar')
      : t('Open a page to ask about it', 'Abra uma página para perguntar sobre ela')
    : compact
      ? t('Ask about this screen', 'Pergunte sobre esta tela')
      : mode === 'idle'
        ? t('Ask the agent about this screen', 'Pergunte ao agente sobre esta tela')
        : t('What do you want to know about what is on screen?', 'O que você quer saber sobre o que está na tela?')

  return (
    <div
      className="ag-dock"
      data-mode={mode}
      onFocus={() => onEngage(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onEngage(false)
      }}
    >
      <AnimatePresence>
        {mode === 'open' && suggestions.length > 0 && (
          <motion.ul
            key="chips"
            className="ag-chips"
            aria-label={t('Suggested questions', 'Sugestões de pergunta')}
            initial="hidden"
            animate="shown"
            exit="hidden"
            variants={{ hidden: { transition: { staggerChildren: 0.02, staggerDirection: -1 } }, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } }}
          >
            {suggestions.map((s) => (
              <motion.li
                key={s}
                variants={{ hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
              >
                <button type="button" className="ag-chip" onClick={() => onSubmit(s)}>
                  <i aria-hidden />
                  {s}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <form
        className="ag-bar"
        data-agent-dock-bar=""
        onSubmit={submit}
        aria-label={t('Agent command bar', 'Barra de comando do agente')}
        onPointerDown={() => {
          // com o resultado ainda no trilho, um toque na barra já devolve o campo de pergunta
          if (busy && !running) {
            onFocus()
            window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
          }
        }}
      >
        <svg className="ag-bar__trace" aria-hidden focusable="false">
          <rect className="ag-bar__trace-halo" width="100%" height="100%" rx={20} pathLength={1} />
          <rect className="ag-bar__trace-run" width="100%" height="100%" rx={20} pathLength={1} />
        </svg>
        <Orb className="ag-bar__orb" mood={mood} steps={busy && run ? stepStates(run) : undefined} />

        <div className="ag-bar__layers">
          <div className="ag-bar__ask" aria-hidden={(busy && running) || undefined} inert={(busy && running) || undefined}>
            <input
              ref={inputRef}
              className="ag-input"
              type="text"
              placeholder={placeholder}
              aria-label={t('Question for the agent', 'Pergunta para o agente')}
              enterKeyHint="send"
              autoComplete="off"
              spellCheck={false}
              value={input}
              maxLength={4000}
              disabled={disabled}
              onFocus={onFocus}
              onChange={(e) => onInput(e.target.value)}
            />
            <div className="ag-bar__meta">
              <span className="ag-bar__seen">
                <i aria-hidden />
                <b>{t('On screen', 'Na tela')}</b>
                <span>{digest ? digestText(digest) : (title ?? t('no page open', 'nenhuma página aberta'))}</span>
              </span>
            </div>
          </div>
          {run && busy && (
            <div className="ag-bar__run">
              <Tracker run={run} onStop={onStop} stopRef={stopRef} />
            </div>
          )}
        </div>

        {!busy && (
          <div className="ag-bar__end">
            <button type="submit" className="ag-send" aria-label={t('Send question', 'Enviar pergunta')} disabled={disabled || !input.trim()}>
              <IconArrowUp size={16} />
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
