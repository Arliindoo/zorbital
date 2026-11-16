/** Peças do HUD da simulação: trilha de cenas, ficha do ensaio, telemetria, transporte e faixa. */

import { type CSSProperties, memo, type ReactNode } from 'react'
import { IconArrowRight, IconChevronRight, IconInfo, IconPause, IconPlay, IconRepeat, IconRestart, IconSkipNext, IconSkipPrevious, IconWarning } from '@/shared/icons/index'
import { fixed } from '@/shared/lib/format'
import { t as tr } from '@/shared/lib/i18n'
import type { Hotspot, Readout, SimRun, SimStudy, StageDef } from '@/visualization/types'
import { MiniChart } from '@/visualization/hud/MiniChart'
import { type TickStore, useTick } from '@/visualization/hud/tick'

const SPEEDS = [0.5, 1, 2, 4] as const

/** Valores só de número e sinais vão em fonte mono; textos (material, combustível) seguem a fonte da interface. */
const NUMERIC = /^[\d\s.,+\-−–≈⌀×/%·]+$/

function Readouts({ items }: { items: readonly Readout[] }) {
  return (
    <dl className="sim-list">
      {items.map((item) => (
        <div key={item.label} title={item.hint} data-tone={item.tone} data-soft={item.soft || undefined} data-text={NUMERIC.test(item.value) ? undefined : true}>
          <dt>{item.label}</dt>
          <dd>
            <b>{item.value}</b>
            {item.unit && <small>{item.unit}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Trilha de cenas: da órbita ao experimento. É a navegação por escala. */
export const StageTrail = memo(function StageTrail<S>({
  study,
  current,
  onGo,
}: {
  study: SimStudy<S>
  current: string
  onGo: (id: string) => void
}) {
  return (
    <nav className="sim-trail" aria-label={tr('Simulation scenes', 'Cenas da simulação')}>
      <span className="sim-gravity" data-g={study.gravity === 'µg' ? 'micro' : 'ground'} title={study.gravity === 'µg' ? tr('Microgravity: in free fall, no buoyancy', 'Microgravidade: em queda livre, sem empuxo') : tr('Normal gravity, in a ground laboratory', 'Gravidade normal, em laboratório no solo')}>
        <i>{study.gravity}</i>
        <span>
          <b>{study.gravity === 'µg' ? tr('Microgravity', 'Microgravidade') : tr('Ground gravity', 'Gravidade de solo')}</b>
          <small>{study.place}</small>
        </span>
      </span>
      <ol>
        {study.stages.map((stage, i) => (
          <li key={stage.id}>
            {i > 0 && <IconChevronRight size={13} className="sim-trail__sep" />}
            <button type="button" aria-current={stage.id === current ? 'step' : undefined} onClick={() => onGo(stage.id)}>
              <i>{i + 1}</i>
              <span>
                <b>{stage.label}</b>
                <small>{stage.scale}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}) as <S>(props: { study: SimStudy<S>; current: string; onGo: (id: string) => void }) => ReactNode

/** Ficha do ensaio selecionado: o que a fonte diz sobre as condições. */
export const RunCard = memo(function RunCard<S>({
  run,
  index,
  total,
  noun,
  onStep,
}: {
  run: SimRun<S> | null
  index: number
  total: number
  noun: readonly [string, string]
  onStep: (delta: number) => void
}) {
  if (!run) {
    return (
      <section className="sim-card sim-card--run">
        <p className="label">{tr(`No ${noun[0]} in the filter`, `Nenhum ${noun[0]} no filtro`)}</p>
        <p className="sim-card__text">{tr('Open the dashboard filters and widen the selection.', 'Abra os filtros do painel e amplie a seleção.')}</p>
      </section>
    )
  }
  const sum = run.mix?.reduce((s, m) => s + m.value, 0) ?? 0
  return (
    <section className="sim-card sim-card--run" aria-label={tr(`Selected ${noun[0]}`, `${noun[0]} selecionado`)}>
      <header className="sim-card__head">
        <p className="label">
          {noun[0]} · {index + 1} {tr('of', 'de')} {total}
        </p>
        <div className="sim-steps">
          <button type="button" className="sim-icon" aria-label={tr(`Previous ${noun[0]}`, `${noun[0]} anterior`)} disabled={total < 2} onClick={() => onStep(-1)}>
            <IconSkipPrevious size={15} />
          </button>
          <button type="button" className="sim-icon" aria-label={tr(`Next ${noun[0]}`, `Próximo ${noun[0]}`)} disabled={total < 2} onClick={() => onStep(1)}>
            <IconSkipNext size={15} />
          </button>
        </div>
      </header>
      <p className="sim-card__id">{run.label}</p>
      <p className="sim-card__title">{run.title}</p>
      <p className="sim-chip" data-tone={run.tone}>
        <i />
        {run.toneLabel}
      </p>
      {run.mix && sum > 0 && (
        <div className="sim-mix" role="img" aria-label={`${tr('Atmosphere', 'Atmosfera')}: ${run.mix.filter((m) => m.value > 0).map((m) => `${m.label} ${fixed(m.value * 100, 0)} %`).join(', ')}`}>
          <div className="sim-mix__bar">
            {run.mix
              .filter((m) => m.value > 0)
              .map((m) => (
                <i key={m.label} data-tone={m.tone} style={{ flexGrow: m.value / sum }} />
              ))}
          </div>
          <div className="sim-mix__legend">
            {run.mix
              .filter((m) => m.value > 0)
              .map((m) => (
                <span key={m.label} data-tone={m.tone}>
                  <i />
                  {m.label} {fixed(m.value * 100, 0)}%
                </span>
              ))}
          </div>
        </div>
      )}
      <Readouts items={run.conditions} />
    </section>
  )
}) as <S>(props: { run: SimRun<S> | null; index: number; total: number; noun: readonly [string, string]; onStep: (delta: number) => void }) => ReactNode

/** Ficha da cena (órbita, laboratório): onde você está e por que importa. */
export function SceneCard<S>({ stage, run, next, onGo }: { stage: StageDef<S>; run: SimRun<S> | null; next: StageDef<S> | null; onGo: (id: string) => void }) {
  const facts = stage.facts(run)
  return (
    <section className="sim-card sim-card--scene" aria-label={tr('About this scene', 'Sobre esta cena')}>
      <p className="label">{stage.scale}</p>
      <h3>{stage.title}</h3>
      <p className="sim-card__text">{stage.blurb}</p>
      {facts.length > 0 && <Readouts items={facts} />}
      {next && (
        <button type="button" className="sim-cta" onClick={() => onGo(next.id)}>
          <span>{tr('Zoom in', 'Aproximar')}: {next.label}</span>
          <IconArrowRight size={16} />
        </button>
      )}
    </section>
  )
}

const clock = (t: number, digits: number) => (t < 0 ? `−${fixed(-t, digits)}` : fixed(t, digits))

/** Telemetria ao vivo do ensaio em reprodução. */
export function Telemetry<S>({ run, store, onNext }: { run: SimRun<S> | null; store: TickStore; onNext: () => void }) {
  const { t, ended } = useTick(store)
  if (!run) return null
  if (!run.playable) {
    return (
      <section className="sim-card sim-card--live" aria-label={tr('Telemetry', 'Telemetria')}>
        <p className="sim-phase" data-tone="faint">
          <i />
          {tr('No reconstruction', 'Sem reconstrução')}
        </p>
        <p className="sim-card__text">
          <IconWarning size={15} /> {run.blocked}
        </p>
        <p className="sim-card__text sim-card__text--dim">
          {tr(
            'Nothing was made up to fill the gap: this test appears in the strip, but is not replayed.',
            'Nada foi inventado para preencher a lacuna: este ensaio aparece na faixa, mas não é reproduzido.',
          )}
        </p>
        <button type="button" className="sim-cta" onClick={onNext}>
          <span>{tr('Next replayable test', 'Próximo ensaio reproduzível')}</span>
          <IconArrowRight size={16} />
        </button>
      </section>
    )
  }
  const phase = run.phaseAt(t)
  return (
    <section className="sim-card sim-card--live" aria-label={tr('Telemetry', 'Telemetria')}>
      <p className="sim-phase" data-tone={phase.tone} key={phase.label}>
        <i />
        {phase.label}
      </p>
      <p className="sim-clock" title={run.clock.note}>
        <b>{clock(t, run.clock.digits)}</b>
        <small>{run.clock.unit}</small>
        <span className="label">{run.clock.label}</span>
      </p>
      <Readouts items={run.telemetry(t)} />
      {run.chart && <MiniChart spec={run.chart} t={t} />}
      {ended && (
        <div className="sim-verdict" data-tone={run.verdict.tone}>
          <b>{run.verdict.label}</b>
          <span>{run.verdict.detail}</span>
        </div>
      )}
    </section>
  )
}

/** Barra de transporte: tocar, percorrer o tempo, ritmo, e passar para o próximo ensaio. */
export function Transport<S>({
  run,
  store,
  live,
  speed,
  sequence,
  onToggle,
  onSeek,
  onSpeed,
  onSequence,
  onEnter,
}: {
  run: SimRun<S> | null
  store: TickStore
  /** a cena atual é a do experimento */
  live: boolean
  speed: number
  sequence: boolean
  onToggle: () => void
  onSeek: (t: number) => void
  onSpeed: (speed: number) => void
  onSequence: (on: boolean) => void
  onEnter: () => void
}) {
  const { t, playing, ended } = useTick(store)
  const ready = Boolean(run?.playable)
  const start = run?.start ?? 0
  const end = run?.duration ?? 1
  const span = end - start || 1
  const at = ((t - start) / span) * 100
  return (
    <div className="sim-transport" data-live={live}>
      {live ? (
        <button type="button" className="sim-play" aria-label={playing ? tr('Pause', 'Pausar') : ended ? tr('Play again', 'Reproduzir de novo') : tr('Play', 'Reproduzir')} disabled={!ready} onClick={onToggle}>
          {playing ? <IconPause size={18} /> : ended ? <IconRestart size={18} /> : <IconPlay size={18} />}
        </button>
      ) : (
        <button type="button" className="sim-play sim-play--enter" disabled={!ready} onClick={onEnter}>
          <IconPlay size={16} />
          <span>{tr('View the test', 'Ver o ensaio')}</span>
        </button>
      )}
      <div className="sim-scrub" data-off={!live || !ready || undefined}>
        <div className="sim-scrub__track">
          {run?.phases.map((p) => (
            <i
              key={p.id}
              data-tone={p.tone}
              data-open={p.open || undefined}
              title={p.label}
              style={{ left: `${((p.t0 - start) / span) * 100}%`, width: `${((p.t1 - p.t0) / span) * 100}%` }}
            />
          ))}
          <b style={{ width: `${Math.min(100, Math.max(0, at))}%` }} />
          <u style={{ left: `${Math.min(100, Math.max(0, at))}%` }} />
        </div>
        <input
          type="range"
          aria-label={tr('Playback position', 'Posição na reprodução')}
          min={start}
          max={end}
          step={span / 1000}
          value={t}
          disabled={!live || !ready}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
      </div>
      <p className="sim-time">
        <b>{run && ready ? fixed(Math.max(0, t), 1) : '—'}</b>
        <span>
          / {run && ready ? fixed(end, 1) : '—'} {run?.clock.unit}
        </span>
      </p>
      <div className="sim-speed" role="radiogroup" aria-label={tr('Playback speed', 'Ritmo da reprodução')}>
        {SPEEDS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={s === speed} onClick={() => onSpeed(s)}>
            {s === 0.5 ? '½' : s}×
          </button>
        ))}
      </div>
      <button type="button" className="sim-icon" aria-pressed={sequence} title={tr('Sequence: when it ends, moves on to the next test', 'Sequência: ao terminar, passa para o próximo ensaio')} aria-label={tr('Play in sequence', 'Reproduzir em sequência')} onClick={() => onSequence(!sequence)}>
        <IconRepeat size={16} />
      </button>
    </div>
  )
}

/** Faixa de ensaios: uma barra por ensaio, cor = desfecho, altura = a medida do estudo. */
export const RunStrip = memo(function RunStrip<S>({
  runs,
  selected,
  noun,
  measure,
  onSelect,
}: {
  runs: readonly SimRun<S>[]
  selected: string | null
  noun: readonly [string, string]
  measure: string
  onSelect: (id: string) => void
}) {
  const legend = [...new Map(runs.map((r) => [r.toneLabel, r.tone])).entries()]
  return (
    <div className="sim-strip">
      <div className="sim-strip__bars" role="listbox" aria-label={tr(`${noun[1]} in the filter`, `${noun[1]} no filtro`)} title={measure}>
        {runs.map((run) => (
          <button
            key={run.id}
            type="button"
            role="option"
            aria-selected={run.id === selected}
            aria-label={`${noun[0]} ${run.label}: ${run.title}, ${run.toneLabel}`}
            data-tone={run.tone}
            data-off={!run.playable || undefined}
            data-tip={`${run.label} · ${run.toneLabel}`}
            style={{ '--h': run.level === null ? 0.16 : 0.22 + 0.78 * run.level } as CSSProperties}
            onClick={() => onSelect(run.id)}
          >
            <i />
          </button>
        ))}
      </div>
      <p className="sim-strip__legend">
        <span className="label">
          {runs.length} {runs.length === 1 ? noun[0] : noun[1]}
        </span>
        {legend.map(([label, tone]) => (
          <span key={label} data-tone={tone}>
            <i />
            {label}
          </span>
        ))}
      </p>
    </div>
  )
}) as <S>(props: { runs: readonly SimRun<S>[]; selected: string | null; noun: readonly [string, string]; measure: string; onSelect: (id: string) => void }) => ReactNode

/** Marcador sobre a cena. O diretor move o elemento a cada quadro; aqui só o desenho. */
export function HotspotLabel({
  spot,
  register,
  onGo,
  onFocus,
}: {
  spot: Hotspot
  register: (id: string, el: HTMLElement | null) => void
  onGo: (id: string) => void
  onFocus: (tag: string | null) => void
}) {
  const left = spot.dx < 0
  const run = 16 // trecho horizontal da linha de chamada
  const w = Math.abs(spot.dx) + run
  const h = Math.abs(spot.dy)
  const x0 = left ? w : 0
  const y0 = spot.dy < 0 ? h : 0
  const x1 = left ? run : Math.abs(spot.dx)
  const y1 = spot.dy < 0 ? 0 : h
  const x2 = left ? 0 : w
  const Tag = spot.to ? 'button' : 'div'
  return (
    <div className="sim-spot" data-minor={spot.minor || undefined} data-link={spot.to ? true : undefined} ref={(el) => register(spot.id, el)}>
      <i className="sim-spot__dot" />
      <svg className="sim-spot__lead" width={w + 2} height={h + 2} style={{ left: left ? -w - 1 : -1, top: spot.dy < 0 ? -h - 1 : -1 }} aria-hidden>
        <path d={`M${x0 + 1},${y0 + 1}L${x1 + 1},${y1 + 1}H${x2 + 1}`} fill="none" />
      </svg>
      <Tag
        {...(spot.to ? { type: 'button' as const, onClick: () => onGo(spot.to!) } : {})}
        className="sim-spot__label"
        data-side={left ? 'left' : 'right'}
        style={{ left: left ? -w - 6 : w + 6, top: spot.dy }}
        onPointerEnter={() => onFocus(spot.tag ?? null)}
        onPointerLeave={() => onFocus(null)}
        onFocus={() => onFocus(spot.tag ?? null)}
        onBlur={() => onFocus(null)}
      >
        <b>{spot.label}</b>
        {spot.sub && <small>{spot.sub}</small>}
        {spot.to && <IconArrowRight size={14} />}
      </Tag>
    </div>
  )
}

/** O que é dado e o que é ilustração nesta reprodução. */
export function Notes({ notes, blurb, onClose }: { notes: readonly string[]; blurb: string; onClose: () => void }) {
  return (
    <aside className="sim-notes" role="dialog" aria-label={tr('What is data and what is illustration', 'O que é dado e o que é ilustração')}>
      <header>
        <p className="label">
          <IconInfo size={14} /> {tr('Data × illustration', 'Dado × ilustração')}
        </p>
        <button type="button" className="sim-icon" aria-label={tr('Close', 'Fechar')} onClick={onClose}>
          ×
        </button>
      </header>
      <p className="sim-notes__lead">{blurb}</p>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <p className="sim-notes__key">
        <span data-soft>{tr('0.00', '0,00')}</span>{' '}
        {tr('values with a dashed underline are reconstructed or estimated; the rest come from the source.', 'valores sublinhados em tracejado são reconstruídos ou estimados; os demais vêm da fonte.')}
      </p>
    </aside>
  )
}
