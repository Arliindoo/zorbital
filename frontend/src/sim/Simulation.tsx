/**
 * Vista "Simulação" de um estudo: a cena em WebGL e o HUD em volta.
 *
 * O desenho e a câmera ficam no `Director` (fora do React). Este componente cuida do estado de
 * tela: cena atual, ensaio selecionado, percurso guiado da primeira visita, tela cheia e teclado.
 */

import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { reducedMotion } from '@/fx/useInView'
import { IconFullScreen, IconInfo, IconQuitFullScreen, IconRotateView, IconRouting, IconTarget, IconWarning, IconZoomIn, IconZoomOut } from '@/icons'
import { t } from '@/lib/i18n'
import { session } from '@/lib/storage'
import { usePageState } from '@/lib/usePageState'
import { Director, type Overlay } from './director'
import { HotspotLabel, Notes, RunCard, RunStrip, SceneCard, StageTrail, Telemetry, Transport } from './hud/Hud'
import { createTickStore } from './hud/tick'
import type { Hotspot, SimRun, SimStudy } from './types'
import '@/styles/sim.css'

export interface SimulationProps<S> {
  study: SimStudy<S>
  /** seleção controlada pela página (quando o item também é filtro do painel) */
  runId?: string | null
  onRunId?: (id: string) => void
  /** descrição do que está na tela, para o assistente */
  onReport?: (text: string) => void
}

const TOUR_FIRST_MS = 2600
const TOUR_STEP_MS = 3900

