import { useRef, useState, type PointerEvent } from 'react'

import type { SelectedExcelColumn } from '../lib/excelColumnBuilder'
import { useLocale } from '../../../i18n/LocaleProvider'

interface SelectedColumnsSummaryProps {
  selectedColumns: SelectedExcelColumn[]
  isGenerating: boolean
  onRemove: (columnId: string) => void
  onReorder: (sourceColumnId: string, targetColumnId: string) => void
  onClear: () => void
  onGenerate: () => void
}

export function SelectedColumnsSummary({
  selectedColumns,
  isGenerating,
  onRemove,
  onReorder,
  onClear,
  onGenerate,
}: SelectedColumnsSummaryProps) {
  const { t } = useLocale()
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const finishDragging = () => {
    draggingIdRef.current = null
    setDraggingId(null)
  }

  const handleDragStart = (event: PointerEvent<HTMLButtonElement>, columnId: string) => {
    if (isGenerating) {
      return
    }

    event.preventDefault()
    draggingIdRef.current = columnId
    setDraggingId(columnId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDragMove = (event: PointerEvent<HTMLButtonElement>) => {
    const sourceColumnId = draggingIdRef.current
    if (!sourceColumnId) {
      return
    }

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-selected-column-id]')
    const targetColumnId = target?.dataset.selectedColumnId
    if (targetColumnId && targetColumnId !== sourceColumnId) {
      onReorder(sourceColumnId, targetColumnId)
    }
  }

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-950">{t('selectedColumnsTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('selectedColumnsDesc')}</p>
        </div>
        <span className="badge">{selectedColumns.length} {t('columns')}</span>
      </div>

      <div className="mt-6 grid max-h-[22rem] gap-3 overflow-y-auto pr-1 min-[1700px]:max-h-[28rem]">
        {selectedColumns.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            {t('selectedColumnsEmpty')}
          </div>
        ) : (
          selectedColumns.map((column, index) => (
            <article
              key={column.id}
              data-selected-column-id={column.id}
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border bg-white p-4 transition ${draggingId === column.id ? 'border-slate-900 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.75)]' : 'border-slate-200'}`}
            >
              <button
                type="button"
                className="mt-0.5 flex h-9 w-7 touch-none cursor-grab items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:text-slate-300"
                aria-label={t('reorderColumn')}
                onPointerDown={(event) => handleDragStart(event, column.id)}
                onPointerMove={handleDragMove}
                onPointerUp={finishDragging}
                onPointerCancel={finishDragging}
                disabled={isGenerating}
              >
                <span aria-hidden="true" className="grid grid-cols-2 gap-0.5">
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                </span>
              </button>

              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-slate-950">{index + 1}. {column.header}</p>
                <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-500">{column.fileName}</p>
                <span className="mt-2 inline-flex max-w-full rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  <span className="truncate">{t('sheet')}: {column.sheetName}</span>
                </span>
              </div>

              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600 transition hover:border-rose-200 hover:bg-rose-100 disabled:cursor-not-allowed disabled:text-rose-300"
                onClick={() => onRemove(column.id)}
                disabled={isGenerating}
                aria-label={t('remove')}
                title={t('remove')}
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path d="M9 4h6m-8 4h10m-9 0 .7 11.2A2 2 0 0 0 10.7 21h2.6a2 2 0 0 0 2-1.8L16 8M10 11v6m4-6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </article>
          ))
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={onGenerate} disabled={isGenerating || selectedColumns.length === 0}>
          {isGenerating ? t('generatingExcel') : t('generateExcel')}
        </button>
        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={onClear} disabled={isGenerating || selectedColumns.length === 0}>
          {t('clearSelection')}
        </button>
      </div>
    </section>
  )
}
