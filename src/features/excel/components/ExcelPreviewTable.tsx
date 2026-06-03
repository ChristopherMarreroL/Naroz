import { EXCEL_PREVIEW_ROW_LIMIT, type ExcelFileData, type ExcelSheetData, type SelectedExcelColumn } from '../lib/excelColumnBuilder'
import { useLocale } from '../../../i18n/LocaleProvider'

interface ExcelPreviewTableProps {
  file: ExcelFileData
  sheet: ExcelSheetData
  selectedColumns: SelectedExcelColumn[]
  onToggleColumn: (columnIndex: number) => void
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

export function ExcelPreviewTable({ file, sheet, selectedColumns, onToggleColumn }: ExcelPreviewTableProps) {
  const { t } = useLocale()
  const previewRows = sheet.rows.slice(0, EXCEL_PREVIEW_ROW_LIMIT)
  const selectedIds = new Set(selectedColumns.map((column) => column.id))

  if (sheet.headers.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        {t('emptySheetNoSelectableData')}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-50">
            <tr>
              {sheet.headers.map((header, columnIndex) => {
                const columnId = `${file.id}-${sheet.name}-${columnIndex}`
                const isSelected = selectedIds.has(columnId)

                return (
                  <th key={columnId} className="min-w-44 border-r border-white/10 px-3 py-3 align-top last:border-r-0">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                        checked={isSelected}
                        onChange={() => onToggleColumn(columnIndex)}
                      />
                      <span className="break-words text-xs font-semibold uppercase tracking-[0.12em]">{header}</span>
                    </label>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr key={`${file.id}-${sheet.name}-row-${rowIndex}`} className="odd:bg-white even:bg-slate-50">
                {sheet.headers.map((_, columnIndex) => (
                  <td key={`${file.id}-${sheet.name}-${rowIndex}-${columnIndex}`} className="max-w-72 border-r border-b border-slate-100 px-3 py-2 text-slate-700 last:border-r-0">
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
