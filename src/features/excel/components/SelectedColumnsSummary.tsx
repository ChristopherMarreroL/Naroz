import type { SelectedExcelColumn } from '../lib/excelColumnBuilder'
import { useLocale } from '../../../i18n/LocaleProvider'

interface SelectedColumnsSummaryProps {
  selectedColumns: SelectedExcelColumn[]
  isGenerating: boolean
  onRemove: (columnId: string) => void
  onMove: (columnId: string, direction: 'up' | 'down') => void
  onClear: () => void
  onGenerate: () => void
}

export function SelectedColumnsSummary({
  selectedColumns,
  isGenerating,
  onRemove,
  onMove,
  onClear,
  onGenerate,
}: SelectedColumnsSummaryProps) {
  const { t } = useLocale()

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-950">{t('selectedColumnsTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('selectedColumnsDesc')}</p>
        </div>
        <span className="badge">{selectedColumns.length} {t('columns')}</span>
      </div>

      <div className="mt-6 grid gap-3">
        {selectedColumns.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            {t('selectedColumnsEmpty')}
          </div>
        ) : (
          selectedColumns.map((column, index) => (
            <article key={column.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-950">{index + 1}. {column.header}</p>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-500">{column.fileName} · {column.sheetName}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => onMove(column.id, 'up')} disabled={index === 0 || isGenerating}>{t('moveUp')}</button>
                  <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => onMove(column.id, 'down')} disabled={index === selectedColumns.length - 1 || isGenerating}>{t('moveDown')}</button>
                  <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => onRemove(column.id)} disabled={isGenerating}>{t('remove')}</button>
                </div>
              </div>
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
