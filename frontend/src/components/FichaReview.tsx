/** Revisão da ficha proposta a partir dos documentos (no envio de um estudo e em "Adicionar documentos"). */

import { useMemo } from 'react'
import type { DocSheet, SheetCondition, SheetSensor, Vocabulary } from '@/api/types'
import { IconCheck, IconClose } from '@/icons'
import { options, sheetPending } from '@/lib/review'
import { evidenceLabel } from '@/lib/studies'
import { type EditColumn, EditTable } from './EditTable'
import { Caption } from './ui'

function Checked({ found }: { found: boolean | undefined }) {
  return found ? (
    <span className="checked" data-found>
      <IconCheck size={14} /> trecho encontrado
    </span>
  ) : (
    <span className="checked">
      <IconClose size={14} /> trecho não encontrado
    </span>
  )
}

const PLANNED_HELP = 'O documento descreve o planejado (requisito), não necessariamente o que foi feito. Fica anotado na ficha.'
const source = (item: SheetCondition | SheetSensor) => evidenceLabel({ tipo: 'documento', ...item.evidencia })

export function FichaReview({ sheet, vocabulary, onEdit }: { sheet: DocSheet; vocabulary: Vocabulary; onEdit: (edit: (sheet: DocSheet) => void) => void }) {
  const lists = useMemo(() => options(vocabulary), [vocabulary])
  const waiting = sheetPending(sheet)
  const goal = sheet.objetivo
  const conditions = sheet.condicoes ?? []
  const sensors = sheet.sensores ?? []

  const conditionColumns: EditColumn<SheetCondition>[] = [
    { key: 'confirmado', label: 'Entra na ficha', kind: 'check' },
    { key: 'conferido', label: 'Conferência', kind: 'static', render: (c) => <Checked found={c.conferido} /> },
    { key: 'evidencia', label: 'De onde saiu', kind: 'static', wide: true, render: source },
    { key: 'atributo', label: 'Atributo', kind: 'select', options: lists.conditionAttributes },
    { key: 'valor', label: 'Como o documento diz', kind: 'text', wide: true },
    { key: 'minimo', label: 'Mínimo', kind: 'number' },
    { key: 'maximo', label: 'Máximo', kind: 'number' },
    { key: 'unidade', label: 'Unidade', kind: 'text' },
    { key: 'planejado', label: 'Só o plano', kind: 'check', help: PLANNED_HELP },
  ]
  const sensorColumns: EditColumn<SheetSensor>[] = [
    { key: 'confirmado', label: 'Entra na ficha', kind: 'check' },
    { key: 'conferido', label: 'Conferência', kind: 'static', render: (s) => <Checked found={s.conferido} /> },
    { key: 'evidencia', label: 'De onde saiu', kind: 'static', wide: true, render: source },
    { key: 'nome', label: 'Sensor', kind: 'text' },
    { key: 'mede', label: 'O que mede', kind: 'text', wide: true },
    { key: 'grandeza', label: 'Grandeza', kind: 'select', options: lists.quantities },
    { key: 'planejado', label: 'Só o plano', kind: 'check', help: PLANNED_HELP },
  ]

  return (
    <div className="review">
      <Caption>
        Lida dos documentos. O código procurou cada trecho citado na página indicada: os encontrados já vêm marcados em <em>Entra na ficha</em>; os não encontrados só entram se você marcar. Só o marcado é gravado.
        {waiting > 0 && <strong> {waiting} desmarcado(s): não vão ser gravados.</strong>}
      </Caption>

      {goal && (
        <div className="review__goal">
          <label className="field">
            <span className="field__label">Objetivo experimental</span>
            <textarea
              className="input input--area"
              rows={3}
              value={goal.texto ?? ''}
              onChange={(e) =>
                onEdit((draft) => {
                  if (draft.objetivo) draft.objetivo.texto = e.target.value
                })
              }
            />
          </label>
          <p className="review__source">
            <Checked found={goal.conferido} />
            <span>{evidenceLabel({ tipo: 'documento', ...goal.evidencia })}</span>
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={!!goal.confirmado}
              onChange={(e) =>
                onEdit((draft) => {
                  if (draft.objetivo) draft.objetivo.confirmado = e.target.checked
                })
              }
            />
            <span>O objetivo entra na ficha</span>
          </label>
        </div>
      )}

      <div className="review__block">
        <h3 className="label">Condições escritas nos documentos ({conditions.length})</h3>
        <EditTable
          label="Condições escritas nos documentos"
          rows={conditions}
          columns={conditionColumns}
          flagged={(c) => !c.confirmado}
          empty="Nenhuma condição lida dos documentos."
          onChange={(index, patch) =>
            onEdit((draft) => {
              Object.assign((draft.condicoes ??= [])[index]!, patch)
            })
          }
          onAdd={() =>
            onEdit((draft) => {
              ;(draft.condicoes ??= []).push({ confirmado: false, evidencia: {} })
            })
          }
          onRemove={(index) =>
            onEdit((draft) => {
              draft.condicoes?.splice(index, 1)
            })
          }
        />
      </div>

      <div className="review__block">
        <h3 className="label">Sensores e medições ({sensors.length})</h3>
        <EditTable
          label="Sensores e medições"
          rows={sensors}
          columns={sensorColumns}
          flagged={(s) => !s.confirmado}
          empty="Nenhum sensor lido dos documentos."
          onChange={(index, patch) =>
            onEdit((draft) => {
              Object.assign((draft.sensores ??= [])[index]!, patch)
            })
          }
          onAdd={() =>
            onEdit((draft) => {
              ;(draft.sensores ??= []).push({ confirmado: false, evidencia: {} })
            })
          }
          onRemove={(index) =>
            onEdit((draft) => {
              draft.sensores?.splice(index, 1)
            })
          }
        />
      </div>
    </div>
  )
}
