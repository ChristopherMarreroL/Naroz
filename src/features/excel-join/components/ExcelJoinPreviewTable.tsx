import type { ExcelFileData, ExcelSheetData } from '../../excel/lib/excelColumnBuilder'
import { useLocale } from '../../../i18n/LocaleProvider'

const PREVIEW_ROW_LIMIT = 100

interface ExcelJoinPreviewTableProps {
  file: ExcelFileData
  sheet: ExcelSheetData
  keyColumnIndex?: number | null
  selectedColumnIndexes?: number[]
  onToggleColumn?: (columnIndex: number) => void
}

function formatCellValue(value: unknown) {
  if (value instanceof Date) {
    return value.toLocaleDateString()
  }

  if (value === null || value === undefined || value === '') {
    return ''
  }

  return String(value)
}

export function ExcelJoinPreviewTable({
  file,
  sheet,
  keyColumnIndex = null,
  selectedColumnIndexes = [],
  onToggleColumn,
}: ExcelJoinPreviewTableProps) {
  const { t } = useLocale()
  const selectedColumns = new Set(selectedColumnIndexes)
  const previewRows = sheet.rows.slice(0, PREVIEW_ROW_LIMIT)

  if (sheet.headers.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        {t('emptySheetNoSelectableData')}
      </div>
    )
  }

  return (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="max-h-[560px] w-full max-w-full overflow-auto overscroll-contain">
        <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-50">
            <tr>
              {sheet.headers.map((header, columnIndex) => {
                const isKey = columnIndex === keyColumnIndex
                const isSelected = selectedColumns.has(columnIndex)

                return (
                  <th key={`${file.id}-${sheet.name}-${columnIndex}`} className="min-w-48 border-r border-white/10 px-3 py-3 align-top last:border-r-0">
                    <div className="flex items-start gap-2">
                      {onToggleColumn ? (
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                          checked={isSelected}
                          onChange={() => onToggleColumn(columnIndex)}
                        />
                      ) : null}
                      <div className="min-w-0">
                        <span className="break-words text-xs font-semibold uppercase tracking-[0.12em]">{header}</span>
                        {isKey ? <span className="mt-1 block text-[10px] font-semibold uppercase text-emerald-300">{t('keyColumn')}</span> : null}
                      </div>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr key={`${file.id}-${sheet.name}-row-${rowIndex}`} className="odd:bg-white even:bg-slate-50">
                {sheet.headers.map((_, columnIndex) => (
                  <td
                    key={`${file.id}-${sheet.name}-${rowIndex}-${columnIndex}`}
                    className={`min-w-48 max-w-72 border-r border-b border-slate-100 px-3 py-2 last:border-r-0 ${columnIndex === keyColumnIndex ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'}`}
                  >
                    <span className="line-clamp-3 break-words">{formatCellValue(row[columnIndex])}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
