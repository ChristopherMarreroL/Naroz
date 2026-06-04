import { useRef, useState, type PointerEvent } from 'react'

import { formatBytes } from '../../../lib/format'
import { useLocale } from '../../../i18n/LocaleProvider'
import type { DocumentItem } from '../lib/files'

interface DocumentQueueProps {
  items: DocumentItem[]
  emptyMessage: string
  onReorder: (sourceId: string, targetId: string) => void
  onRemove: (id: string) => void
  disabled?: boolean
}

export function DocumentQueue({ items, emptyMessage, onReorder, onRemove, disabled = false }: DocumentQueueProps) {
  const { t } = useLocale()
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const finishDragging = () => {
    draggingIdRef.current = null
    setDraggingId(null)
  }

  const handleDragStart = (event: PointerEvent<HTMLButtonElement>, itemId: string) => {
    if (disabled) {
      return
    }

    event.preventDefault()
    draggingIdRef.current = itemId
    setDraggingId(itemId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDragMove = (event: PointerEvent<HTMLButtonElement>) => {
    const sourceId = draggingIdRef.current
    if (!sourceId) {
      return
    }

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-document-item-id]')
    const targetId = target?.dataset.documentItemId
    if (!targetId || targetId === sourceId) {
      return
    }

    onReorder(sourceId, targetId)
  }

  if (items.length === 0) {
    return <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{emptyMessage}</div>
  }

  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <article
          key={item.id}
          data-document-item-id={item.id}
          className={`panel-subtle grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 transition ${draggingId === item.id ? 'border-slate-900 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.75)]' : ''}`}
        >
          <button
            type="button"
            className="flex h-10 w-8 touch-none cursor-grab items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:text-slate-300"
            aria-label={t('reorderItem')}
            onPointerDown={(event) => handleDragStart(event, item.id)}
            onPointerMove={handleDragMove}
            onPointerUp={finishDragging}
            onPointerCancel={finishDragging}
            disabled={disabled}
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{index + 1}</p>
            <p className="mt-2 break-words text-sm font-semibold text-slate-900">{item.name}</p>
            <p className="mt-1 text-xs text-slate-500">{item.extension.toUpperCase()} · {formatBytes(item.size)}</p>
          </div>

          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600 transition hover:border-rose-200 hover:bg-rose-100 disabled:cursor-not-allowed disabled:text-rose-300"
            onClick={() => onRemove(item.id)}
            disabled={disabled}
            aria-label={t('remove')}
            title={t('remove')}
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
              <path d="M9 4h6m-8 4h10m-9 0 .7 11.2A2 2 0 0 0 10.7 21h2.6a2 2 0 0 0 2-1.8L16 8M10 11v6m4-6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </article>
      ))}
    </div>
  )
}
