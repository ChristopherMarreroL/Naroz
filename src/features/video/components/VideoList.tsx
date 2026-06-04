import { useRef, useState, type PointerEvent } from 'react'

import { formatDuration } from '../../../lib/format'
import { useLocale } from '../../../i18n/LocaleProvider'
import type { VideoItem } from '../../../types/video'
import { VideoListItem } from './VideoListItem'

interface VideoListProps {
  videos: VideoItem[]
  totalDuration: number
  disabled?: boolean
  onReorder: (sourceId: string, targetId: string) => void
  onRemove: (videoId: string) => void
  onClear: () => void
}

export function VideoList({ videos, totalDuration, disabled = false, onReorder, onRemove, onClear }: VideoListProps) {
  const { t } = useLocale()
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const finishDragging = () => {
    draggingIdRef.current = null
    setDraggingId(null)
  }

  const handleDragStart = (event: PointerEvent<HTMLButtonElement>, videoId: string) => {
    if (disabled) {
      return
    }

    event.preventDefault()
    draggingIdRef.current = videoId
    setDraggingId(videoId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDragMove = (event: PointerEvent<HTMLButtonElement>) => {
    const sourceId = draggingIdRef.current
    if (!sourceId) {
      return
    }

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-video-item-id]')
    const targetId = target?.dataset.videoItemId
    if (!targetId || targetId === sourceId) {
      return
    }

    onReorder(sourceId, targetId)
  }

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-950">{t('videoList')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('finalOrderDesc')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="badge">{videos.length} {t('filesCount')}</span>
          <span className="badge">{t('estimatedDuration')}: {formatDuration(totalDuration)}</span>
          <button type="button" className="btn-secondary" onClick={onClear} disabled={disabled || videos.length === 0}>
            {t('clearList')}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {videos.map((video, index) => (
          <VideoListItem
            key={video.id}
            video={video}
            index={index}
            disabled={disabled}
            isDragging={draggingId === video.id}
            onDragStart={(event) => handleDragStart(event, video.id)}
            onDragMove={handleDragMove}
            onDragEnd={finishDragging}
            onRemove={() => onRemove(video.id)}
          />
        ))}
      </div>
    </section>
  )
}
