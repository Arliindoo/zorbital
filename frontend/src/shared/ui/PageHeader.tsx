import type { ReactNode } from 'react'
import { Decrypt } from '@/shared/fx/Decrypt'

/** Cabeçalho das páginas que não são uma investigação (comparação, explorador, galeria). */
export function PageHeader({ eyebrow, title, aside, children }: { eyebrow: readonly string[]; title: string; aside?: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <p className="page-header__eyebrow label">
        <i className="dot" />
        {eyebrow.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </p>
      <h1>
        <Decrypt text={title} />
        {aside && <em> {aside}</em>}
      </h1>
      {children && <p className="lead">{children}</p>}
    </header>
  )
}
