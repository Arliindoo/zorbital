import { AnimatePresence, motion } from 'motion/react'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Markdown } from '@/shared/ui/Markdown'
import { IconArrowRightUp, IconDocument } from '@/shared/icons/index'
import { t } from '@/shared/lib/i18n'
import {
  IconCheck,
  IconChevronDown,
  IconClose,
  IconCopy,
  IconDatabase,
  IconEraser,
  IconExpand,
  IconRetry,
  IconShrink,
  IconTarget,
  IconWarning,
  KindIcon,
} from '@/features/assistant/icons'
import { Orb, type OrbMood } from '@/features/assistant/Orb'
import { dataQueries, LAST_N, type Run, type RunStatus, STAGE_COUNT, STAGES, type StageId, type StepState } from '@/features/assistant/run'
import { KIND_LABEL } from '@/features/assistant/targets'
import type { ScreenDigest, Source, Study } from '@/features/assistant/types'
import { clock, digestText, parseTool, seconds, useCountUp, useScramble, zyt } from '@/features/assistant/util'

/** Um turno da conversa visto como execução: o que está rodando e os já gravados usam a mesma vista. */
export interface Turn {
  key: string
  question: string
  at?: number
  text: string
  tools: readonly string[]
  /** Paralelo a `tools`: a consulta foi à ficha de um estudo. */
  studyTools: readonly boolean[]
  /** Estudos cuja ficha o agente leu neste turno. */
  studies: readonly Study[]
  /** O modelo está decidindo o próximo passo (sem evento novo). */
  thinking?: boolean
  steps: readonly StepState[]
  status: RunStatus
  stage: StageId
  error?: string
  cost: number | null
  ms: number | null
  stageAt?: Partial<Record<StageId, number>>
  sources: readonly Source[]
  digest: ScreenDigest | null
  live: boolean
}

const EASE = [0.16, 1, 0.3, 1] as const

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.42, ease: EASE }}
      style={{ overflow: 'hidden' }}
    >
      {children}
    </motion.div>
  )
}

function StageRow({
  index,
  state,
  note,
  children,
}: {
  index: number
  state: StepState
  note?: string
  children?: ReactNode
}) {
  const stage = STAGES[index]!
  return (
    <section className="ag-stage" data-state={state} aria-label={t(`Step ${index + 1} of ${STAGE_COUNT}: ${stage.label}`, `Etapa ${index + 1} de ${STAGE_COUNT}: ${stage.label}`)}>
      <header className="ag-stage__head">
        <i className="ag-stage__node" aria-hidden />
        <span className="ag-stage__n">{stage.n}</span>
        <span className="ag-stage__name">{stage.label}</span>
        <span className="ag-stage__note">
          {state === 'active' && <i className="ag-stage__live" aria-hidden />}
          {note}
        </span>
      </header>
      {children && <div className="ag-stage__body">{children}</div>}
    </section>
  )
}

function stageNote(turn: Turn, i: number): string | undefined {
  const state = turn.steps[i]
  if (state === 'pending') return t('waiting', 'aguardando')
  if (state === 'skipped') return t('not needed', 'não foi preciso')
  if (state === 'error') return t('failed', 'falhou')
  if (state === 'stopped') return t('stopped', 'interrompida')
  if (state === 'active') return t('in progress', 'em andamento')
  const at = turn.stageAt
  const done = t('done', 'feito')
  if (!at) return done
  const from = at[STAGES[i]!.id]
  if (from === undefined) return done
  const next = STAGES.slice(i + 1).map((s) => at[s.id]).find((v) => v !== undefined) ?? turn.ms
  return next === null || next === undefined ? done : seconds(Math.max(0, next - from))
}

