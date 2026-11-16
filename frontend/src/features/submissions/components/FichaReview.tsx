/** Revisão da ficha proposta a partir dos documentos (no envio de um estudo e em "Adicionar documentos"). */

import { useMemo } from 'react'
import type { DocSheet, SheetCondition, SheetSensor, Vocabulary } from '@/shared/api/types'
import { IconCheck, IconClose } from '@/shared/icons/index'
import { t } from '@/shared/lib/i18n'
import { options, sheetPending } from '@/features/submissions/review'
import { evidenceLabel } from '@/features/studies/studies'
import { type EditColumn, EditTable } from '@/features/submissions/components/EditTable'
import { Caption } from '@/shared/ui/ui'

function Checked({ found }: { found: boolean | undefined }) {
  return found ? (
    <span className="checked" data-found>
      <IconCheck size={14} /> {t('excerpt found', 'trecho encontrado')}
    </span>
  ) : (
    <span className="checked">
      <IconClose size={14} /> {t('excerpt not found', 'trecho não encontrado')}
    </span>
  )
}

const PLANNED_HELP = t(
  'The document describes what was planned (requirement), not necessarily what was done. It is noted on the study sheet.',
  'O documento descreve o planejado (requisito), não necessariamente o que foi feito. Fica anotado na ficha.',
)
const source = (item: SheetCondition | SheetSensor) => evidenceLabel({ tipo: 'documento', ...item.evidencia })

export function FichaReview({ sheet, vocabulary, onEdit }: { sheet: DocSheet; vocabulary: Vocabulary; onEdit: (edit: (sheet: DocSheet) => void) => void }) {
  const lists = useMemo(() => options(vocabulary), [vocabulary])
  const waiting = sheetPending(sheet)
  const goal = sheet.objetivo
  const conditions = sheet.condicoes ?? []
  const sensors = sheet.sensores ?? []

  const conditionColumns: EditColumn<SheetCondition>[] = [
    { key: 'confirmado', label: t('Goes on the sheet', 'Entra na ficha'), kind: 'check' },
    { key: 'conferido', label: t('Check', 'Conferência'), kind: 'static', render: (c) => <Checked found={c.conferido} /> },
    { key: 'evidencia', label: t('Where it came from', 'De onde saiu'), kind: 'static', wide: true, render: source },
    { key: 'atributo', label: t('Attribute', 'Atributo'), kind: 'select', options: lists.conditionAttributes },
    { key: 'valor', label: t('As the document says', 'Como o documento diz'), kind: 'text', wide: true },
    { key: 'minimo', label: t('Minimum', 'Mínimo'), kind: 'number' },
    { key: 'maximo', label: t('Maximum', 'Máximo'), kind: 'number' },
    { key: 'unidade', label: t('Unit', 'Unidade'), kind: 'text' },
    { key: 'planejado', label: t('Plan only', 'Só o plano'), kind: 'check', help: PLANNED_HELP },
  ]
  const sensorColumns: EditColumn<SheetSensor>[] = [
    { key: 'confirmado', label: t('Goes on the sheet', 'Entra na ficha'), kind: 'check' },
    { key: 'conferido', label: t('Check', 'Conferência'), kind: 'static', render: (s) => <Checked found={s.conferido} /> },
    { key: 'evidencia', label: t('Where it came from', 'De onde saiu'), kind: 'static', wide: true, render: source },
    { key: 'nome', label: 'Sensor', kind: 'text' },
    { key: 'mede', label: t('What it measures', 'O que mede'), kind: 'text', wide: true },
    { key: 'grandeza', label: t('Quantity', 'Grandeza'), kind: 'select', options: lists.quantities },
    { key: 'planejado', label: t('Plan only', 'Só o plano'), kind: 'check', help: PLANNED_HELP },
  ]

  return (
    <div className="review">
      <Caption>
        {t(
          <>
            Read from the documents. The code looked for each quoted excerpt on the page indicated: the ones found come already checked under <em>Goes on the sheet</em>; the ones not found only go in if you check them. Only what
            is checked is saved.
          </>,
          <>
            Lida dos documentos. O código procurou cada trecho citado na página indicada: os encontrados já vêm marcados em <em>Entra na ficha</em>; os não encontrados só entram se você marcar. Só o marcado é gravado.
          </>,
        )}
        {waiting > 0 && <strong> {t(`${waiting} unchecked: will not be saved.`, `${waiting} desmarcado(s): não vão ser gravados.`)}</strong>}
      </Caption>

      {goal && (
        <div className="review__goal">
          <label className="field">
            <span className="field__label">{t('Experimental objective', 'Objetivo experimental')}</span>
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
            <span>{t('The objective goes on the sheet', 'O objetivo entra na ficha')}</span>
          </label>
        </div>
      )}

      <div className="review__block">
        <h3 className="label">{t(`Conditions written in the documents (${conditions.length})`, `Condições escritas nos documentos (${conditions.length})`)}</h3>
        <EditTable
          label={t('Conditions written in the documents', 'Condições escritas nos documentos')}
          rows={conditions}
          columns={conditionColumns}
          flagged={(c) => !c.confirmado}
          empty={t('No condition read from the documents.', 'Nenhuma condição lida dos documentos.')}
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
        <h3 className="label">{t(`Sensors and measurements (${sensors.length})`, `Sensores e medições (${sensors.length})`)}</h3>
        <EditTable
          label={t('Sensors and measurements', 'Sensores e medições')}
          rows={sensors}
          columns={sensorColumns}
          flagged={(s) => !s.confirmado}
          empty={t('No sensor read from the documents.', 'Nenhum sensor lido dos documentos.')}
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
