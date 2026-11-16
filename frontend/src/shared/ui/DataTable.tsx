import { IconArrowDown, IconArrowUp, IconCheck, IconDownload, IconMinus } from '@/shared/icons/index'
import { useMemo, useState } from 'react'
import type { Cell, Column, Row } from '@/shared/api/types'
import { compareCells } from '@/shared/lib/data'
import { fixed, g } from '@/shared/lib/format'
import { locale, t } from '@/shared/lib/i18n'
import { tc, td } from '@/shared/lib/i18n-data'

export interface ColumnConfig {
  label?: string
  help?: string
  /** Casas decimais fixas; `signed` mostra o sinal (+/−). */
  digits?: number
  signed?: boolean
  wide?: boolean
}

interface DataTableProps {
  rows: readonly Row[]
  /** Colunas na ordem do banco; sem isso, as chaves da primeira linha. */
  columns?: readonly Column[]
  config?: Record<string, ColumnConfig | string>
  /** Colunas que não aparecem. */
  hide?: readonly string[]
  /** Nome do arquivo CSV baixado. */
  filename?: string
  pageSize?: number
  maxHeight?: number
}

function render(value: Cell | undefined, conf: ColumnConfig) {
  if (value === null || value === undefined) return <span className="cell--null">—</span>
  if (typeof value === 'boolean')
    return value ? <IconCheck size={15} aria-label={t('yes', 'sim')} aria-hidden={false} style={{ color: 'var(--signal)' }} /> : <IconMinus size={15} className="cell--null" aria-label={t('no', 'não')} aria-hidden={false} />
  if (typeof value === 'number') return conf.digits === undefined ? g(value) : fixed(value, conf.digits, conf.signed)
  return td(value)
}

function toCsv(columns: string[], rows: readonly Row[]): string {
  const quote = (v: Cell | undefined) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => quote(r[c])).join(','))].join('\n')
}

/** Tabela com ordenação por coluna, paginação e download em CSV (o que o st.dataframe oferecia). */
export function DataTable({
  rows,
  columns,
  config = {},
  hide = [],
  filename = t('table', 'tabela'),
  pageSize = 100,
  maxHeight = 440,
}: DataTableProps) {
  const [sort, setSort] = useState<{ column: string; desc: boolean } | null>(null)
  const [page, setPage] = useState(0)

  const names = useMemo(() => {
    const all = columns?.map((c) => c.name) ?? Object.keys(rows[0] ?? {})
    return all.filter((c) => !hide.includes(c))
  }, [columns, rows, hide])

  const sorted = useMemo(() => {
    if (!sort) return rows
    const factor = sort.desc ? -1 : 1
    return [...rows].sort((a, b) => {
      const x = a[sort.column] ?? null
      const y = b[sort.column] ?? null
      if (x === null || y === null) return compareCells(x, y) // vazios sempre no fim
      return factor * compareCells(x, y)
    })
  }, [rows, sort])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pages - 1)
  const visible = sorted.slice(current * pageSize, (current + 1) * pageSize)
  const conf = (c: string): ColumnConfig => {
    const v = config[c]
    return typeof v === 'string' ? { label: v } : (v ?? {})
  }

  const toggleSort = (column: string) => {
    setPage(0)
    setSort((s) => (s?.column !== column ? { column, desc: false } : s.desc ? null : { column, desc: true }))
  }

  const download = () => {
    const blob = new Blob(['﻿', toCsv(names, sorted)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `${filename}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!names.length) return <p className="caption">{t('Empty table.', 'Tabela vazia.')}</p>

  return (
    <div className="table">
      <div className="table__scroll" style={{ maxHeight }}>
        <table>
          <thead>
            <tr>
              {names.map((c) => {
                const { label, help } = conf(c)
                const active = sort?.column === c
                return (
                  <th
                    key={c}
                    title={help ?? c}
                    aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}
                    className={conf(c).wide ? 'th--wide' : undefined}
                  >
                    <button type="button" onClick={() => toggleSort(c)}>
                      {label ?? tc(c)}
                      {active && (sort.desc ? <IconArrowDown size={13} /> : <IconArrowUp size={13} />)}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={current * pageSize + i}>
                {names.map((c) => {
                  const value = row[c]
                  return (
                    <td key={c} className={typeof value === 'number' ? 'td--num' : undefined} title={typeof value === 'string' && value.length > 40 ? value : undefined}>
                      {render(value, conf(c))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table__footer">
        <span>
          {sorted.length.toLocaleString(locale)} {sorted.length === 1 ? t('row', 'linha') : t('rows', 'linhas')}
        </span>
        {pages > 1 && (
          <span className="table__pager">
            <button type="button" className="button button--ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
              {t('Previous', 'Anterior')}
            </button>
            {current + 1} {t('of', 'de')} {pages}
            <button type="button" className="button button--ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              {t('Next', 'Próxima')}
            </button>
          </span>
        )}
        <button type="button" className="button button--ghost" onClick={download} title={t('Download as CSV', 'Baixar como CSV')}>
          <IconDownload size={14} /> CSV
        </button>
      </div>
    </div>
  )
}
