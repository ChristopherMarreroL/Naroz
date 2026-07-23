import type { ReactNode } from 'react'

export type BatchFileStatus = 'queued' | 'processing' | 'success' | 'error'

interface BatchFileCardProps {
  index: number
  name: string
  meta: string
  status: BatchFileStatus
  statusLabel: string
  progress?: number
  error?: string | null
  result?: { name: string; meta?: string } | null
  leading?: ReactNode
  actions?: ReactNode
  onDownload?: () => void
  downloadLabel?: string
  onRemove?: () => void
  removeLabel?: string
  disabled?: boolean
  selected?: boolean
  children?: ReactNode
  dataAttribute?: Record<string, string>
}

const statusClasses: Record<BatchFileStatus, string> = {
  queued: 'border-slate-200 bg-slate-50 text-slate-600',
  processing: 'border-blue-200 bg-blue-50 text-blue-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
}

export function BatchFileCard({
  index,
  name,
  meta,
  status,
  statusLabel,
  progress = 0,
  error,
  result,
  leading,
  actions,
  onDownload,
  downloadLabel,
  onRemove,
  removeLabel,
  disabled = false,
  selected = false,
  children,
  dataAttribute,
}: BatchFileCardProps) {
  return (
    <article
      {...dataAttribute}
      className={`rounded-2xl border bg-white p-4 transition ${selected ? 'border-slate-900 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.7)]' : 'border-slate-200'}`}
    >
      <div className="flex items-start gap-3">
        {leading ?? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">
            {index + 1}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900" title={name}>{name}</p>
              <p className="mt-1 text-xs text-slate-500">{meta}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className={`badge ${statusClasses[status]}`}>{statusLabel}</span>
              {actions}
              {onRemove ? (
                <button type="button" className="btn-danger h-9 w-9 px-0" aria-label={removeLabel} title={removeLabel} disabled={disabled} onClick={onRemove}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                    <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>

          {children ? <div className="mt-3">{children}</div> : null}

          {status === 'processing' || progress > 0 ? (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
              </div>
              <p className="mt-1 text-right text-xs font-semibold text-slate-500">{Math.round(progress)}%</p>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-xs leading-5 text-rose-700">{error}</p> : null}

          {result ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <span className="min-w-0 truncate">{result.name}{result.meta ? ` · ${result.meta}` : ''}</span>
              {onDownload ? (
                <button type="button" className="font-bold underline decoration-emerald-300 underline-offset-4" onClick={onDownload}>
                  {downloadLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}
