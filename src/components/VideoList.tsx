import { formatDuration } from '../lib/format'
import type { VideoItem } from '../types/video'
import { VideoListItem } from './VideoListItem'

interface VideoListProps {
  videos: VideoItem[]
  totalDuration: number
  disabled?: boolean
  onMove: (fromIndex: number, toIndex: number) => void
  onRemove: (videoId: string) => void
  onClear: () => void
}

export function VideoList({
  videos,
  totalDuration,
  disabled = false,
  onMove,
  onRemove,
  onClear,
}: VideoListProps) {
  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-950">Lista de videos</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            El orden final sera exactamente el que aparece aqui.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="badge">{videos.length} archivo(s)</span>
          <span className="badge">Duracion estimada: {formatDuration(totalDuration)}</span>
          <button type="button" className="btn-secondary" onClick={onClear} disabled={disabled || videos.length === 0}>
            Limpiar lista
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {videos.map((video, index) => (
          <VideoListItem
            key={video.id}
            video={video}
            index={index}
            total={videos.length}
            disabled={disabled}
            onMoveUp={() => onMove(index, index - 1)}
            onMoveDown={() => onMove(index, index + 1)}
            onRemove={() => onRemove(video.id)}
          />
        ))}
      </div>
    </section>
  )
}
