import * as XLSX from 'xlsx'

import type { ExcelCellValue, ExcelFileData, ExcelSheetData } from '../../excel/lib/excelColumnBuilder'

export interface SecondaryJoinConfig {
  fileId: string
  sheetName: string
  keyColumnIndex: number | null
  selectedColumnIndexes: number[]
}

export interface JoinWarning {
  fileName: string
  message: string
}

export interface BuildJoinWorkbookInput {
  files: ExcelFileData[]
  primaryFileId: string
  primaryKeyColumnIndex: number
  primarySelectedColumnIndexes: number[]
  secondaryConfigs: SecondaryJoinConfig[]
}

export interface BuildJoinWorkbookResult {
  blob: Blob
  warnings: JoinWarning[]
}

function getFileBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}

function getSheetByName(file: ExcelFileData, sheetName: string) {
  return file.sheets.find((sheet) => sheet.name === sheetName) ?? file.sheets[0]
}

export function getSelectedSheet(file: ExcelFileData) {
  return file.sheets.find((sheet) => sheet.name === file.selectedSheetName) ?? file.sheets[0]
}

export function normalizeJoinKey(value: ExcelCellValue | undefined) {
  if (value === null || value === undefined) {
    return ''
  }

  if (value instanceof Date) {
    return value.toISOString().trim()
  }

  return String(value).trim()
}

function getCellValue(sheet: ExcelSheetData, rowIndex: number, columnIndex: number) {
  return sheet.rows[rowIndex]?.[columnIndex] ?? null
}

function createSecondaryHeaders(primaryHeaders: string[], files: ExcelFileData[], secondaryConfigs: SecondaryJoinConfig[]) {
  const usedHeaders = new Map<string, number>()
  primaryHeaders.forEach((header) => usedHeaders.set(header, 1))

  return secondaryConfigs.flatMap((config) => {
    const file = files.find((item) => item.id === config.fileId)
    if (!file) {
      return []
    }

    const sheet = getSheetByName(file, config.sheetName)
    const sourceName = `${getFileBaseName(file.name)} - ${sheet.name}`

    return config.selectedColumnIndexes.map((columnIndex) => {
      const baseHeader = sheet.headers[columnIndex] ?? `Columna ${columnIndex + 1}`
      const hasConflict = usedHeaders.has(baseHeader)
      const candidate = hasConflict ? `${baseHeader} (${sourceName})` : baseHeader
      const count = usedHeaders.get(candidate) ?? 0
      usedHeaders.set(candidate, count + 1)

      return count === 0 ? candidate : `${candidate} ${count + 1}`
    })
  })
}

function createSecondaryLookup(file: ExcelFileData, config: SecondaryJoinConfig) {
  const sheet = getSheetByName(file, config.sheetName)
  const lookup = new Map<string, ExcelCellValue[]>()
  const duplicateKeys = new Set<string>()

  if (config.keyColumnIndex === null) {
    return { lookup, duplicateKeys }
  }

  sheet.rows.forEach((row) => {
    const key = normalizeJoinKey(row[config.keyColumnIndex ?? -1])
    if (!key) {
      return
    }

    if (lookup.has(key)) {
      duplicateKeys.add(key)
      return
    }

    lookup.set(key, row)
  })

  return { lookup, duplicateKeys }
}

function getOutputSecondaryConfig(config: SecondaryJoinConfig) {
  return {
    ...config,
    selectedColumnIndexes: config.selectedColumnIndexes.filter((columnIndex) => columnIndex !== config.keyColumnIndex),
  }
}

export function buildJoinedExcelWorkbook({
  files,
  primaryFileId,
  primaryKeyColumnIndex,
  primarySelectedColumnIndexes,
  secondaryConfigs,
}: BuildJoinWorkbookInput): BuildJoinWorkbookResult {
  const primaryFile = files.find((file) => file.id === primaryFileId)
  if (!primaryFile) {
    throw new Error('PRIMARY_FILE_MISSING')
  }

  const primarySheet = getSelectedSheet(primaryFile)
  const primaryOutputColumnIndexes = primarySelectedColumnIndexes.filter((columnIndex) => columnIndex >= 0 && columnIndex < primarySheet.headers.length)
  const primaryOutputHeaders = primaryOutputColumnIndexes.map((columnIndex) => primarySheet.headers[columnIndex] ?? `Columna ${columnIndex + 1}`)
  const activeSecondaryConfigs = secondaryConfigs
    .filter((config) => config.fileId !== primaryFileId)
    .map(getOutputSecondaryConfig)
    .filter((config) => config.selectedColumnIndexes.length > 0)
  const secondaryHeaders = createSecondaryHeaders(primaryOutputHeaders, files, activeSecondaryConfigs)
  const warnings: JoinWarning[] = []

  const lookups = activeSecondaryConfigs.map((config) => {
    const file = files.find((item) => item.id === config.fileId)
    if (!file || config.keyColumnIndex === null) {
      return { config, file, lookup: new Map<string, ExcelCellValue[]>(), duplicateKeys: new Set<string>() }
    }

    const lookupResult = createSecondaryLookup(file, config)
    if (lookupResult.duplicateKeys.size > 0) {
      warnings.push({
        fileName: file.name,
        message: `${config.sheetName}: Claves duplicadas detectadas: ${Array.from(lookupResult.duplicateKeys).slice(0, 5).join(', ')}`,
      })
    }

    return { config, file, ...lookupResult }
  })

  const outputRows = primarySheet.rows.map((primaryRow, rowIndex) => {
    const primaryKey = normalizeJoinKey(getCellValue(primarySheet, rowIndex, primaryKeyColumnIndex))
    const joinedValues = lookups.flatMap(({ config, file, lookup }) => {
      const sheet = file ? getSheetByName(file, config.sheetName) : null
      const matchingRow = primaryKey ? lookup.get(primaryKey) : undefined

      return config.selectedColumnIndexes.map((columnIndex) => {
        if (!sheet || !matchingRow) {
          return null
        }

        return matchingRow[columnIndex] ?? null
      })
    })

    return [
      ...primaryOutputColumnIndexes.map((columnIndex) => primaryRow[columnIndex] ?? null),
      ...joinedValues,
    ]
  })

  const worksheet = XLSX.utils.aoa_to_sheet([[...primaryOutputHeaders, ...secondaryHeaders], ...outputRows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cruce')
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const bytes = output instanceof ArrayBuffer ? output : new Uint8Array(output).buffer

  return {
    blob: new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    warnings,
  }
}
