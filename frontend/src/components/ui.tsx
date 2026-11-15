/** Peças pequenas de tela repetidas entre as páginas. */

import { Children, type CSSProperties, type ReactNode } from 'react'
import { CountUp } from '@/fx/CountUp'
import { type Icon, IconCheck, IconChevronRight, IconDanger, IconInfo, IconWarning } from '@/icons'

export function Metric({
  label,
  value,
  help,
  unit,
  digits,
  accent,
}: {
  label: string
  value: ReactNode
  help?: string
  unit?: string
  digits?: number
  /** Cor do traço de base (uma variável de série, ex.: `var(--s3)`). */
  accent?: string
}) {
  return (
    <div
      className="metric"
      title={help}
      style={accent ? ({ '--accent': accent } as CSSProperties) : undefined}
    >
      <span className="label">{label}</span>
      <span className="metric__value">
        {typeof value === 'number' ? (
          <CountUp value={value} digits={digits ?? (Number.isInteger(value) ? 0 : 2)} />
        ) : (
          value
        )}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  )
}

export function Metrics({ children }: { children: ReactNode }) {
  return (
    <div className="metrics" data-agent-target data-agent-kind="metric" data-agent-label="Indicadores">
      {Children.map(children, (child, i) => (
        <div style={{ '--i': i, display: 'contents' } as CSSProperties}>{child}</div>
      ))}
    </div>
  )
}

type Tone = 'info' | 'warning' | 'error' | 'success'
const TONE_ICON: Record<Tone, Icon> = { info: IconInfo, warning: IconWarning, error: IconDanger, success: IconCheck }

export function Callout({ tone = 'info', icon, children }: { tone?: Tone; icon?: Icon; children: ReactNode }) {
  const IconFor = icon ?? TONE_ICON[tone]
  return (
    <div className={`callout callout--${tone}`} role={tone === 'error' ? 'alert' : 'note'}>
      <IconFor className="callout__icon" size={18} />
      <div className="callout__body">{children}</div>
    </div>
  )
}

/** Seção recolhível nativa (`<details>`): acessível pelo teclado e sem estado em React. */
export function Expander({
  title,
  icon: IconFor,
  children,
  defaultOpen = false,
}: {
  title: ReactNode
  icon?: Icon
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details className="expander" open={defaultOpen}>
      <summary>
        <IconChevronRight className="expander__chevron" size={16} />
        {IconFor && <IconFor size={16} />}
        <span>{title}</span>
      </summary>
      <div className="expander__body">{children}</div>
    </details>
  )
}

export interface PanelProps {
  title?: ReactNode
  caption?: ReactNode
  /** Rótulo técnico no canto (tipo de gráfico, unidade, contagem). */
  tag?: ReactNode
  icon?: Icon
  /** O que o agente encontra neste bloco quando lê a tela. */
  kind?: 'chart' | 'metric' | 'table' | 'flow' | 'card'
  label?: string
  /** Colunas ocupadas na grade de 12 (e na grade de telas médias). */
  span?: number
  spanMd?: number
  /** Rodapé de números: pares rótulo/valor. */
  foot?: { label: string; value: ReactNode; unit?: string }[]
  flush?: boolean
  hud?: boolean
  className?: string
  children?: ReactNode
}

/** A carta do sistema: cabeçalho com ícone e rótulo técnico, corpo e rodapé de números. */
export function Panel({ title, caption, tag, icon: IconFor, kind = 'card', label, span, spanMd, foot, flush, hud, className = '', children }: PanelProps) {
  const style = { '--span': span, '--span-md': spanMd ?? (span && span < 6 ? 6 : 12) } as CSSProperties
  return (
    <section
      className={`panel ${hud ? 'panel--hud' : ''} ${className}`}
      style={style}
      data-agent-target
      data-agent-kind={kind}
      data-agent-label={label ?? (typeof title === 'string' ? title : undefined)}
    >
      {hud && <span className="hud-corners" aria-hidden />}
      {(title || tag) && (
        <header className="panel__head">
          {IconFor && (
            <span className="panel__icon">
              <IconFor size={17} />
            </span>
          )}
          <div className="panel__titles">
            {title && <h2>{title}</h2>}
            {caption && <p>{caption}</p>}
          </div>
          {tag && <span className="panel__tag label">{tag}</span>}
        </header>
      )}
      <div className={flush ? 'panel__body panel__body--flush' : 'panel__body'}>{children}</div>
      {foot && (
        <footer className="panel__foot">
          {foot.map((item) => (
            <div key={item.label}>
              <span className="label">{item.label}</span>
              <b>
                {item.value}
                {item.unit && <small>{item.unit}</small>}
              </b>
            </div>
          ))}
        </footer>
      )}
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Panel className={className}>{children}</Panel>
}

export type BadgeTone = 'gray' | 'orange' | 'green' | 'red' | 'blue' | 'violet'

export function Badge({ tone = 'gray', icon: IconFor, children }: { tone?: BadgeTone; icon?: Icon; children: ReactNode }) {
  return (
    <span className={`badge badge--${tone}`}>
      {IconFor && <IconFor size={13} />}
      {children}
    </span>
  )
}

export function Caption({ children }: { children: ReactNode }) {
  return <p className="caption">{children}</p>
}

/** Bloco com título: um painel. `kind` diz ao agente se é gráfico ou tabela. */
export function Section({ title, caption, children, ...panel }: Omit<PanelProps, 'title' | 'caption'> & { title: ReactNode; caption?: ReactNode }) {
  return (
    <Panel title={title} caption={caption} {...panel}>
      {children}
    </Panel>
  )
}

/** Blocos lado a lado na grade de 12; empilham em tela estreita. */
export function Columns({ children }: { children: ReactNode; ratio?: string }) {
  const count = Children.count(children)
  return (
    <div className="grid" style={{ '--cols': count } as CSSProperties}>
      {Children.map(children, (child) => (
        <div style={{ '--span': Math.floor(12 / count), '--span-md': 12, display: 'grid' } as CSSProperties}>{child}</div>
      ))}
    </div>
  )
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid">{children}</div>
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="code">{children}</code>
}
