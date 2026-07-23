import { useRef, useState, type PointerEvent } from 'react'

import { BatchFileCard, type BatchFileStatus } from '../../../components/shared/BatchFileCard'
import { formatBytes } from '../../../lib/format'
import { useLocale } from '../../../i18n/LocaleProvider'
import type { DocumentItem } from '../lib/files'

interface DocumentQueueProps {
  items: DocumentItem[]
  emptyMessage: string
  onReorder: (sourceId: string, targetId: string) => void
  onRemove: (id: string) => void
  disabled?: boolean
  status?: BatchFileStatus
  statusLabel?: string
  progress?: number
}

export function DocumentQueue({ items, emptyMessage, onReorder, onRemove, disabled = false, status = 'queued', statusLabel, progress = 0 }: DocumentQueueProps) {
  const { t } = useLocale()
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const finishDragging = () => {
    draggingIdRef.current = null
    setDraggingId(null)
  }

  const handleDragStart = (event: PointerEvent<HTMLButtonElement>, itemId: string) => {
    if (disabled) return
    event.preventDefault()
    draggingIdRef.current = itemId
    setDraggingId(itemId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDragMove = (event: PointerEvent<HTMLButtonElement>) => {
    const sourceId = draggingIdRef.current
    if (!sourceId) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-document-item-id]')
    const targetId = target?.dataset.documentItemId
    if (!targetId || targetId === sourceId) return
    onReorder(sourceId, targetId)
  }

  if (items.length === 0) {
    return <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{emptyMessage}</div>
  }

  const resolvedStatusLabel = statusLabel ?? (status === 'processing'
    ? t('officePdfStatusConverting')
    : status === 'success'
      ? t('officePdfStatusSuccess')
      : status === 'error'
        ? t('officePdfStatusError')
        : t('officePdfStatusQueued'))

  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <BatchFileCard
          key={item.id}
          dataAttribute={{ 'data-document-item-id': item.id }}
          index={index}
          name={item.name}
          meta={`${item.extension.toUpperCase()} · ${formatBytes(item.size)}`}
          status={status}
          statusLabel={resolvedStatusLabel}
          progress={progress}
          selected={draggingId === item.id}
          disabled={disabled}
          onRemove={() => onRemove(item.id)}
          removeLabel={t('remove')}
          leading={
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 touch-none cursor-grab items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition hover:bg-blue-100 active:cursor-grabbing disabled:cursor-not-allowed disabled:text-blue-300"
              aria-label={t('reorderItem')}
              onPointerDown={(event) => handleDragStart(event, item.id)}
              onPointerMove={handleDragMove}
              onPointerUp={finishDragging}
              onPointerCancel={finishDragging}
              disabled={disabled}
            >
              <span aria-hidden="true" className="grid grid-cols-2 gap-0.5">
                {Array.from({ length: 6 }, (_, dot) => <span key={dot} className="h-1 w-1 rounded-full bg-current" />)}
              </span>
            </button>
          }
        />
      ))}
    </div>
  )
}
