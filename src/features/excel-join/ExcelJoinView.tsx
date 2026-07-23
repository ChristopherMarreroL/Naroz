import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { useToastNotice } from '../../hooks/useToastNotice'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import {
  getSelectedSheet,
  isSupportedExcelFile,
  readExcelFile,
  type ExcelFileData,
} from '../excel/lib/excelColumnBuilder'
import { ExcelJoinPreviewTable } from './components/ExcelJoinPreviewTable'
import { buildJoinedExcelWorkbook, type SecondaryJoinConfig, type JoinWarning } from './lib/excelJoin'

interface Notice {
  tone: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
}

interface GeneratedJoinResult {
  url: string
  fileName: string
  size: number
}

const OUTPUT_FILE_NAME = 'naroz-excel-cruzado.xlsx'
const LARGE_FILE_SIZE = 8 * 1024 * 1024

function createConfig(fileId: string, sheetName: string): SecondaryJoinConfig {
  return {
    fileId,
    sheetName,
    keyColumnIndex: null,
    selectedColumnIndexes: [],
  }
}

function joinFileNames(fileNames: string[]) {
  return fileNames.join(', ')
}

function normalizeColumnName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getSheetByName(file: ExcelFileData, sheetName: string) {
  return file.sheets.find((sheet) => sheet.name === sheetName) ?? file.sheets[0]
}

function getOutputSelectedSecondaryColumnIndexes(config: SecondaryJoinConfig) {
  return config.selectedColumnIndexes.filter((columnIndex) => columnIndex !== config.keyColumnIndex)
}

function findMatchingColumnIndex(file: ExcelFileData, sheetName: string, primaryHeader: string | null) {
  if (!primaryHeader) {
    return null
  }

  const selectedSheet = getSheetByName(file, sheetName)
  const normalizedPrimaryHeader = normalizeColumnName(primaryHeader)
  const matchingIndex = selectedSheet.headers.findIndex((header) => normalizeColumnName(header) === normalizedPrimaryHeader)
  return matchingIndex >= 0 ? matchingIndex : null
}

function syncSecondaryKeyMatches(
  currentConfigs: SecondaryJoinConfig[],
  currentFiles: ExcelFileData[],
  currentPrimaryFileId: string | null,
  primaryHeader: string | null,
) {
  return currentFiles.flatMap((file) =>
    file.sheets.map((sheet) => {
      const existing = currentConfigs.find((config) => config.fileId === file.id && config.sheetName === sheet.name) ?? createConfig(file.id, sheet.name)
      if (file.id === currentPrimaryFileId) {
        return { ...existing, keyColumnIndex: null }
      }

      return {
        ...existing,
        keyColumnIndex: findMatchingColumnIndex(file, sheet.name, primaryHeader),
      }
    }),
  )
}