function Receipt({ turn }: { turn: Turn }) {
  const cells: { label: string; value: string; unit?: string }[] = [
    { label: t('Cost', 'Custo'), value: turn.cost === null ? '—' : zyt(turn.cost), unit: turn.cost === null ? undefined : 'ZYT' },
    { label: t('Studies', 'Estudos'), value: String(turn.studies.length) },
    { label: t('Queries', 'Consultas'), value: String(turn.tools.length) },
    { label: t('Time', 'Tempo'), value: turn.ms === null ? '—' : seconds(turn.ms).replace(' s', ''), unit: turn.ms === null ? undefined : 's' },
  ]
  return (
    <dl className="ag-receipt">
      {cells.map((c) => (
        <div key={c.label}>
          <dt>{c.label}</dt>
          <dd>
            {c.value}
            {c.unit && <small>{c.unit}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className="ag-ghost"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => undefined,
        )
      }}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
      {copied ? t('Copied', 'Copiado') : t('Copy answer', 'Copiar resposta')}
    </button>
  )
}

/** Cautelas como lista: no banco elas são frases seguidas. */
const cautionList = (text: string): string[] =>
  text
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

const cautionCount = (n: number) =>
  t(`${n} caution${n === 1 ? '' : 's'} in the agent's context`, `${n} cautela${n === 1 ? '' : 's'} no contexto do agente`)

function studyParts(study: Study) {
  const [short, ...rest] = study.nome.split(' — ')
  return {
    short,
    long: rest.join(' — '),
    cautions: cautionList(study.cautelas ?? ''),
    sample: (study.fonte_carregada ?? '').toLowerCase().includes('amostra'),
    links: [
      study.url_nasa && { label: 'NASA PSI', href: study.url_nasa },
      study.relatorio && { label: t('Report', 'Relatório'), href: study.relatorio },
      study.doi && { label: `DOI ${study.doi}`, href: study.doi.startsWith('http') ? study.doi : `https://doi.org/${study.doi}` },
    ].filter((link): link is { label: string; href: string } => Boolean(link)),
  }
}

function StudyLinks({ links }: { links: readonly { label: string; href: string }[] }) {
  if (!links.length) return null
  return (
    <p className="ag-study__links">
      {links.map((link) => (
        <a key={link.href} href={link.href} target="_blank" rel="noreferrer noopener">
          {link.label}
          <IconArrowRightUp size={11} />
        </a>
      ))}
    </p>
  )
}

/** A ficha de um estudo como o agente a leu: o que ele pergunta, que evidência traz e o que não concluir. */
function StudyCard({ study, live, index }: { study: Study; live: boolean; index: number }) {
  const { short, long, cautions, sample, links } = studyParts(study)
  return (
    <motion.li
      className="ag-study"
      initial={live ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.46, ease: EASE, delay: 0.12 + index * 0.16 }}
    >
      <span className="ag-study__scan" aria-hidden />
      <header className="ag-study__head">
        <span className="ag-study__id">
          <IconDocument size={12} />
          {study.id}
        </span>
        <strong>{short}</strong>
        {sample && <em>{t('sample', 'amostra')}</em>}
      </header>
      {long && <p className="ag-study__long">{long}</p>}
      <p className="ag-mono-line">
        {t(`${study.ambiente} · ${study.tipo_evidencia.toLowerCase()} evidence`, `${study.ambiente} · evidência ${study.tipo_evidencia.toLowerCase()}`)}
      </p>
      <p className="ag-study__q">{study.pergunta}</p>
      <details className="ag-study__more">
        <summary>
          <IconChevronDown size={12} />
          {cautionCount(cautions.length)}
        </summary>
        <ul>
          {cautions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
      <StudyLinks links={links} />
    </motion.li>
  )
}

/**
 * No celular o chat cobre a página, então a conexão não tem como ser um feixe até o bloco: ela nasce na
 * própria conversa. Cada coisa a que o agente se liga (bloco da tela, ficha de estudo, consulta) é um ramo
 * que sai da espinha da linha do tempo, se desenha e pulsa enquanto a etapa dela está em andamento.
 */
const WIRE = 'M0.5 0C0.5 11 7 17 21 17'

function Branch({
  live,
  index = 0,
  delay = 0,
  kind,
  children,
}: {
  live: boolean
  index?: number
  delay?: number
  kind?: 'study'
  children: ReactNode
}) {
  return (
    <motion.li
      className="ag-link"
      data-kind={kind}
      style={{ '--i': index, '--d': `${delay}s` } as CSSProperties}
      initial={live ? { opacity: 0, height: 0 } : false}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.44, ease: EASE, delay }}
    >
      <svg className="ag-wire" width={24} height={21} viewBox="0 0 24 21" aria-hidden focusable="false">
        <path className="ag-wire__halo" d={WIRE} />
        <path className="ag-wire__line" d={WIRE} pathLength={1} />
        <path className="ag-wire__comet" d={WIRE} pathLength={1} />
        <circle className="ag-wire__port" cx={21} cy={17} r={2.5} />
      </svg>
      {children}
    </motion.li>
  )
}

