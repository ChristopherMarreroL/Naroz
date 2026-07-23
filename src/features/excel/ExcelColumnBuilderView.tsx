import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { useToastNotice } from '../../hooks/useToastNotice'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { ExcelPreviewTable } from './components/ExcelPreviewTable'
import { SelectedColumnsSummary } from './components/SelectedColumnsSummary'
import {
  buildSelectedColumnsWorkbook,
  createColumnSelection,
  EXCEL_PREVIEW_ROW_LIMIT,
  getSelectedSheet,
  isSupportedExcelFile,
  readExcelFile,
  type ExcelFileData,
  type SelectedExcelColumn,
} from './lib/excelColumnBuilder'

interface Notice {
  tone: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
}

interface GeneratedExcelResult {
  url: string
  fileName: string
  size: number
}

const OUTPUT_FILE_NAME = 'naroz-columnas-seleccionadas.xlsx'
const LARGE_FILE_SIZE = 8 * 1024 * 1024

function joinFileNames(fileNames: string[]) {
  return fileNames.join(', ')
}

export function ExcelColumnBuilderView() {
  const { t } = useLocale()
  const [files, setFiles] = useState<ExcelFileData[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [selectedColumns, setSelectedColumns] = useState<SelectedExcelColumn[]>([])
  const [notice, setNotice] = useToastNotice<Notice | null>({
    tone: 'info',
    title: t('documentLocalProcessing'),
    message: t('excelColumnBuilderCardDesc'),
  })
  const [isReading, setIsReading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GeneratedExcelResult | null>(null)

  const activeFile = useMemo(() => files.find((file) => file.id === activeFileId) ?? files[0] ?? null, [activeFileId, files])
  const activeSheet = useMemo(() => (activeFile ? getSelectedSheet(activeFile) : null), [activeFile])

  const selectedIds = useMemo(() => new Set(selectedColumns.map((column) => column.id)), [selectedColumns])

  const clearResult = () => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return null
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
        if (!activeFileId) {
          setActiveFileId(nextFiles[0]?.id ?? null)
        }
        return nextFiles
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
      if (activeFileId === fileId) {
        setActiveFileId(nextFiles[0]?.id ?? null)
      }
      return nextFiles
    })
    setSelectedColumns((current) => current.filter((column) => column.fileId !== fileId))
  }

  const changeSelectedSheet = (fileId: string, sheetName: string) => {
    clearResult()
    setActiveFileId(fileId)
    setFiles((current) => current.map((file) => (file.id === fileId ? { ...file, selectedSheetName: sheetName } : file)))
  }

  const toggleColumn = (columnIndex: number) => {
    if (!activeFile || !activeSheet) {
      return
    }

    clearResult()
    const selection = createColumnSelection(activeFile, activeSheet, columnIndex)
    setSelectedColumns((current) => {
      if (selectedIds.has(selection.id)) {
        return current.filter((column) => column.id !== selection.id)
      }

      return [...current, selection]
    })
  }

  const reorderColumn = (sourceColumnId: string, targetColumnId: string) => {
    clearResult()
    setSelectedColumns((current) => {
      const sourceIndex = current.findIndex((column) => column.id === sourceColumnId)
      const targetIndex = current.findIndex((column) => column.id === targetColumnId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current
      }

      const nextColumns = [...current]
      const [item] = nextColumns.splice(sourceIndex, 1)
      nextColumns.splice(targetIndex, 0, item)
      return nextColumns
    })
  }

  const clearSelection = () => {
    clearResult()
    setSelectedColumns([])
  }

  const clearAll = () => {
    clearResult()
    setFiles([])
    setActiveFileId(null)
    setSelectedColumns([])
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('excelColumnBuilderCardDesc') })
  }

  const generateExcel = () => {
    if (selectedColumns.length === 0) {
      setNotice({ tone: 'error', title: t('excelMissingColumns'), message: t('excelSelectColumnsFirst') })
      return
    }

    clearResult()
    setIsGenerating(true)
    try {
      const blob = buildSelectedColumnsWorkbook(files, selectedColumns)
      const url = URL.createObjectURL(blob)
      setResult({ url, fileName: OUTPUT_FILE_NAME, size: blob.size })
      setNotice({ tone: 'success', title: t('excelGenerated'), message: t('excelGeneratedDesc') })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: t('excelGenerateError'),
        message: error instanceof Error ? error.message : t('excelGenerateErrorDesc'),
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <>
      <SectionHero
        badge={t('excelColumnBuilderBadge')}
        title={t('excelColumnBuilderTitle')}
        description={t('excelColumnBuilderDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('currentScope')}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('input')}: XLSX / XLS / CSV</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('output')}: XLSX</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('processingLocal')}</div>
            </div>
          </div>
        }
      />

      <div className="grid min-w-0 gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid min-w-0 gap-6">
          <section className="panel p-6 sm:p-8">
            <FileDropzone
              title={t('excelColumnBuilderCardTitle')}
              description={t('excelColumnBuilderCardDesc')}
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
                {files.map((file, index) => {
                  const isActive = file.id === activeFile?.id
                  return (
                    <article
                      key={file.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isActive}
                      onClick={() => setActiveFileId(file.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setActiveFileId(file.id)
                        }
                      }}
                      className={`rounded-2xl border bg-white p-4 text-left text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-600/20 ${isActive ? 'border-blue-600 shadow-[0_18px_40px_-30px_rgba(37,99,235,0.65)]' : 'cursor-pointer border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)_220px_auto] xl:items-center">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{index + 1}</div>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold">{file.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatBytes(file.size)} · {file.sheets.length} {t('sheets')}
                          </p>
                        </div>

                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('sheet')}</span>
                          <select
                            value={file.selectedSheetName}
                            onChange={(event) => changeSelectedSheet(file.id, event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                            disabled={isReading || isGenerating}
                          >
                            {file.sheets.map((sheet) => (
                              <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
                            ))}
                          </select>
                        </label>

                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                          <span className={`badge ${result ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : isGenerating ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`}>
                            {result ? t('officePdfStatusSuccess') : isGenerating ? t('officePdfStatusConverting') : t('officePdfStatusQueued')}
                          </span>
                          <button type="button" className={isActive ? 'btn-download px-3 py-2 text-xs' : 'btn-secondary px-3 py-2 text-xs'} onClick={(event) => {
                            event.stopPropagation()
                            setActiveFileId(file.id)
                          }}>
                            {t('viewLarge')}
                          </button>
                          <button type="button" className="btn-danger h-9 w-9 px-0" aria-label={t('remove')} title={t('remove')} onClick={(event) => {
                            event.stopPropagation()
                            removeFile(file.id)
                          }} disabled={isReading || isGenerating}>
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
                  )
                })}
              </div>
            ) : null}
          </section>

          {activeFile && activeSheet ? (
            <section className="panel min-w-0 p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-950">{activeFile.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t('sheet')}: {activeSheet.name} · {activeSheet.headers.length} {t('columns')} · {activeSheet.rows.length} {t('rows')}
                  </p>
                </div>
                <span className="badge">{t('preview')}</span>
              </div>

              <div className="mt-5">
                <AlertBanner tone="info" title={t('previewLimitedTitle')} message={`${t('previewLimitedDesc')} ${EXCEL_PREVIEW_ROW_LIMIT}.`} />
              </div>

              <div className="mt-6">
                <ExcelPreviewTable file={activeFile} sheet={activeSheet} selectedColumns={selectedColumns} onToggleColumn={toggleColumn} />
              </div>
            </section>
          ) : (
            <div className="panel p-6 sm:p-8">
              <EmptyState badge={t('noDocuments')} title={t('emptyExcelBuilderTitle')} description={t('emptyExcelBuilderDesc')} />
            </div>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <SelectedColumnsSummary
            selectedColumns={selectedColumns}
            isGenerating={isGenerating}
            onRemove={(columnId) => {
              clearResult()
              setSelectedColumns((current) => current.filter((column) => column.id !== columnId))
            }}
            onReorder={reorderColumn}
            onClear={clearSelection}
            onGenerate={generateExcel}
          />

          <section className="panel p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold text-slate-950">{t('documentStatusTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t('excelStatusDesc')}</p>

            <div className="mt-6 grid gap-4">
              <div className="panel-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('filesLoaded')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{files.length}</p>
              </div>
              <div className="panel-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('selected')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{selectedColumns.length}</p>
              </div>
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

            <button type="button" className="btn-secondary mt-6 w-full" onClick={clearAll} disabled={isReading || isGenerating || (files.length === 0 && selectedColumns.length === 0)}>
              {t('clearContent')}
            </button>
          </section>
        </div>
      </div>
    </>
  )
}