export default function Simulation<S>({ study, runId, onRunId, onReport }: SimulationProps<S>) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const director = useRef<Director<S> | null>(null)
  const [overlay] = useState<Overlay>(() => ({ hot: new Map(), dims: [] }))
  const [store] = useState(createTickStore)
  const [host] = useState(() => {
    const el = document.createElement('div')
    el.className = 'sim-host sim-dark'
    return el
  })

  const [still] = useState(reducedMotion)
  const lastStage = study.stages.at(-1)!.id
  const seenKey = `sim:${study.id}:visto`
  // primeira visita: começa na cena mais ampla e desce sozinha até o experimento
  const [fresh] = useState(() => session.get<boolean>(seenKey) !== true)
  const [savedStage, saveStage] = usePageState<string>(`sim:${study.id}:cena`, fresh && !still ? study.stages[0]!.id : lastStage)
  const [stageId, setStageId] = useState(() => (study.stages.some((s) => s.id === savedStage) ? savedStage : lastStage))
  const [target, setTarget] = useState(stageId)
  const [touring, setTouring] = useState(false)
  const [hint, setHint] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [auto, setAuto] = useState(true)
  const [notes, setNotes] = useState(false)
  const [speed, setSpeed] = usePageState<number>('sim:ritmo', 1)
  const [sequence, setSequence] = usePageState<boolean>('sim:sequencia', false)
  const [error, setError] = useState<string | null>(null)
  const [spots, setSpots] = useState<readonly Hotspot[]>([])

  // ---------- ensaio selecionado -------------------------------------------------------------
  const [savedRun, saveRun] = usePageState<string | null>(`sim:${study.id}:ensaio`, null)
  const chosen = runId !== undefined ? runId : savedRun
  const run = useMemo<SimRun<S> | null>(
    () => study.runs.find((r) => r.id === chosen) ?? study.runs.find((r) => r.playable) ?? study.runs[0] ?? null,
    [study.runs, chosen],
  )
  const index = run ? study.runs.indexOf(run) : -1
  const select = useCallback(
    (id: string) => {
      if (onRunId) onRunId(id)
      else saveRun(id)
    },
    [onRunId, saveRun],
  )
  const step = useCallback(
    (delta: number, playableOnly = false) => {
      const n = study.runs.length
      if (!n) return
      let i = index
      for (let k = 0; k < n; k++) {
        i = (i + delta + n) % n
        if (!playableOnly || study.runs[i]!.playable) break
      }
      select(study.runs[i]!.id)
    },
    [study.runs, index, select],
  )

  const stage = study.stages.find((s) => s.id === stageId) ?? study.stages[0]!
  const stageIndex = study.stages.indexOf(stage)
  const next = study.stages[stageIndex + 1] ?? null
  const experiment = study.stages.find((s) => s.experiment) ?? study.stages.at(-1)!

  // valores lidos pelos ganchos do diretor, sempre atuais
  const live = useRef({ study, run, stageId, speed, sequence, step, touring })
  live.current = { study, run, stageId, speed, sequence, step, touring }
  const tour = useRef<{ stop: () => void } | null>(null)

  const endTour = useCallback(() => {
    tour.current?.stop()
    tour.current = null
    setTouring(false)
    session.set(seenKey, true)
  }, [seenKey])

  const go = useCallback(
    (id: string) => {
      endTour()
      setTarget(id)
      director.current?.go(id)
    },
    [endTour],
  )

  // ---------- diretor ---------------------------------------------------------------------------
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    let sequenceTimer = 0
    const d = new Director<S>(el, overlay, live.current.study, live.current.stageId, {
      onTick: store.set,
      onStage: (id, hotspots) => {
        setStageId(id)
        saveStage(id)
        setSpots(hotspots)
      },
      onEnded: () => {
        if (!live.current.sequence) return
        window.clearTimeout(sequenceTimer)
        sequenceTimer = window.setTimeout(() => live.current.step(1, true), 1700)
      },
      onInput: () => {
        setHint(false)
        if (live.current.touring) {
          tour.current?.stop()
          tour.current = null
          setTouring(false)
          session.set(seenKey, true)
        }
      },
      onError: setError,
    })
    director.current = d
    d.setSpeed(live.current.speed)
    d.setRun(live.current.run)
    return () => {
      window.clearTimeout(sequenceTimer)
      d.destroy()
      director.current = null
    }
  }, [overlay, store, saveStage, seenKey])

  useEffect(() => director.current?.setStudy(study), [study])
  useEffect(() => director.current?.setRun(run), [run])
  useEffect(() => director.current?.setSpeed(speed), [speed])
  useEffect(() => director.current?.setAutoRotate(auto), [auto])
  // rótulos novos entraram no DOM: pede um quadro para posicioná-los
  useEffect(() => director.current?.refresh(), [stageId])

  // ---------- percurso guiado da primeira visita ------------------------------------------------
  useEffect(() => {
    if (!fresh || still || study.stages.length < 2) return
    const timers: number[] = []
    let at = TOUR_FIRST_MS
    for (const s of study.stages.slice(1)) {
      timers.push(
        window.setTimeout(() => {
          setTarget(s.id)
          director.current?.go(s.id)
        }, at),
      )
      at += TOUR_STEP_MS
    }
    timers.push(
      window.setTimeout(() => {
        setTouring(false)
        session.set(seenKey, true)
      }, at - TOUR_STEP_MS + 1800),
    )
    tour.current = { stop: () => timers.forEach((id) => window.clearTimeout(id)) }
    setTouring(true)
    return () => timers.forEach((id) => window.clearTimeout(id))
    // só na montagem: o percurso não recomeça quando os filtros mudam
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- tela cheia: o mesmo nó muda de lugar, o canvas e o contexto WebGL são preservados --
  useLayoutEffect(() => {
    const parent = expanded ? document.body : slot.current
    parent?.appendChild(host)
    host.dataset.expanded = String(expanded)
    document.documentElement.classList.toggle('sim-lock', expanded)
    director.current?.setEngaged(expanded)
    return () => {
      document.documentElement.classList.remove('sim-lock')
    }
  }, [expanded, host])
  useEffect(() => () => host.remove(), [host])

  // ---------- o que está na tela, para o assistente ---------------------------------------------
  useEffect(() => {
    if (!onReport) return
    const what = run
      ? t(
          `${study.noun[0]} ${run.label} (${run.title}); outcome in the replay: ${run.verdict.label} — ${run.verdict.detail}`,
          `${study.noun[0]} ${run.label} (${run.title}); desfecho na reprodução: ${run.verdict.label} — ${run.verdict.detail}`,
        )
      : t(`no ${study.noun[0]} in the filter`, `nenhum ${study.noun[0]} no filtro`)
    onReport(
      t(
        `Simulation of the experiment, scene "${stage.label}" (${stage.scale}): ${what}. It is a reconstruction from the source values, not a video of the experiment.`,
        `Simulação do experimento, cena "${stage.label}" (${stage.scale}): ${what}. É uma reconstrução a partir dos valores da fonte, não um vídeo do experimento.`,
      ),
    )
  }, [onReport, run, stage, study.noun])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement) return
    const d = director.current
    if (!d || e.metaKey || e.ctrlKey || e.altKey) return
    const key = e.key
    if (key === ' ') {
      if (e.target instanceof HTMLButtonElement) return
      if (stage.experiment) d.toggle()
      else go(experiment.id)
    } else if (key === 'ArrowRight') step(1)
    else if (key === 'ArrowLeft') step(-1)
    else if (key === '+' || key === '=') d.zoomBy(0.8)
    else if (key === '-') d.zoomBy(1.25)
    else if (key === 'r' || key === 'R') d.resetView()
    else if (key === 'f' || key === 'F') setExpanded((v) => !v)
    else if (key === 'Escape' && expanded) setExpanded(false)
    else if (/^[1-9]$/.test(key) && study.stages[Number(key) - 1]) go(study.stages[Number(key) - 1]!.id)
    else return
    e.preventDefault()
  }

  const register = useCallback(
    (id: string, el: HTMLElement | null) => {
      if (el) overlay.hot.set(id, el)
      else overlay.hot.delete(id)
    },
    [overlay],
  )
  const focus = useCallback((tag: string | null) => director.current?.setFocus(tag), [])

  const body = (
    <div className="sim" ref={root} tabIndex={0} onKeyDown={onKey} data-stage={stage.id} data-live={stage.experiment} aria-label={t(`Simulation: ${stage.title}`, `Simulação: ${stage.title}`)}>
      <canvas ref={canvas} className="sim__canvas" />
      <i className="sim__vignette" aria-hidden />
      <i className="sim__beam" key={stageId} aria-hidden />

      {error ? (
        <div className="sim-error" role="alert">
          <IconWarning size={22} />
          <p>
            <b>{t('Could not open the 3D scene.', 'Não foi possível abrir a cena 3D.')}</b>
            <span>
              {t(
                `This browser did not provide WebGL2 (${error}). The study dashboard is still available.`,
                `Este navegador não ofereceu WebGL2 (${error}). O painel do estudo continua disponível.`,
              )}
            </span>
          </p>
        </div>
      ) : (
        <>
          <div className="sim__overlay">
            {spots.map((spot) => (
              <HotspotLabel key={`${stageId}:${spot.id}`} spot={spot} register={register} onGo={go} onFocus={focus} />
            ))}
            {[0, 1].map((i) => (
              <div
                key={i}
                className="sim-dim"
                ref={(el) => {
                  overlay.dims[i] = el
                }}
              >
                <span />
              </div>
            ))}
          </div>

          <header className="sim__top">
            <StageTrail study={study} current={target} onGo={go} />
            <div className="sim-tools">
              {touring && (
                <button type="button" className="sim-pill" onClick={endTour}>
                  <IconRouting size={15} /> {t('Guided tour · stop', 'Percurso guiado · parar')}
                </button>
              )}
              <button type="button" className="sim-icon" aria-label={t('Zoom out', 'Afastar')} title={t('Zoom out (−)', 'Afastar (−)')} onClick={() => director.current?.zoomBy(1.3)}>
                <IconZoomOut size={16} />
              </button>
              <button type="button" className="sim-icon" aria-label={t('Zoom in', 'Aproximar')} title={t('Zoom in (+)', 'Aproximar (+)')} onClick={() => director.current?.zoomBy(0.77)}>
                <IconZoomIn size={16} />
              </button>
              <button type="button" className="sim-icon" aria-label={t('Recenter the camera', 'Recentrar a câmera')} title={t('Recenter (R)', 'Recentrar (R)')} onClick={() => director.current?.resetView()}>
                <IconTarget size={16} />
              </button>
              <button type="button" className="sim-icon" aria-pressed={auto} aria-label={t('Auto-rotate', 'Giro automático')} title={t('Auto-rotate', 'Giro automático')} onClick={() => setAuto((v) => !v)}>
                <IconRotateView size={16} />
              </button>
              <button type="button" className="sim-icon" aria-pressed={notes} aria-label={t('What is data and what is illustration', 'O que é dado e o que é ilustração')} title={t('Data × illustration', 'Dado × ilustração')} onClick={() => setNotes((v) => !v)}>
                <IconInfo size={16} />
              </button>
              <button type="button" className="sim-icon" aria-pressed={expanded} aria-label={expanded ? t('Exit full screen', 'Sair da tela cheia') : t('Full screen', 'Tela cheia')} title={t('Full screen (F)', 'Tela cheia (F)')} onClick={() => setExpanded((v) => !v)}>
                {expanded ? <IconQuitFullScreen size={16} /> : <IconFullScreen size={16} />}
              </button>
            </div>
          </header>

          <aside className="sim__left">
            <RunCard run={run} index={index} total={study.runs.length} noun={study.noun} onStep={step} />
          </aside>
          <aside className="sim__right" key={stage.experiment ? 'live' : stage.id}>
            {stage.experiment ? <Telemetry run={run} store={store} onNext={() => step(1, true)} /> : <SceneCard stage={stage} run={run} next={next} onGo={go} />}
          </aside>
          {stage.experiment && run?.playable && (
            <p className="sim-caption" key={stage.id}>
              {stage.blurb}
            </p>
          )}
          {notes && <Notes notes={run?.notes ?? []} blurb={stage.blurb} onClose={() => setNotes(false)} />}

          <footer className="sim__bottom">
            {hint && !touring && (
              <p className="sim-hint">
                {t('drag to orbit · click and scroll to zoom', 'arraste para orbitar · clique e role para aproximar')}
              </p>
            )}
            <Transport
              run={run}
              store={store}
              live={stage.experiment}
              speed={speed}
              sequence={sequence}
              onToggle={() => director.current?.toggle()}
              onSeek={(t) => director.current?.seek(t)}
              onSpeed={setSpeed}
              onSequence={setSequence}
              onEnter={() => go(experiment.id)}
            />
            <RunStrip runs={study.runs} selected={run?.id ?? null} noun={study.noun} measure={study.stripMeasure} onSelect={select} />
          </footer>
        </>
      )}
    </div>
  )

  return (
    <div ref={slot} className="sim-slot">
      {createPortal(body, host)}
    </div>
  )
}
