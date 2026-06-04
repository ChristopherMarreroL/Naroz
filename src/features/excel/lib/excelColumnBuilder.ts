import * as XLSX from 'xlsx'

export type ExcelCellValue = string | number | boolean | Date | null

export interface ExcelSheetData {
  name: string
  headers: string[]
  rows: ExcelCellValue[][]
}

export interface ExcelFileData {
  id: string
  name: string
  size: number
  extension: 'xlsx' | 'xls' | 'csv'
  sheets: ExcelSheetData[]
  selectedSheetName: string
}

export interface SelectedExcelColumn {
  id: string
  fileId: string
  fileName: string
  sheetName: string
  columnIndex: number
  header: string
}

const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.csv']
export const EXCEL_PREVIEW_ROW_LIMIT = 100

export function isSupportedExcelFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

function getExcelExtension(file: File): ExcelFileData['extension'] {
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.csv')) {
    return 'csv'
  }

  return lowerName.endsWith('.xls') ? 'xls' : 'xlsx'
}

function createFileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`
}

function toCellValue(value: unknown): ExcelCellValue {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (value === null || value === undefined) {
    return null
  }

  return String(value)
}

function normalizeRows(rawRows: unknown[][]) {
  return rawRows.map((row) => row.map(toCellValue))
}

function normalizeHeader(value: ExcelCellValue, index: number, used: Map<string, number>) {
  const baseHeader = value === null || value === '' ? `Columna ${index + 1}` : String(value).trim()
  const header = baseHeader || `Columna ${index + 1}`
  const count = used.get(header) ?? 0
  used.set(header, count + 1)

  return count > 0 ? `${header} ${count + 1}` : header
}

function parseSheet(workbook: XLSX.WorkBook, sheetName: string): ExcelSheetData {
  const worksheet = workbook.Sheets[sheetName]
  const rows = normalizeRows(
    XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: null,
      raw: false,
    }),
  )

  if (rows.length === 0) {
    return { name: sheetName, headers: [], rows: [] }
  }

  const maxColumnCount = Math.max(...rows.map((row) => row.length))
  const headerSource = rows[0] ?? []
  const usedHeaders = new Map<string, number>()
  const headers = Array.from({ length: maxColumnCount }, (_, index) => normalizeHeader(headerSource[index] ?? null, index, usedHeaders))

  return {
    name: sheetName,
    headers,
    rows: rows.slice(1),
  }
}

export async function readExcelFile(file: File): Promise<ExcelFileData> {
  const extension = getExcelExtension(file)
  const workbook =
    extension === 'csv'
      ? XLSX.read(await file.text(), { type: 'string', cellDates: true })
      : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })

  const sheets = workbook.SheetNames.map((sheetName) => parseSheet(workbook, sheetName))

  if (sheets.length === 0) {
    throw new Error('EMPTY_WORKBOOK')
  }

  return {
    id: createFileId(file),
    name: file.name,
    size: file.size,
    extension,
    sheets,
    selectedSheetName: sheets[0].name,
  }
}

export function getSelectedSheet(file: ExcelFileData) {
  return file.sheets.find((sheet) => sheet.name === file.selectedSheetName) ?? file.sheets[0]
}

function getColumnValue(sheet: ExcelSheetData, rowIndex: number, columnIndex: number) {
  return sheet.rows[rowIndex]?.[columnIndex] ?? null
}

function createUniqueHeaders(selectedColumns: SelectedExcelColumn[]) {
  const used = new Map<string, number>()

  return selectedColumns.map((column) => {
    const baseHeader = column.header || `Columna ${column.columnIndex + 1}`
    const count = used.get(baseHeader) ?? 0
    used.set(baseHeader, count + 1)

    if (count === 0) {
      return baseHeader
    }

    const sourceName = column.fileName.replace(/\.[^.]+$/, '') || `archivo-${count + 1}`
    const candidate = `${baseHeader} (${sourceName})`
    const candidateCount = used.get(candidate) ?? 0
    used.set(candidate, candidateCount + 1)

    return candidateCount === 0 ? candidate : `${candidate} ${candidateCount + 1}`
  })
}

export function buildSelectedColumnsWorkbook(files: ExcelFileData[], selectedColumns: SelectedExcelColumn[]) {
  if (selectedColumns.length === 0) {
    throw new Error('NO_COLUMNS_SELECTED')
  }

  const headers = createUniqueHeaders(selectedColumns)
  const maxRows = Math.max(
    0,
    ...selectedColumns.map((column) => {
      const file = files.find((item) => item.id === column.fileId)
      const sheet = file?.sheets.find((item) => item.name === column.sheetName)
      return sheet?.rows.length ?? 0
    }),
  )

  const outputRows = Array.from({ length: maxRows }, (_, rowIndex) =>
    selectedColumns.map((column) => {
      const file = files.find((item) => item.id === column.fileId)
      const sheet = file?.sheets.find((item) => item.name === column.sheetName)
      return sheet ? getColumnValue(sheet, rowIndex, column.columnIndex) : null
    }),
  )

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...outputRows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Columnas')
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const bytes = output instanceof ArrayBuffer ? output : new Uint8Array(output).buffer

  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function createColumnSelection(file: ExcelFileData, sheet: ExcelSheetData, columnIndex: number): SelectedExcelColumn {
  return {
    id: `${file.id}-${sheet.name}-${columnIndex}`,
    fileId: file.id,
    fileName: file.name,
    sheetName: sheet.name,
    columnIndex,
    header: sheet.headers[columnIndex] ?? `Columna ${columnIndex + 1}`,
  }
}