/** Os blocos da página que seguiram com a pergunta, como ramos; tocar em um fecha o chat e o mostra na página. */
function BlockLinks({ turn, title, onLocate }: { turn: Turn; title: string | null; onLocate: (id: string) => void }) {
  const more = (turn.digest?.blocos ?? 0) - turn.sources.length
  const body = (s: Source, i: number) => (
    <>
      <span className="ag-node__n">{String(i + 1).padStart(2, '0')}</span>
      <KindIcon kind={s.kind} size={13} />
      <span className="ag-node__kind">{KIND_LABEL[s.kind] ?? s.kind}</span>
      <span className="ag-node__label">{s.label}</span>
      <span className="ag-node__state" aria-hidden>
        <i />
        <IconCheck size={12} />
      </span>
    </>
  )
  return (
    <>
      <ul className="ag-links" aria-label={t('Blocks read on screen', 'Blocos lidos na tela')}>
        {turn.sources.length > 0 ? (
          turn.sources.map((s, i) => (
            <Branch key={s.id} live={turn.live} index={i} delay={0.2 + i * 0.09}>
              <button type="button" className="ag-node" title={t('Show on page', 'Mostrar na página')} onClick={() => onLocate(s.id)}>
                {body(s, i)}
              </button>
            </Branch>
          ))
        ) : (
          // página sem blocos marcados: a tela inteira é a fonte
          <Branch live={turn.live} delay={0.2}>
            <div className="ag-node">{body({ id: '__tela', kind: 'screen', label: title ?? t('Screen', 'Tela') }, 0)}</div>
          </Branch>
        )}
      </ul>
      {turn.sources.length > 0 && more > 0 && (
        <p className="ag-mono-line ag-links__more">
          {t(`+ ${more} ${more === 1 ? 'block' : 'blocks'} from the page`, `+ ${more} ${more === 1 ? 'bloco' : 'blocos'} da página`)}
        </p>
      )}
    </>
  )
}

