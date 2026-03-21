import { formatBytes, formatDuration, formatResolution } from '../lib/format'
import type { VideoItem } from '../types/video'

interface VideoListItemProps {
  video: VideoItem
  index: number
  total: number
  disabled?: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

export function VideoListItem({
  video,
  index,
  total,
  disabled = false,
  onMoveUp,
  onMoveDown,
  onRemove,
}: VideoListItemProps) {
  return (
    <article className="soft-border grid gap-4 rounded-3xl bg-white p-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:p-5">
      <div className="relative overflow-hidden rounded-2xl bg-slate-100">
        <video
          src={video.previewUrl}
          className="aspect-video h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
        <div className="absolute left-3 top-3 rounded-full bg-slate-950/85 px-2.5 py-1 text-xs font-semibold text-white">
          #{index + 1}
        </div>
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
            <button type="button" className="btn-secondary" onClick={onMoveUp} disabled={disabled || index === 0}>
              Subir
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onMoveDown}
              disabled={disabled || index === total - 1}
            >
              Bajar
            </button>
            <button type="button" className="btn-secondary" onClick={onRemove} disabled={disabled}>
              Eliminar
            </button>
          </div>
        </div>

        {video.warnings.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {video.warnings.join(' ')}
          </div>
        ) : null}
      </div>
    </article>
  )
}
