/** Controles de filtro da barra lateral. Todos controlados: o estado fica na página. */

import { IconClose, IconSearch } from '@/icons'
import { type ReactNode, useId, useMemo, useState } from 'react'
import type { Range } from '@/lib/data'
import { g } from '@/lib/format'
import { t } from '@/lib/i18n'
import { td } from '@/lib/i18n-data'

/** Como uma opção aparece quando a página não diz: valores do banco saem no idioma da interface. */
const shown = (option: unknown) => td(String(option))

function Field({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Fieldset({ legend, actions, children }: { legend: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="field">
      <legend className="field__label">
        {legend}
        {actions}
      </legend>
      {children}
    </fieldset>
  )
}

/** Várias opções marcáveis, para listas curtas (até uma dúzia). */
export function CheckboxGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format = shown,
}: {
  label: string
  options: readonly T[]
  value: readonly T[]
  onChange: (value: T[]) => void
  format?: (option: T) => string
}) {
  const all = value.length === options.length
  const toggle = (option: T) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : options.filter((o) => o === option || value.includes(o)))
  return (
    <Fieldset
      legend={label}
      actions={
        options.length > 2 && (
          <button type="button" className="link-button" onClick={() => onChange(all ? [] : [...options])}>
            {all ? t('none', 'nenhum') : t('all', 'todos')}
          </button>
        )
      }
    >
      <div className="checks">
        {options.map((option) => (
          <label key={String(option)} className="check">
            <input type="checkbox" checked={value.includes(option)} onChange={() => toggle(option)} />
            <span>{format(option)}</span>
          </label>
        ))}
      </div>
    </Fieldset>
  )
}

/** Faixa numérica com dois cursores. Se todos os registros têm o mesmo valor, só informa. */
export function RangeFilter({
  label,
  bounds,
  value,
  onChange,
  digits,
}: {
  label: string
  bounds: Range | null
  value: Range | null
  onChange: (value: Range) => void
  digits?: number
}) {
  const id = useId()
  if (!bounds) return null
  const [lo, hi] = bounds
  const fmt = (v: number) => (digits === undefined ? g(v) : v.toFixed(digits))
  if (lo === hi) {
    return (
      <p className="caption">
        {label}: {fmt(lo)} {t('in every record', 'em todos os registros')}
      </p>
    )
  }
  const [a, b] = value ?? bounds
  const step = (hi - lo) / 200
  return (
    <Field label={label} id={`${id}-lo`}>
      <div className="range">
        <input
          id={`${id}-lo`}
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={a}
          aria-label={t(`${label}: minimum`, `${label}: mínimo`)}
          onChange={(e) => onChange([Math.min(Number(e.target.value), b), b])}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={b}
          aria-label={t(`${label}: maximum`, `${label}: máximo`)}
          onChange={(e) => onChange([a, Math.max(Number(e.target.value), a)])}
        />
      </div>
      <div className="range__values">
        <span>{fmt(a)}</span>
        <span>{fmt(b)}</span>
      </div>
    </Field>
  )
}

export function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <label className="toggle" title={help}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden />
      <span>{label}</span>
    </label>
  )
}

export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  format = shown,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  format?: (option: T) => string
}) {
  const id = useId()
  return (
    <Field label={label} id={id}>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {format(o)}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** Uma escolha entre poucas opções, como botões lado a lado. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  format = shown,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  format?: (option: T) => string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} onClick={() => onChange(o)}>
          {format(o)}
        </button>
      ))}
    </div>
  )
}

/** Uma escolha numa lista vertical (os conjuntos do PSI-142). */
export function RadioList<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format = shown,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  format?: (option: T) => string
}) {
  const name = useId()
  return (
    <Fieldset legend={label}>
      <div className="checks">
        {options.map((o) => (
          <label key={String(o)} className="check">
            <input type="radio" name={name} checked={o === value} onChange={() => onChange(o)} />
            <span>{format(o)}</span>
          </label>
        ))}
      </div>
    </Fieldset>
  )
}

/** Escolha múltipla com busca, para listas longas (as séries do explorador). */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  max,
}: {
  label: string
  options: readonly string[]
  value: readonly string[]
  onChange: (value: string[]) => void
  max?: number
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const full = max !== undefined && value.length >= max
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter((o) => !value.includes(o) && (!q || o.toLowerCase().includes(q))).slice(0, 50)
  }, [options, value, query])
  return (
    <Field label={label} id={id}>
      {value.length > 0 && (
        <div className="chips">
          {value.map((v) => (
            <span key={v} className="chip">
              {v}
              <button type="button" aria-label={t(`Remove ${v}`, `Tirar ${v}`)} onClick={() => onChange(value.filter((x) => x !== v))}>
                <IconClose size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="search">
        <IconSearch size={14} />
        <input
          id={id}
          type="search"
          placeholder={full ? t(`Maximum of ${max}`, `Máximo de ${max}`) : t('Search…', 'Buscar…')}
          disabled={full}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!full && query && (
        <ul className="options" role="listbox" aria-label={label}>
          {matches.map((o) => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange([...value, o])
                  setQuery('')
                }}
              >
                {o}
              </button>
            </li>
          ))}
          {!matches.length && <li className="caption">{t('Nothing found.', 'Nada encontrado.')}</li>}
        </ul>
      )}
    </Field>
  )
}
