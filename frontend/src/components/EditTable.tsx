/** Tabela editável da revisão: cada célula é um campo; as colunas fixas mostram de onde o valor saiu. */

import { type ReactNode, useState } from 'react'
import { IconAdd, IconTrash } from '@/icons'

export interface EditColumn<T> {
  key: keyof T & string
  label: string
  help?: string
  kind: 'text' | 'number' | 'select' | 'check' | 'static'
  options?: readonly { value: string; label: string }[]
  wide?: boolean
  /** Conteúdo das colunas fixas (`static`). */
  render?: (row: T) => ReactNode
}

interface EditTableProps<T> {
  /** O que a tabela edita, para leitores de tela. */
  label: string
  rows: readonly T[]
  columns: readonly EditColumn<T>[]
  onChange: (index: number, patch: Partial<T>) => void
  /** Com os dois, dá para acrescentar e remover linhas. */
  onAdd?: () => void
  onRemove?: (index: number) => void
  /** Linha que ainda pede atenção de quem revisa (ganha um traço à esquerda). */
  flagged?: (row: T) => boolean
  empty?: string
}

/**
 * Campo numérico que guarda o texto enquanto a pessoa digita: "1," ou "-" ainda não são números, e
 * reescrever o campo a cada tecla apagaria o que ela está escrevendo.
 */
function NumberCell({ value, label, onChange }: { value: number | null; label: string; onChange: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const parsed = text.trim() === '' ? null : Number(text.replace(',', '.'))
  // o valor mudou por fora (outra linha removida, proposta recarregada): o campo acompanha
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (value !== parsed) setText(value === null ? '' : String(value))
  }
  return (
    <input
      className="edit__input edit__input--num"
      type="text"
      inputMode="decimal"
      value={text}
      aria-label={label}
      aria-invalid={parsed !== null && Number.isNaN(parsed) ? true : undefined}
      onChange={(e) => {
        setText(e.target.value)
        const next = e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.'))
        if (next === null || !Number.isNaN(next)) onChange(next)
      }}
    />
  )
}

export function EditTable<T extends object>({ label, rows, columns, onChange, onAdd, onRemove, flagged, empty = 'Nenhuma linha.' }: EditTableProps<T>) {
  const cell = (row: T, index: number, column: EditColumn<T>) => {
    const value = row[column.key] as unknown
    const name = `${column.label}, linha ${index + 1}`
    const set = (next: unknown) => onChange(index, { [column.key]: next } as Partial<T>)
    switch (column.kind) {
      case 'static':
        return <span className="edit__static">{column.render ? column.render(row) : String(value ?? '—')}</span>
      case 'check':
        return (
          <label className="edit__check">
            <input type="checkbox" checked={!!value} aria-label={name} onChange={(e) => set(e.target.checked)} />
          </label>
        )
      case 'select':
        return (
          <select className="edit__input" value={String(value ?? '')} aria-label={name} onChange={(e) => set(e.target.value || null)}>
            {column.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      case 'number':
        return <NumberCell value={typeof value === 'number' ? value : null} label={name} onChange={set} />
      default:
        return <input className="edit__input" type="text" value={String(value ?? '')} title={String(value ?? '')} aria-label={name} onChange={(e) => set(e.target.value)} />
    }
  }

  return (
    <div className="table edit">
      <div className="table__scroll">
        <table aria-label={label}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} title={column.help} className={column.wide ? 'th--wide' : undefined}>
                  <span>{column.label}</span>
                </th>
              ))}
              {onRemove && <th aria-label="Remover" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              // as linhas não mudam de ordem: o índice é a identidade delas enquanto a tela está aberta
              <tr key={index} data-flag={flagged?.(row) || undefined}>
                {columns.map((column) => (
                  <td key={column.key} className={column.kind === 'check' ? 'td--check' : undefined}>
                    {cell(row, index, column)}
                  </td>
                ))}
                {onRemove && (
                  <td className="td--check">
                    <button type="button" className="icon-button edit__remove" aria-label={`Remover a linha ${index + 1}`} onClick={() => onRemove(index)}>
                      <IconTrash size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={columns.length + (onRemove ? 1 : 0)} className="edit__empty">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {onAdd && (
        <div className="table__footer">
          <span>
            {rows.length} {rows.length === 1 ? 'linha' : 'linhas'}
          </span>
          <button type="button" className="button button--ghost" onClick={onAdd}>
            <IconAdd size={14} /> Acrescentar linha
          </button>
        </div>
      )}
    </div>
  )
}
