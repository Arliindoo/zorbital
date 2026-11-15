import { t } from '@/lib/i18n'

export function Loading({ label = t('Loading…', 'Carregando…') }: { label?: string }) {
  return (
    <div className="loading label" role="status" aria-live="polite">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
        <circle className="a" cx="20" cy="20" r="16" stroke="var(--signal)" strokeWidth="1.2" strokeDasharray="30 70" strokeLinecap="round" />
        <circle className="b" cx="20" cy="20" r="10" stroke="var(--magenta)" strokeWidth="1.2" strokeDasharray="12 51" strokeLinecap="round" />
        <circle cx="20" cy="20" r="2" fill="var(--ink)" />
      </svg>
      {label}
    </div>
  )
}