export function ExcelJoinView() {
  const { t } = useLocale()
  const [files, setFiles] = useState<ExcelFileData[]>([])
  const [primaryFileId, setPrimaryFileId] = useState<string | null>(null)
  const [primaryKeyColumnIndex, setPrimaryKeyColumnIndex] = useState<number | null>(null)
  const [primarySelectedColumnIndexes, setPrimarySelectedColumnIndexes] = useState<number[] | null>(null)
  const [secondaryConfigs, setSecondaryConfigs] = useState<SecondaryJoinConfig[]>([])
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [notice, setNotice] = useToastNotice<Notice | null>({
    tone: 'info',
    title: t('documentLocalProcessing'),
    message: t('excelJoinCardDesc'),
  })
  const [joinWarnings, setJoinWarnings] = useState<JoinWarning[]>([])
  const [isReading, setIsReading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GeneratedJoinResult | null>(null)

  const primaryFile = useMemo(() => files.find((file) => file.id === primaryFileId) ?? files[0] ?? null, [files, primaryFileId])
  const primarySheet = useMemo(() => (primaryFile ? getSelectedSheet(primaryFile) : null), [primaryFile])
  const secondaryFiles = useMemo(() => files.filter((file) => file.id !== primaryFile?.id), [files, primaryFile])
  const previewFile = useMemo(() => files.find((file) => file.id === previewFileId) ?? primaryFile, [files, previewFileId, primaryFile])
  const previewSheet = useMemo(() => (previewFile ? getSelectedSheet(previewFile) : null), [previewFile])

  const getSecondaryConfig = (fileId: string, sheetName: string) => secondaryConfigs.find((config) => config.fileId === fileId && config.sheetName === sheetName) ?? createConfig(fileId, sheetName)

  const previewConfig = previewFile && previewFile.id !== primaryFile?.id && previewSheet ? getSecondaryConfig(previewFile.id, previewSheet.name) : null
  const previewKeyColumn = previewFile?.id === primaryFile?.id ? primaryKeyColumnIndex : previewConfig?.keyColumnIndex ?? null
  const primaryKeyHeader = primarySheet && primaryKeyColumnIndex !== null ? primarySheet.headers[primaryKeyColumnIndex] : null
  const allPrimaryColumnIndexes = primarySheet?.headers.map((_, index) => index) ?? []
  const selectedPrimaryColumnIndexes = primarySelectedColumnIndexes ?? allPrimaryColumnIndexes

  const selectedSecondaryColumnCount = secondaryConfigs
    .filter((config) => config.fileId !== primaryFile?.id)
    .reduce((count, config) => count + getOutputSelectedSecondaryColumnIndexes(config).length, 0)
  const activeSecondaryConfigs = secondaryConfigs.filter((config) => config.fileId !== primaryFile?.id && getOutputSelectedSecondaryColumnIndexes(config).length > 0)
  const missingSecondaryKeyConfigs = activeSecondaryConfigs.filter((config) => primaryKeyHeader !== null && config.keyColumnIndex === null)
  const currentMissingSecondaryKeyFiles = secondaryFiles.filter((file) => {
    const sheet = getSelectedSheet(file)
    const config = getSecondaryConfig(file.id, sheet.name)
    return primaryKeyHeader !== null && config.keyColumnIndex === null
  })
  const hasEnoughFiles = files.length >= 2
  const hasPrimaryKey = primaryKeyColumnIndex !== null
  const hasSelectedColumns = selectedSecondaryColumnCount > 0
  const hasPrimaryOutputColumns = selectedPrimaryColumnIndexes.length > 0
  const hasRequiredSecondaryKeys = missingSecondaryKeyConfigs.length === 0
  const canGenerate = hasEnoughFiles && hasPrimaryKey && hasSelectedColumns && hasPrimaryOutputColumns && hasRequiredSecondaryKeys
  const configuredSecondaryCount = activeSecondaryConfigs.length
  const stepItems = [
    { label: t('excelJoinStepFiles'), done: hasEnoughFiles },
    { label: t('excelJoinStepPrimary'), done: hasPrimaryKey },
    { label: t('excelJoinStepColumns'), done: hasSelectedColumns },
    { label: t('excelJoinStepExport'), done: Boolean(result) },
  ]

  const clearResult = () => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return null
    })
    setJoinWarnings([])
  }

  const updateSecondaryConfig = (fileId: string, sheetName: string, updater: (config: SecondaryJoinConfig) => SecondaryJoinConfig) => {
    clearResult()
    setSecondaryConfigs((current) => {
      const existing = current.find((config) => config.fileId === fileId && config.sheetName === sheetName) ?? createConfig(fileId, sheetName)
      const nextConfig = updater(existing)
      const withoutCurrent = current.filter((config) => !(config.fileId === fileId && config.sheetName === sheetName))
      return [...withoutCurrent, nextConfig]
    })
  }

  const handleSelectFiles = async (fileList: FileList | null) => {
    const incomingFiles = Array.from(fileList ?? [])
    if (incomingFiles.length === 0) {
      return
    }

    clearResult()
    const validFiles = incomingFiles.filter((file) => isSupportedExcelFile(file))
    const invalidFiles = incomingFiles.filter((file) => !isSupportedExcelFile(file))

    if (validFiles.length === 0) {
      setNotice({ tone: 'error', title: t('unsupportedFile'), message: t('excelUnsupportedFile') })
      return
    }

    setIsReading(true)
    try {
      const loadedResults = await Promise.allSettled(validFiles.map((file) => readExcelFile(file)))
      const loadedFiles = loadedResults.flatMap((resultItem) => (resultItem.status === 'fulfilled' ? [resultItem.value] : []))
      const failedFiles = loadedResults.flatMap((resultItem, index) => (resultItem.status === 'rejected' ? [validFiles[index].name] : []))
      const largeFiles = validFiles.filter((file) => file.size > LARGE_FILE_SIZE).map((file) => file.name)
      const skippedFiles = [...invalidFiles.map((file) => file.name), ...failedFiles]

      if (loadedFiles.length === 0) {
        setNotice({
          tone: 'error',
          title: t('excelReadError'),
          message: skippedFiles.length > 0 ? `${t('excelSkippedFiles')} ${joinFileNames(skippedFiles)}` : t('excelReadErrorDesc'),
        })
        return
      }

      setFiles((current) => {
        const nextFiles = [...current, ...loadedFiles]
        const nextPrimaryId = primaryFileId ?? nextFiles[0]?.id ?? null
        const nextPrimaryFile = nextFiles.find((file) => file.id === nextPrimaryId) ?? nextFiles[0]
        setPrimaryFileId(nextPrimaryId)
        setPreviewFileId(nextPrimaryId)
        if (primarySelectedColumnIndexes === null && nextPrimaryFile) {
          setPrimarySelectedColumnIndexes(getSelectedSheet(nextPrimaryFile).headers.map((_, index) => index))
        }
        return nextFiles
      })
      setSecondaryConfigs((current) => {
        const nextConfigs = [...current, ...loadedFiles.flatMap((file) => file.sheets.map((sheet) => createConfig(file.id, sheet.name)))]
        const nextFiles = [...files, ...loadedFiles]
        return syncSecondaryKeyMatches(nextConfigs, nextFiles, primaryFileId, primaryKeyHeader)
      })

      if (skippedFiles.length > 0 || largeFiles.length > 0) {
        setNotice({
          tone: 'warning',
          title: t('excelFilesLoadedWarning'),
          message: [
            `${t('excelFilesLoaded')} ${loadedFiles.length}.`,
            skippedFiles.length > 0 ? `${t('excelSkippedFiles')} ${joinFileNames(skippedFiles)}.` : '',
            largeFiles.length > 0 ? `${t('excelLargeFileWarning')} ${joinFileNames(largeFiles)}.` : '',
          ].filter(Boolean).join(' '),
        })
      } else {
        setNotice({ tone: 'success', title: t('documentsAdded'), message: `${t('excelFilesLoaded')} ${loadedFiles.length}.` })
      }
    } finally {
      setIsReading(false)
    }
  }

  const removeFile = (fileId: string) => {
    clearResult()
    setFiles((current) => {
      const nextFiles = current.filter((file) => file.id !== fileId)
      if (primaryFileId === fileId) {
        setPrimaryFileId(nextFiles[0]?.id ?? null)
        setPrimaryKeyColumnIndex(null)
        setPreviewFileId(nextFiles[0]?.id ?? null)
      }
      return nextFiles
    })
    setSecondaryConfigs((current) => current.filter((config) => config.fileId !== fileId))
  }

  const changeSheet = (fileId: string, sheetName: string) => {
    clearResult()
    setFiles((current) => current.map((file) => (file.id === fileId ? { ...file, selectedSheetName: sheetName } : file)))
    if (fileId === primaryFile?.id) {
      setPrimaryKeyColumnIndex(null)
      const nextPrimaryFile = { ...primaryFile, selectedSheetName: sheetName }
      setPrimarySelectedColumnIndexes(getSelectedSheet(nextPrimaryFile).headers.map((_, index) => index))
      setSecondaryConfigs((current) => syncSecondaryKeyMatches(current, files, primaryFile.id, null))
    } else {
      updateSecondaryConfig(fileId, sheetName, (config) => {
        const file = files.find((item) => item.id === fileId)
        if (!file) {
          return { ...config, keyColumnIndex: null, selectedColumnIndexes: [] }
        }

        const nextFile = { ...file, selectedSheetName: sheetName }
        return {
          ...config,
          keyColumnIndex: findMatchingColumnIndex(nextFile, sheetName, primaryKeyHeader),
        }
      })
    }
  }

  const changePrimaryFile = (fileId: string) => {
    clearResult()
    setPrimaryFileId(fileId)
    setPrimaryKeyColumnIndex(null)
    const nextPrimaryFile = files.find((file) => file.id === fileId)
    setPrimarySelectedColumnIndexes(nextPrimaryFile ? getSelectedSheet(nextPrimaryFile).headers.map((_, index) => index) : null)
    setPreviewFileId(fileId)
    setSecondaryConfigs((current) => syncSecondaryKeyMatches(current, files, fileId, null))
  }

  const changePrimaryKey = (columnIndex: number | null) => {
    clearResult()
    setPrimaryKeyColumnIndex(columnIndex)
    const nextPrimaryHeader = primarySheet && columnIndex !== null ? primarySheet.headers[columnIndex] : null
    setSecondaryConfigs((current) => syncSecondaryKeyMatches(current, files, primaryFile?.id ?? null, nextPrimaryHeader))
  }

  const togglePrimaryColumn = (columnIndex: number) => {
    clearResult()
    setPrimarySelectedColumnIndexes((current) => {
      const selectedColumns = current ?? allPrimaryColumnIndexes
      return selectedColumns.includes(columnIndex)
        ? selectedColumns.filter((index) => index !== columnIndex)
        : [...selectedColumns, columnIndex].sort((left, right) => left - right)
    })
  }

  const selectAllPrimaryColumns = () => {
    clearResult()
    setPrimarySelectedColumnIndexes(allPrimaryColumnIndexes)
  }

  const clearPrimaryColumns = () => {
    clearResult()
    setPrimarySelectedColumnIndexes([])
  }

  const toggleSecondaryColumn = (fileId: string, columnIndex: number) => {
    const file = files.find((item) => item.id === fileId)
    const sheetName = file?.selectedSheetName
    if (!sheetName) {
      return
    }

    updateSecondaryConfig(fileId, sheetName, (config) => {
      if (columnIndex === config.keyColumnIndex) {
        return config
      }

      const exists = config.selectedColumnIndexes.includes(columnIndex)
      return {
        ...config,
        selectedColumnIndexes: exists
          ? config.selectedColumnIndexes.filter((index) => index !== columnIndex)
          : [...config.selectedColumnIndexes, columnIndex],
      }
    })
  }

  const validateBeforeGenerate = () => {
    if (files.length < 2) {
      return t('excelJoinNeedTwoFiles')
    }

    if (!primaryFile || !primarySheet) {
      return t('excelJoinMissingPrimary')
    }

    if (primaryKeyColumnIndex === null) {
      return t('excelJoinMissingPrimaryKey')
    }

    if (selectedSecondaryColumnCount === 0) {
      return t('excelJoinMissingSelectedColumns')
    }

    if (selectedPrimaryColumnIndexes.length === 0) {
      return t('excelJoinMissingPrimaryColumns')
    }

    if (missingSecondaryKeyConfigs.length > 0) {
      return `${t('excelJoinMissingAutoKey')} ${joinFileNames(missingSecondaryKeyConfigs.map((config) => {
        const file = files.find((item) => item.id === config.fileId)
        return `${file?.name ?? t('unknown')} - ${config.sheetName}`
      }))}.`
    }

    return null
  }

  const generateExcel = () => {
    const validationMessage = validateBeforeGenerate()
    if (validationMessage) {
      setNotice({ tone: 'error', title: t('excelJoinCannotGenerate'), message: validationMessage })
      return
    }

    if (!primaryFile || primaryKeyColumnIndex === null) {
      return
    }

    clearResult()
    setIsGenerating(true)
    try {
      const built = buildJoinedExcelWorkbook({
        files,
        primaryFileId: primaryFile.id,
        primaryKeyColumnIndex,
        primarySelectedColumnIndexes: selectedPrimaryColumnIndexes,
        secondaryConfigs,
      })
      const url = URL.createObjectURL(built.blob)
      setResult({ url, fileName: OUTPUT_FILE_NAME, size: built.blob.size })
      setJoinWarnings(built.warnings)
      setNotice({
        tone: built.warnings.length > 0 ? 'warning' : 'success',
        title: t('excelJoinGenerated'),
        message: built.warnings.length > 0 ? t('excelJoinGeneratedWithWarnings') : t('excelJoinGeneratedDesc'),
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: t('excelJoinGenerateError'),
        message: error instanceof Error ? error.message : t('excelGenerateErrorDesc'),
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const clearAll = () => {
    clearResult()
    setFiles([])
    setPrimaryFileId(null)
    setPrimaryKeyColumnIndex(null)
    setPrimarySelectedColumnIndexes(null)
    setSecondaryConfigs([])
    setPreviewFileId(null)
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('excelJoinCardDesc') })
  }

  return (
    <>
      <SectionHero
        badge={t('excelJoinBadge')}
        title={t('excelJoinTitle')}
        description={t('excelJoinDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('excelJoinSimpleFlow')}</p>
            <div className="mt-4 grid gap-2">
              {stepItems.map((step, index) => (
                <div key={step.label} className="flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3 text-sm text-slate-100">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.done ? 'bg-emerald-400 text-slate-950' : 'bg-white/12 text-slate-200'}`}>
                    {index + 1}
                  </span>
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-5">
          <section className="panel overflow-hidden p-0">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 p-5 text-white sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">1. {t('excelJoinStepFiles')}</p>
                  <h2 className="mt-2 text-2xl font-extrabold">{t('excelJoinCardTitle')}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{t('excelJoinFilesHelp')}</p>
                </div>
                <span className="w-fit rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100">{files.length} {t('filesCount')}</span>
              </div>
            </div>

            <div className="p-5 sm:p-6">
            <FileDropzone
              title={t('excelJoinCardTitle')}
              description={t('excelJoinCardDesc')}
              buttonLabel={isReading ? t('readingFiles') : t('selectExcelFiles')}
              uploadLabel={t('uploadExcelDropzone')}
              acceptedFormats="XLSX / XLS / CSV"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              multiple
              disabled={isReading || isGenerating}
              aside={<span className="badge">XLSX / XLS / CSV</span>}
              onSelect={(filesList) => void handleSelectFiles(filesList)}
            />

            {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

            {files.length > 0 ? (
              <div className="mt-6 grid gap-3">
                {files.map((file, index) => (
                  <article
                    key={file.id}
                    className={`rounded-2xl border bg-white p-4 text-slate-950 transition ${file.id === primaryFile?.id ? 'border-blue-600 shadow-[0_18px_40px_-30px_rgba(37,99,235,0.65)]' : 'border-slate-200'}`}
                  >
                    <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)_220px_auto] lg:items-center">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{index + 1}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className={`rounded-full px-3 py-1 text-xs font-bold ${file.id === primaryFile?.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                            onClick={() => changePrimaryFile(file.id)}
                            disabled={isGenerating}
                          >
                            {file.id === primaryFile?.id ? t('excelJoinPrimaryFile') : t('excelJoinSetPrimary')}
                          </button>
                          <button
                            type="button"
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${previewFile?.id === file.id ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}
                            onClick={() => setPreviewFileId(file.id)}
                          >
                            {t('excelJoinViewData')}
                          </button>
                        </div>
                        <p className={`mt-3 break-words text-sm font-bold ${file.id === primaryFile?.id ? 'text-white' : 'text-slate-950'}`}>{file.name}</p>
                        <p className={`mt-1 text-xs ${file.id === primaryFile?.id ? 'text-slate-300' : 'text-slate-500'}`}>
                          {formatBytes(file.size)} · {file.sheets.length} {t('sheets')}
                        </p>
                      </div>

                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('sheet')}</span>
                        <select
                          value={file.selectedSheetName}
                          onChange={(event) => changeSheet(file.id, event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                          disabled={isReading || isGenerating}
                        >
                          {file.sheets.map((sheet) => (
                            <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
                          ))}
                        </select>
                      </label>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className={`badge ${result ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : isGenerating ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`}>
                          {result ? t('officePdfStatusSuccess') : isGenerating ? t('officePdfStatusConverting') : t('officePdfStatusQueued')}
                        </span>
                        <button type="button" className="btn-danger h-9 w-9 px-0" aria-label={t('remove')} title={t('remove')} onClick={() => removeFile(file.id)} disabled={isReading || isGenerating}>
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                            <path d="M4 7h16" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M6 7l1 14h10l1-14" />
                            <path d="M9 7V4h6v3" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            </div>
          </section>

          {files.length > 0 ? (
            <section className="panel p-5 sm:p-6">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">2. {t('excelJoinStepPrimary')}</p>
                  <h2 className="mt-2 text-2xl font-extrabold text-slate-950">{t('excelJoinPrimaryKey')}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{t('excelJoinPrimaryHelp')}</p>
                </div>
                <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  <div className="min-w-0 rounded-2xl bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('excelJoinPrimaryFile')}</p>
                    <p className="mt-2 truncate text-sm font-bold text-slate-950">{primaryFile?.name ?? '-'}</p>
                    <p className="mt-1 text-xs text-slate-500">{primarySheet?.name ?? '-'}</p>
                  </div>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('excelJoinPrimaryKey')}</span>
                    <select
                      value={primaryKeyColumnIndex ?? ''}
                      onChange={(event) => changePrimaryKey(event.target.value === '' ? null : Number(event.target.value))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                      disabled={!primarySheet || isGenerating}
                    >
                      <option value="">{t('excelJoinSelectKey')}</option>
                      {primarySheet?.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={index}>{header}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {primarySheet ? (
                <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-950">{t('excelJoinPrimaryColumns')}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{t('excelJoinPrimaryColumnsHelp')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={selectAllPrimaryColumns} disabled={isGenerating}>
                        {t('excelJoinSelectAllColumns')}
                      </button>
                      <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={clearPrimaryColumns} disabled={isGenerating}>
                        {t('excelJoinClearPrimaryColumns')}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                    {primarySheet.headers.map((header, index) => (
                      <label key={`${primaryFile?.id ?? 'primary'}-${primarySheet.name}-${index}`} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${selectedPrimaryColumnIndexes.includes(index) ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={selectedPrimaryColumnIndexes.includes(index)}
                          onChange={() => togglePrimaryColumn(index)}
                          disabled={isGenerating}
                        />
                        <span className="min-w-0 truncate">{header}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{selectedPrimaryColumnIndexes.length} {t('selected')}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {secondaryFiles.length > 0 ? (
            <section className="panel p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">3. {t('excelJoinStepColumns')}</p>
                  <h2 className="mt-2 text-2xl font-extrabold text-slate-950">{t('excelJoinSecondaryTitle')}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{t('excelJoinSecondaryDesc')}</p>
                </div>
                <span className="badge">{selectedSecondaryColumnCount} {t('selected')}</span>
              </div>

              {currentMissingSecondaryKeyFiles.length > 0 ? (
                <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                  <p className="font-bold">{t('excelJoinAutoKeyMissingTitle')}</p>
                  <p className="mt-1">
                    {t('excelJoinAutoKeyMissingDesc')} {primaryKeyHeader}: {joinFileNames(currentMissingSecondaryKeyFiles.map((file) => `${file.name} - ${getSelectedSheet(file).name}`))}.
                  </p>
                </div>
              ) : primaryKeyHeader ? (
                <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                  <p className="font-bold">{t('excelJoinAutoKeyReadyTitle')}</p>
                  <p className="mt-1">{t('excelJoinAutoKeyReadyDesc')} {primaryKeyHeader}.</p>
                </div>
              ) : null}

              <div className="mt-6 grid gap-4">
                {secondaryFiles.map((file) => {
                  const sheet = getSelectedSheet(file)
                  const config = getSecondaryConfig(file.id, sheet.name)
                  const outputSelectedColumnIndexes = getOutputSelectedSecondaryColumnIndexes(config)

                  return (
                    <article key={file.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px] lg:items-end">
                        <div className="min-w-0">
                          <h3 className="break-words text-lg font-bold text-slate-950">{file.name}</h3>
                          <p className="mt-1 text-xs text-slate-500">{formatBytes(file.size)} · {sheet.headers.length} {t('columns')} · {sheet.rows.length} {t('rows')}</p>
                        </div>

                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('sheet')}</span>
                          <select
                            value={file.selectedSheetName}
                            onChange={(event) => changeSheet(file.id, event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                            disabled={isGenerating}
                          >
                            {file.sheets.map((item) => (
                              <option key={item.name} value={item.name}>{item.name}</option>
                            ))}
                          </select>
                        </label>

                        <div className={`rounded-2xl border p-4 ${config.keyColumnIndex === null ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em]">{t('excelJoinAutoKey')}</p>
                          <p className="mt-2 text-sm font-bold">
                            {config.keyColumnIndex === null ? t('excelJoinAutoKeyNotFound') : sheet.headers[config.keyColumnIndex]}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 rounded-3xl bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-950">{t('excelJoinColumnsToBring')}</p>
                          <button type="button" className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm" onClick={() => setPreviewFileId(file.id)}>
                            {t('excelJoinViewData')}
                          </button>
                        </div>
                        <div className="grid max-h-44 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                        {sheet.headers.map((header, index) => (
                          <label key={`${file.id}-${sheet.name}-${index}`} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${index === config.keyColumnIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : outputSelectedColumnIndexes.includes(index) ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300"
                              checked={outputSelectedColumnIndexes.includes(index)}
                              onChange={() => toggleSecondaryColumn(file.id, index)}
                              disabled={isGenerating || index === config.keyColumnIndex}
                            />
                            <span className="min-w-0 truncate">{header}</span>
                            {index === config.keyColumnIndex ? <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-[0.12em]">{t('keyColumn')}</span> : null}
                          </label>
                        ))}
                        </div>
                      </div>

                      <p className="mt-4 text-xs text-slate-500">{outputSelectedColumnIndexes.length} {t('selected')}</p>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {previewFile && previewSheet ? (
            <section className="panel min-w-0 p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{t('excelJoinPreviewTitle')}</p>
                  <h2 className="mt-2 text-2xl font-extrabold text-slate-950">{previewFile.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t('sheet')}: {previewSheet.name} · {previewSheet.headers.length} {t('columns')} · {previewSheet.rows.length} {t('rows')}
                  </p>
                </div>
                <span className="badge">{t('excelJoinViewData')}</span>
              </div>

              <div className="mt-5">
                <AlertBanner tone="info" title={t('previewLimitedTitle')} message={t('excelJoinPreviewDesc')} />
              </div>

              <div className="mt-6">
                <ExcelJoinPreviewTable
                  file={previewFile}
                  sheet={previewSheet}
                  keyColumnIndex={previewKeyColumn}
                  selectedColumnIndexes={previewFile.id === primaryFile?.id ? selectedPrimaryColumnIndexes : previewConfig ? getOutputSelectedSecondaryColumnIndexes(previewConfig) : []}
                  lockedColumnIndexes={previewFile.id === primaryFile?.id || previewKeyColumn === null ? [] : [previewKeyColumn]}
                  onToggleColumn={
                    previewFile.id === primaryFile?.id
                      ? togglePrimaryColumn
                      : previewConfig
                        ? (columnIndex) => toggleSecondaryColumn(previewFile.id, columnIndex)
                        : undefined
                  }
                />
              </div>
            </section>
          ) : (
            <div className="panel p-6 sm:p-8">
              <EmptyState badge={t('noDocuments')} title={t('emptyExcelJoinTitle')} description={t('emptyExcelJoinDesc')} />
            </div>
          )}
        </div>

        <aside className="grid min-w-0 content-start gap-6 xl:sticky xl:top-6">
          <section className="panel p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">4. {t('excelJoinStepExport')}</p>
            <h2 className="mt-2 text-2xl font-extrabold text-slate-950">{t('excelJoinSummaryTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t('excelJoinSummaryHelp')}</p>
            <div className="mt-6 grid gap-4">
              <div className="panel-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('excelJoinPrimaryFile')}</p>
                <p className="mt-2 break-words text-sm font-semibold text-slate-900">{primaryFile?.name ?? '-'}</p>
                <p className="mt-1 text-xs text-slate-500">{primarySheet && primaryKeyColumnIndex !== null ? primarySheet.headers[primaryKeyColumnIndex] : t('excelJoinSelectKey')}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('excelJoinSecondaryTitle')}</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-950">{configuredSecondaryCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('selected')}</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-950">{selectedSecondaryColumnCount}</p>
                </div>
              </div>

              <div className="grid max-h-72 gap-3 overflow-y-auto pr-1">
                {secondaryFiles.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{t('excelJoinNoSecondary')}</div>
                ) : activeSecondaryConfigs.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{t('excelJoinNoColumnsSelected')}</div>
                ) : activeSecondaryConfigs.map((config) => {
                  const file = files.find((item) => item.id === config.fileId)
                  const sheet = file ? getSheetByName(file, config.sheetName) : null

                  if (!file || !sheet) {
                    return null
                  }

                  const selectedHeaders = getOutputSelectedSecondaryColumnIndexes(config).map((index) => sheet.headers[index]).filter(Boolean)

                  return (
                    <article key={`${config.fileId}-${config.sheetName}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="break-words text-sm font-bold text-slate-950">{file.name}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{t('sheet')}: {sheet.name}</p>
                      <p className={`mt-1 text-xs leading-5 ${config.keyColumnIndex === null ? 'text-amber-700' : 'text-slate-500'}`}>{t('excelJoinAutoKey')}: {config.keyColumnIndex === null ? t('excelJoinAutoKeyNotFound') : sheet.headers[config.keyColumnIndex]}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{selectedHeaders.length > 0 ? selectedHeaders.join(', ') : t('excelJoinNoColumnsSelected')}</p>
                    </article>
                  )
                })}
              </div>

              {joinWarnings.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-700">{t('warnings')}</p>
                  <div className="mt-2 grid gap-2 text-xs leading-5 text-amber-700">
                    {joinWarnings.map((warning) => (
                      <p key={`${warning.fileName}-${warning.message}`}>{warning.fileName}: {warning.message}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              {result ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-700">{t('excelReady')}</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} - {formatBytes(result.size)}</p>
                  <button type="button" className="btn-download mt-4 w-full" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                    {t('downloadExcel')}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <button type="button" className="btn-primary w-full" onClick={generateExcel} disabled={isReading || isGenerating || !canGenerate}>
                {isGenerating ? t('generatingExcel') : t('excelJoinGenerate')}
              </button>
              <button type="button" className="btn-secondary w-full" onClick={clearAll} disabled={isReading || isGenerating || files.length === 0}>
                {t('clearContent')}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
