import { formatBytes } from '../../../lib/format'
import { useLocale } from '../../../i18n/LocaleProvider'
import type { DocumentItem } from '../lib/files'

interface DocumentQueueProps {
  items: DocumentItem[]
  emptyMessage: string
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
  onRemove: (id: string) => void
  disabled?: boolean
}

export function DocumentQueue({ items, emptyMessage, onMoveUp, onMoveDown, onRemove, disabled = false }: DocumentQueueProps) {
  const { t } = useLocale()

  if (items.length === 0) {
    return <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{emptyMessage}</div>
  }

  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <article key={item.id} className="panel-subtle flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{index + 1}</p>
            <p className="mt-2 break-words text-sm font-semibold text-slate-900">{item.name}</p>
            <p className="mt-1 text-xs text-slate-500">{item.extension.toUpperCase()} · {formatBytes(item.size)}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => onMoveUp(index)} disabled={disabled || index === 0}>{t('moveUp')}</button>
            <button type="button" className="btn-secondary" onClick={() => onMoveDown(index)} disabled={disabled || index === items.length - 1}>{t('moveDown')}</button>
            <button type="button" className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => onRemove(item.id)} disabled={disabled}>{t('remove')}</button>
          </div>
        </article>
      ))}
    </div>
  )
}