/** A ficha de um estudo em uma linha do ramo; abre para mostrar a pergunta, as cautelas e as fontes. */
function StudyLink({ study, live, index }: { study: Study; live: boolean; index: number }) {
  const { short, long, cautions, sample, links } = studyParts(study)
  return (
    <Branch live={live} index={index} delay={0.12 + index * 0.14} kind="study">
      <details className="ag-studyrow">
        <summary>
          <span className="ag-studyrow__top">
            <span className="ag-study__id">
              <IconDocument size={12} />
              {study.id}
            </span>
            <strong>{short}</strong>
            {sample && <em>{t('sample', 'amostra')}</em>}
            <IconChevronDown size={13} className="ag-studyrow__chev" />
          </span>
          <span className="ag-mono-line">
            {t(`${study.ambiente} · ${study.tipo_evidencia.toLowerCase()} evidence`, `${study.ambiente} · evidência ${study.tipo_evidencia.toLowerCase()}`)}
          </span>
        </summary>
        <div className="ag-studyrow__more">
          {long && <p className="ag-studyrow__long">{long}</p>}
          <p className="ag-study__q">{study.pergunta}</p>
          {cautions.length > 0 && (
            <>
              <span className="ag-eyebrow">
                {cautionCount(cautions.length)}
              </span>
              <ul>
                {cautions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
          <StudyLinks links={links} />
        </div>
      </details>
    </Branch>
  )
}

function Queries({ turn, study, label, linked }: { turn: Turn; study: boolean; label: string; linked: boolean }) {
  const items = turn.tools.map((text, i) => ({ text, i })).filter(({ i }) => (turn.studyTools[i] ?? false) === study)
  if (!items.length) return null
  const row = (text: string) => {
    const tool = parseTool(text)
    return (
      <div className="ag-query" data-kind={study ? 'study' : undefined} data-failed={tool.failed || undefined}>
        <span className="ag-query__wire" aria-hidden />
        {study ? <IconDocument size={13} /> : <IconDatabase size={13} />}
        <code>
          <b>{tool.name}</b>
          {tool.args && <span>({tool.args})</span>}
        </code>
        {tool.failed && <em>{t('error', 'erro')}</em>}
      </div>
    )
  }
  if (linked)
    return (
      <ul className="ag-links" aria-label={label}>
        {items.map(({ text, i }) => (
          <Branch key={`${i}-${text}`} live={turn.live} index={i} kind={study ? 'study' : undefined}>
            {row(text)}
          </Branch>
        ))}
      </ul>
    )
  return (
    <ul className="ag-queries" aria-label={label}>
      {items.map(({ text, i }) => {
        return (
          <motion.li
            key={`${i}-${text}`}
            initial={turn.live ? { opacity: 0, height: 0 } : false}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.44, ease: EASE }}
          >
            {row(text)}
          </motion.li>
        )
      })}
    </ul>
  )
}

function TurnView({
  turn,
  open,
  latest,
  linked,
  title,
  onToggle,
  followUps,
  onAsk,
  onRetry,
  onPeek,
  onLocate,
}: {
  turn: Turn
  open: boolean
  latest: boolean
  /** Celular: blocos, estudos e consultas aparecem como ramos da linha do tempo. */
  linked: boolean
  title: string | null
  onToggle: () => void
  followUps: readonly string[]
  onAsk: (question: string) => void
  onRetry: () => void
  onPeek: (id: string | null) => void
  onLocate: (id: string) => void
}) {
  const running = turn.status === 'running'
  const [s1, sStudies, s2, s3, s4] = turn.steps as [StepState, StepState, StepState, StepState, StepState]
  const failedAt = turn.steps.findIndex((s) => s === 'error' || s === 'stopped')
  const trouble =
    turn.status === 'error' || turn.status === 'stopped' ? (
      <div className="ag-trouble" data-status={turn.status} role={turn.status === 'error' ? 'alert' : undefined}>
        {turn.status === 'error' ? <IconWarning size={15} /> : <IconClose size={14} />}
        <p>{turn.status === 'error' ? (turn.error ?? t('The run failed.', 'A execução falhou.')) : t('You stopped the run. What arrived so far is not saved to the history.', 'Você interrompeu a execução. O que chegou até aqui não entra no histórico.')}</p>
        <button type="button" className="ag-ghost" onClick={onRetry}>
          <IconRetry size={13} />
          {turn.status === 'error' ? t('Try again', 'Tentar de novo') : t('Redo', 'Refazer')}
        </button>
      </div>
    ) : null

  return (
    <article className="ag-turn" data-open={open} data-status={turn.status} data-live={turn.live || undefined} data-linked={linked || undefined}>
      <header className="ag-turn__q">
        <i className="ag-turn__node" aria-hidden />
        {latest ? (
          <div className="ag-turn__qtext">
            <span className="ag-eyebrow">
              {t('Question', 'Pergunta')}
              {turn.at ? ` · ${clock(turn.at)}` : ''}
            </span>
            <p>{turn.question}</p>
          </div>
        ) : (
          <button type="button" className="ag-turn__toggle" aria-expanded={open} onClick={onToggle}>
            <span className="ag-turn__qline">{turn.question}</span>
            <span className="ag-turn__meta">
              {turn.tools.length > 0 && t(`${turn.tools.length} ${turn.tools.length > 1 ? 'queries' : 'query'}`, `${turn.tools.length} consulta${turn.tools.length > 1 ? 's' : ''}`)}
              {turn.cost !== null && ` · ${zyt(turn.cost)} ZYT`}
            </span>
            <IconChevronDown size={14} className="ag-turn__chev" />
          </button>
        )}
      </header>

      <AnimatePresence initial={false}>
        {open && (
          <Reveal key="body" className="ag-turn__body">
            <StageRow index={0} state={s1} note={stageNote(turn, 0)}>
              {turn.digest && <p className="ag-mono-line">{digestText(turn.digest)}</p>}
              {linked && <BlockLinks turn={turn} title={title} onLocate={onLocate} />}
              {!linked && turn.sources.length > 0 && (
                <ul className="ag-sources" aria-label={t('Blocks read on screen', 'Blocos lidos na tela')}>
                  {turn.sources.map((s, i) => (
                    <motion.li
                      key={s.id}
                      initial={turn.live ? { opacity: 0, x: -8 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, ease: EASE, delay: 0.25 + i * 0.09 }}
                    >
                      <button
                        type="button"
                        className="ag-source"
                        title={t('Show on page', 'Mostrar na página')}
                        onMouseEnter={() => onPeek(s.id)}
                        onMouseLeave={() => onPeek(null)}
                        onFocus={() => onPeek(s.id)}
                        onBlur={() => onPeek(null)}
                        onClick={() => onLocate(s.id)}
                      >
                        <KindIcon kind={s.kind} size={12} />
                        <span>{s.label}</span>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )}
              {failedAt === 0 && trouble}
            </StageRow>

            <StageRow index={1} state={sStudies} note={stageNote(turn, 1)}>
              {turn.studies.length > 0 && (
                <>
                  <p className="ag-mono-line">
                    {t(
                      `${turn.studies.length === 1 ? "this page's study sheet" : `study sheets of the ${turn.studies.length} studies involved`} · question, evidence and cautions`,
                      `${turn.studies.length === 1 ? 'ficha do estudo desta página' : `fichas dos ${turn.studies.length} estudos envolvidos`} · pergunta, evidência e cautelas`,
                    )}
                  </p>
                  {linked ? (
                    <ul className="ag-links" aria-label={t('Studies consulted', 'Estudos consultados')}>
                      {turn.studies.map((study, i) => (
                        <StudyLink key={study.id} study={study} live={turn.live} index={i} />
                      ))}
                    </ul>
                  ) : (
                    <ul className="ag-studies" aria-label={t('Studies consulted', 'Estudos consultados')}>
                      {turn.studies.map((study, i) => (
                        <StudyCard key={study.id} study={study} live={turn.live} index={i} />
                      ))}
                    </ul>
                  )}
                </>
              )}
              <Queries turn={turn} study label={t('Study sheet queries', 'Consultas à ficha dos estudos')} linked={linked} />
              {sStudies === 'active' && turn.thinking && <p className="ag-mono-line">{t('study sheets read: the model is planning the queries', 'fichas lidas: o modelo planeja as consultas')}</p>}
              {sStudies === 'skipped' && <p className="ag-mono-line">{t('this page has no associated study', 'esta página não tem estudo associado')}</p>}
              {failedAt === 1 && trouble}
            </StageRow>

            <StageRow index={2} state={s2} note={stageNote(turn, 2)}>
              <Queries turn={turn} study={false} label={t('Database queries', 'Consultas ao banco')} linked={linked} />
              {s2 === 'skipped' && <p className="ag-mono-line">{t('no data queries: the screen, the studies and the conversation were enough', 'sem consultas aos dados: bastaram a tela, os estudos e a conversa')}</p>}
              {failedAt === 2 && trouble}
            </StageRow>

            <StageRow index={3} state={s3} note={stageNote(turn, 3)}>
              {turn.text && (
                <div className="ag-answer" data-streaming={running || undefined} aria-live="polite" aria-busy={running}>
                  <Markdown>{turn.text}</Markdown>
                </div>
              )}
              {failedAt === 3 && trouble}
            </StageRow>

            <StageRow index={4} state={s4} note={s4 === 'done' ? undefined : stageNote(turn, 4)}>
              {s4 === 'done' && (
                <motion.div
                  initial={turn.live ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <Receipt turn={turn} />
                  <div className="ag-turn__actions">
                    <CopyButton text={turn.text} />
                  </div>
                  {latest && followUps.length > 0 && (
                    <div className="ag-follow">
                      <span className="ag-eyebrow">{t('Continue', 'Continuar')}</span>
                      <ul>
                        {followUps.map((f, i) => (
                          <motion.li
                            key={f}
                            initial={turn.live ? { opacity: 0, y: 8 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: EASE, delay: 0.2 + i * 0.07 }}
                          >
                            <button type="button" className="ag-chip" onClick={() => onAsk(f)}>
                              <i aria-hidden />
                              {f}
                            </button>
                          </motion.li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              )}
            </StageRow>
          </Reveal>
        )}
      </AnimatePresence>
    </article>
  )
}

function coreCopy(run: Run | null): { mood: OrbMood; eyebrow: string; title: string } {
  if (!run) return { mood: 'ready', eyebrow: t('Ready', 'Pronto'), title: t('Agent', 'Agente') }
  const i = STAGES.findIndex((s) => s.id === run.stage)
  if (run.status === 'running') {
    const title = !run.thinking ? STAGES[i]!.doing : run.stage === 'consultar' ? t('Analyzing the results', 'Analisando os resultados') : run.stage === 'estudos' ? t('Planning the queries', 'Planejando as consultas') : STAGES[i]!.doing
    return { mood: 'working', eyebrow: t(`Step ${STAGES[i]!.n} / ${LAST_N}`, `Etapa ${STAGES[i]!.n} / ${LAST_N}`), title }
  }
  if (run.status === 'error') return { mood: 'error', eyebrow: t(`Failed at step ${STAGES[i]!.n}`, `Falhou na etapa ${STAGES[i]!.n}`), title: t('The run failed', 'A execução falhou') }
  if (run.status === 'stopped') return { mood: 'stopped', eyebrow: t(`Stopped at step ${STAGES[i]!.n}`, `Parou na etapa ${STAGES[i]!.n}`), title: t('Stopped', 'Interrompido') }
  return { mood: 'done', eyebrow: t(`Step ${LAST_N} / ${LAST_N}`, `Etapa ${LAST_N} / ${LAST_N}`), title: t('Done', 'Concluído') }
}

function coreLine(run: Run | null, title: string | null): string {
  if (!run || run.status === 'done') return title ?? ''
  if (run.status !== 'running') return title ?? ''
  if (run.stage === 'ler') return t('filters, charts and rows go along with the question', 'filtros, gráficos e linhas seguem com a pergunta')
  if (run.stage === 'estudos') {
    if (run.thinking) return t('with the study sheets in context, the model decides what to query', 'com as fichas no contexto, o modelo decide o que consultar')
    const last = run.tools.length - 1
    if (last >= 0 && run.studyTools[last]) return run.tools[last] ?? ''
    return t('the question, evidence and cautions of each study enter the context', 'pergunta, evidência e cautelas de cada estudo entram no contexto')
  }
  if (run.stage === 'consultar') {
    if (run.thinking) return t('the model reads what the queries returned', 'o modelo lê o que as consultas devolveram')
    return run.tools[run.tools.length - 1] ?? ''
  }
  return t('writing based on the screen and the queries', 'escrevendo com base na tela e nas consultas')
}

/** `side` fica ao lado da página, `sheet` sobe do rodapé e `full` (celular) cobre a tela inteira. */
export type PanelLayout = 'side' | 'sheet' | 'full'

/** No celular o chat cresce a partir da barra de comando até cobrir a tela (e volta para ela ao fechar). */
const FULL_CLOSED = 'inset(92% 4% 1.5% 4% round 20px)'
const FULL_OPEN = 'inset(0% 0% 0% 0% round 0px)'
const MOTION: Record<PanelLayout, { from: Record<string, number | string>; to: Record<string, number | string> }> = {
  side: { from: { opacity: 0, x: 48 }, to: { opacity: 1, x: 0 } },
  sheet: { from: { opacity: 0, y: 48 }, to: { opacity: 1, y: 0 } },
  full: { from: { opacity: 0, clipPath: FULL_CLOSED }, to: { opacity: 1, clipPath: FULL_OPEN } },
}

export interface PanelProps {
  layout: PanelLayout
  wide: boolean
  title: string | null
  /** Sugestões da página, para a abertura do chat no celular (antes da primeira pergunta). */
  suggestions: readonly string[]
  run: Run | null
  turns: readonly Turn[]
  steps: readonly StepState[] | undefined
  followUps: readonly string[]
  canClear: boolean
  /** Ausente quando a janela não comporta o painel largo. */
  onWide?: () => void
  onClose: () => void
  onClear: () => void
  onAsk: (question: string) => void
  onRetry: () => void
  onPeek: (id: string | null) => void
  onLocate: (id: string) => void
}

export function Panel({ layout, wide, title, suggestions, run, turns, steps, followUps, canClear, onWide, onClose, onClear, onAsk, onRetry, onPeek, onLocate }: PanelProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const userAt = useRef(0)
  const linked = layout === 'full'
  const running = run?.status === 'running'
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const copy = coreCopy(run)
  const tall = run?.status === 'running' && (run.stage === 'ler' || run.stage === 'estudos' || run.stage === 'consultar')
  const line = useScramble(coreLine(run, title), tall)
  const count = useCountUp(
    run ? (run.stage === 'ler' ? run.digest.blocos || run.sources.length : run.stage === 'estudos' ? run.studies.length : dataQueries(run) || run.tools.length) : 0,
  )
  const caption =
    run?.stage === 'ler'
      ? t('blocks', 'blocos')
      : run?.stage === 'estudos'
        ? run.studies.length === 1
          ? t('study', 'estudo')
          : t('studies', 'estudos')
        : t('queries', 'consultas')
  const lastKey = turns[turns.length - 1]?.key
  const runId = run?.id

  const touched = () => {
    userAt.current = performance.now()
  }

  // cada execução nova volta a acompanhar o fim da conversa
  useEffect(() => {
    stick.current = true
  }, [runId])

  // enquanto lê e consulta, a vista fica no começo do turno (as etapas); ao compor, acompanha o fim do texto.
  // No celular a linha do tempo cresce para baixo, ramo por ramo: aí a vista desce junto com a etapa em andamento.
  const goal = useCallback((): number | null => {
    const el = scroller.current
    if (!el) return null
    const max = el.scrollHeight - el.clientHeight
    const live = tall ? el.querySelector<HTMLElement>('.ag-turn[data-status="running"]') : null
    if (!live) return max
    let top = live.offsetTop
    const active = linked ? live.querySelector<HTMLElement>('.ag-stage[data-state="active"]') : null
    if (active) {
      // o rodapé da área de rolagem fica atrás da barra de comando (é o respiro de baixo da lista)
      const hidden = parseFloat(getComputedStyle(el).paddingBottom) || 0
      const bottom = active.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop
      top = Math.max(top, bottom + 18 - (el.clientHeight - hidden))
    }
    return Math.min(top, max)
  }, [tall, linked])

  const glide = linked && running
  useLayoutEffect(() => {
    const el = scroller.current
    const top = goal()
    // com a linha do tempo crescendo (celular), quem leva a vista é o laço abaixo, sem saltos
    if (!el || top === null || !stick.current || glide) return
    if (Math.abs(el.scrollTop - top) >= 1) el.scrollTop = top
  })
  useEffect(() => {
    if (!glide) return
    let frame = 0
    const step = () => {
      const el = scroller.current
      const top = goal()
      if (el && top !== null && stick.current) {
        const delta = top - el.scrollTop
        if (Math.abs(delta) >= 1) el.scrollTop += Math.abs(delta) < 3 ? delta : Math.sign(delta) * Math.max(1.5, Math.abs(delta) * 0.16)
      }
      frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [glide, goal])
  // no celular o teclado abre e fecha sem avisar o React: a área de rolagem muda de altura e a vista se reajusta
  useEffect(() => {
    const el = scroller.current
    if (!linked || !el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const top = goal()
      if (top !== null && stick.current) el.scrollTop = top
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [linked, goal])

  return (
    <motion.aside
      className="ag-panel"
      data-agent-panel=""
      data-layout={layout}
      data-wide={wide || undefined}
      data-size={tall ? 'tall' : 'compact'}
      aria-label={t('Agent: run and answers', 'Agente: execução e respostas')}
      initial={MOTION[layout].from}
      animate={MOTION[layout].to}
      exit={MOTION[layout].from}
      transition={{ duration: 0.56, ease: EASE }}
    >
      <header className="ag-core" data-size={tall ? 'tall' : 'compact'} data-mood={copy.mood}>
        <span className="ag-core__grid" aria-hidden />
        <Orb anchor className="ag-core__orb" detail={tall ? 'fine' : 'coarse'} pulse={run ? `${run.id}-${run.stage}-${run.status}` : undefined} mood={copy.mood} steps={steps} value={String(count)} caption={caption} />
        <div className="ag-core__text">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={copy.eyebrow}
              className="ag-eyebrow"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {copy.eyebrow}
            </motion.span>
            <motion.strong
              key={copy.title}
              className="ag-core__title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.42, ease: EASE }}
            >
              {copy.title}
            </motion.strong>
          </AnimatePresence>
          <span className="ag-core__line">{line}</span>
        </div>
        <div className="ag-core__actions">
          {canClear && (
            <button type="button" className="ag-icon" title={t("Clear this page's conversation", 'Limpar conversa desta página')} aria-label={t("Clear this page's conversation", 'Limpar conversa desta página')} onClick={onClear}>
              <IconEraser size={16} />
            </button>
          )}
          {onWide && (
            <button type="button" className="ag-icon ag-icon--wide" title={wide ? t('Narrow panel', 'Painel estreito') : t('Wide panel', 'Painel largo')} aria-label={wide ? t('Narrow panel', 'Painel estreito') : t('Wide panel', 'Painel largo')} aria-pressed={wide} onClick={onWide}>
              {wide ? <IconShrink size={16} /> : <IconExpand size={16} />}
            </button>
          )}
          <button type="button" className="ag-icon" title={t('Close (Esc)', 'Fechar (Esc)')} aria-label={t('Close the agent', 'Fechar o agente')} onClick={onClose}>
            <IconClose size={16} />
          </button>
        </div>
        <svg className="ag-core__stem" viewBox="0 0 60 40" preserveAspectRatio="none" aria-hidden focusable="false">
          <path className="ag-core__stem-halo" d="M52 0C52 22 9.5 14 9.5 40" />
          <path className="ag-core__stem-line" d="M52 0C52 22 9.5 14 9.5 40" pathLength={1} />
          <path className="ag-core__stem-run" d="M52 0C52 22 9.5 14 9.5 40" pathLength={1} />
        </svg>
      </header>

      <div
        ref={scroller}
        className="ag-thread"
        tabIndex={-1}
        onWheel={touched}
        onTouchMove={touched}
        onPointerDown={touched}
        onPointerMove={(e) => {
          if (e.buttons) touched()
        }}
        onKeyDown={touched}
        onScroll={(e) => {
          // só a rolagem feita pela pessoa decide se a vista continua presa (a do painel não conta):
          // presa enquanto ela estiver perto de onde o painel a levaria
          if (performance.now() - userAt.current > 900) return
          const top = goal()
          if (top !== null) stick.current = Math.abs(top - e.currentTarget.scrollTop) < 72
        }}
      >
        {turns.length === 0 && (
          <section className="ag-turn ag-intro" data-linked="" data-live="" aria-label={t('Start a conversation', 'Comece uma conversa')}>
            <header className="ag-turn__q">
              <i className="ag-turn__node" aria-hidden />
              <div className="ag-turn__qtext">
                <span className="ag-eyebrow">{t('New conversation', 'Nova conversa')}</span>
                <p>{t('Ask about what is on this page.', 'Pergunte sobre o que está nesta página.')}</p>
              </div>
            </header>
            {suggestions.length > 0 && (
              <ul className="ag-links ag-intro__list" aria-label={t('Suggested questions', 'Sugestões de pergunta')}>
                {suggestions.map((s, i) => (
                  <Branch key={s} live index={i} delay={0.24 + i * 0.1}>
                    <button type="button" className="ag-chip" onClick={() => onAsk(s)}>
                      <i aria-hidden />
                      {s}
                    </button>
                  </Branch>
                ))}
              </ul>
            )}
          </section>
        )}
        {turns.map((turn) => {
          const latest = turn.key === lastKey
          return (
            <TurnView
              key={turn.key}
              turn={turn}
              latest={latest}
              open={latest || opened.has(turn.key)}
              linked={linked}
              title={title}
              onToggle={() =>
                setOpened((set) => {
                  const next = new Set(set)
                  if (!next.delete(turn.key)) next.add(turn.key)
                  return next
                })
              }
              followUps={followUps}
              onAsk={onAsk}
              onRetry={onRetry}
              onPeek={onPeek}
              onLocate={onLocate}
            />
          )
        })}
        <div className="ag-thread__end" aria-hidden>
          <IconTarget size={12} />
          <span>{t('the agent reads this screen, the study sheets and the Zorbital database', 'o agente lê esta tela, a ficha dos estudos e o banco do Zorbital')}</span>
        </div>
      </div>
    </motion.aside>
  )
}
