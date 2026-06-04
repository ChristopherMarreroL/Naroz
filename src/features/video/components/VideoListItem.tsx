import type { PointerEvent } from 'react'

import { formatBytes, formatDuration, formatResolution } from '../../../lib/format'
import { useLocale } from '../../../i18n/LocaleProvider'
import type { VideoItem } from '../../../types/video'

interface VideoListItemProps {
  video: VideoItem
  index: number
  disabled?: boolean
  isDragging?: boolean
  onDragStart: (event: PointerEvent<HTMLButtonElement>) => void
  onDragMove: (event: PointerEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
  onRemove: () => void
}

export function VideoListItem({ video, index, disabled = false, isDragging = false, onDragStart, onDragMove, onDragEnd, onRemove }: VideoListItemProps) {
  const { t } = useLocale()

  return (
    <article data-video-item-id={video.id} className={`soft-border grid gap-4 rounded-3xl bg-white p-4 transition sm:grid-cols-[auto_160px_minmax(0,1fr)] sm:p-5 ${isDragging ? 'border-slate-900 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.75)]' : ''}`}>
      <button
        type="button"
        className="flex h-10 w-8 touch-none cursor-grab items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:text-slate-300 sm:mt-10"
        aria-label={t('reorderItem')}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
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

      <div className="relative overflow-hidden rounded-2xl bg-slate-100">
        <video src={video.previewUrl} className="aspect-video h-full w-full object-cover" muted playsInline preload="metadata" />
        <div className="absolute left-3 top-3 rounded-full bg-slate-950/85 px-2.5 py-1 text-xs font-semibold text-white">#{index + 1}</div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-950">{video.name}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="badge">{formatBytes(video.size)}</span>
              <span className="badge">{formatDuration(video.duration)}</span>
              <span className="badge">{formatResolution(video.width, video.height)}</span>
              <span className="badge">{video.extension.toUpperCase()}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-danger" onClick={onRemove} disabled={disabled}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                <path d="M9 3.75A2.25 2.25 0 0 0 6.75 6H4.5a.75.75 0 0 0 0 1.5h.56l.83 10.37A2.25 2.25 0 0 0 8.13 20h7.74a2.25 2.25 0 0 0 2.24-2.13l.83-10.37h.56a.75.75 0 0 0 0-1.5h-2.25A2.25 2.25 0 0 0 15 3.75H9Zm6.75 2.25H8.25A.75.75 0 0 1 9 5.25h6a.75.75 0 0 1 .75.75ZM9.75 10.5a.75.75 0 0 0-1.5 0v5.25a.75.75 0 0 0 1.5 0V10.5Zm5.25-.75a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Zm-3.75.75a.75.75 0 0 0-1.5 0v5.25a.75.75 0 0 0 1.5 0V10.5Z" />
              </svg>
              {t('remove')}
            </button>
          </div>
        </div>

        {video.warnings.length > 0 ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{video.warnings.join(' ')}</div> : null}
      </div>
    </article>
  )
}
