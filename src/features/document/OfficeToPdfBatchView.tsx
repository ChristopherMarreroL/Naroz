import { useEffect, useMemo, useRef, useState } from 'react'

import JSZip from 'jszip'

import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useToastNotice } from '../../hooks/useToastNotice'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import {
  convertOfficeToPdf,
  getOfficeFileKind,
  getOfficePdfFileName,
  OFFICE_TO_PDF_MAX_SIZE,
  type OfficeFileKind,
} from './lib/officeToPdf'

type ConversionStatus = 'queued' | 'converting' | 'success' | 'error'

interface ConversionResult {
  url: string
  fileName: string
  size: number
}

interface OfficeUpload {
  id: string
  file: File
  kind: OfficeFileKind
  status: ConversionStatus
  progress: number
  result: ConversionResult | null
  errorKey: string | null
}

interface BatchDownload {
  url: string
  fileName: string
  size: number
}

const MAX_FILES = 10
const MAX_BATCH_SIZE = 100 * 1024 * 1024

const kindLabels: Record<OfficeFileKind, string> = {
  docx: 'Word / DOCX',
  xlsx: 'Excel / XLSX',
  pptx: 'PowerPoint / PPTX',
}

const statusKeys: Record<ConversionStatus, string> = {
  queued: 'officePdfStatusQueued',
  converting: 'officePdfStatusConverting',
  success: 'officePdfStatusSuccess',
  error: 'officePdfStatusError',
}

let fallbackUploadId = 0

function createUploadId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  fallbackUploadId += 1
  return `office-upload-${Date.now()}-${fallbackUploadId}-${Math.random().toString(36).slice(2)}`
}

function getOfficeErrorKey(error: unknown) {
  if (!(error instanceof Error)) return 'officePdfConvertErrorMessage'
  if (error.message === 'DOCX_EMPTY') return 'officePdfDocxEmptyError'
  if (error.message === 'XLSX_EMPTY') return 'officePdfXlsxEmptyError'
  if (error.message === 'PPTX_EMPTY') return 'officePdfPptxEmptyError'
  return 'officePdfConvertErrorMessage'
}

function getUniqueFileName(fileName: string, usedNames: Set<string>) {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName)
    return fileName
  }

  const dotIndex = fileName.lastIndexOf('.')
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : ''
  let suffix = 2
  let candidate = `${baseName}-${suffix}${extension}`

  while (usedNames.has(candidate)) {
    suffix += 1
    candidate = `${baseName}-${suffix}${extension}`
  }

  usedNames.add(candidate)
  return candidate
}

async function generateZipBlob(zip: JSZip): Promise<Blob> {
  if (typeof zip.generateAsync === 'function') {
    return zip.generateAsync({ type: 'blob' })
  }

  return zip.generate({ type: 'blob' })
}

export function OfficeToPdfBatchView() {
  const { locale, t } = useLocale()
  const [uploads, setUploads] = useState<OfficeUpload[]>([])
  const [isConverting, setIsConverting] = useState(false)
  const [batchDownload, setBatchDownload] = useState<BatchDownload | null>(null)
  const resultUrlsRef = useRef(new Set<string>())
  const batchUrlRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const [, setNotice] = useToastNotice<{
    tone: 'info' | 'success' | 'error' | 'warning'
    title: string
    message: string
  } | null>(null)

  useEffect(() => {
    mountedRef.current = true
    const resultUrls = resultUrlsRef.current

    return () => {
      mountedRef.current = false
      resultUrls.forEach((url) => URL.revokeObjectURL(url))
      resultUrls.clear()
      if (batchUrlRef.current) URL.revokeObjectURL(batchUrlRef.current)
    }
  }, [])

  const totalInputSize = useMemo(
    () => uploads.reduce((total, item) => total + item.file.size, 0),
    [uploads],
  )
  const successfulCount = uploads.filter((item) => item.status === 'success').length
  const failedCount = uploads.filter((item) => item.status === 'error').length
  const overallProgress = uploads.length > 0
    ? Math.round(uploads.reduce((total, item) => total + item.progress, 0) / uploads.length)
    : 0

  const updateUpload = (id: string, update: Partial<OfficeUpload>) => {
    if (!mountedRef.current) return
    setUploads((current) => current.map((item) => (item.id === id ? { ...item, ...update } : item)))
  }

  const clearBatchDownload = () => {
    if (batchUrlRef.current) {
      URL.revokeObjectURL(batchUrlRef.current)
      batchUrlRef.current = null
    }
    setBatchDownload(null)
  }

  const revokeResult = (result: ConversionResult | null) => {
    if (!result) return
    URL.revokeObjectURL(result.url)
    resultUrlsRef.current.delete(result.url)
  }

  const resetOutputs = () => {
    clearBatchDownload()
    resultUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    resultUrlsRef.current.clear()
    setUploads((current) => current.map((item) => ({
      ...item,
      status: 'queued',
      progress: 0,
      result: null,
      errorKey: null,
    })))
  }

  const clearContent = () => {
    resetOutputs()
    setUploads([])
  }

  const handleSelectFiles = (fileList: FileList | null) => {
    const incomingFiles = Array.from(fileList ?? [])
    if (incomingFiles.length === 0) return

    const candidates: Array<Pick<OfficeUpload, 'id' | 'file' | 'kind'>> = []
    let invalidCount = 0
    let oversizedCount = 0

    incomingFiles.forEach((file) => {
      if (file.size > OFFICE_TO_PDF_MAX_SIZE) {
        oversizedCount += 1
        return
      }

      const kind = getOfficeFileKind(file)
      if (!kind) invalidCount += 1
      else candidates.push({ id: createUploadId(), file, kind })
    })

    const accepted: OfficeUpload[] = []
    let nextTotalSize = totalInputSize
    let skippedByLimit = 0
    for (const candidate of candidates) {
      if (uploads.length + accepted.length >= MAX_FILES) {
        skippedByLimit += 1
        continue
      }

      if (nextTotalSize + candidate.file.size > MAX_BATCH_SIZE) {
        skippedByLimit += 1
        continue
      }

      accepted.push({ ...candidate, status: 'queued', progress: 0, result: null, errorKey: null })
      nextTotalSize += candidate.file.size
    }
    if (accepted.length === 0) {
      const limitReached = oversizedCount + skippedByLimit > 0
      setNotice({
        tone: 'error',
        title: limitReached ? t('officePdfBatchLimitTitle') : t('officePdfInvalidTitle'),
        message: limitReached ? t('officePdfBatchLimitMessage') : t('officePdfInvalidMessage'),
      })
      return
    }

    resetOutputs()
    setUploads((current) => [...current, ...accepted])
    const skippedCount = invalidCount + oversizedCount + skippedByLimit
    setNotice({
      tone: skippedCount > 0 ? 'warning' : 'success',
      title: t('officePdfLoadedTitle'),
      message: skippedCount > 0
        ? `${accepted.length} ${t('officePdfFilesAccepted')}. ${skippedCount} ${t('officePdfFilesSkipped')}.`
        : `${accepted.length} ${t('officePdfFilesLoadedMessage')}.`,
    })
  }

  const removeUpload = (id: string) => {
    clearBatchDownload()
    setUploads((current) => {
      const target = current.find((item) => item.id === id)
      revokeResult(target?.result ?? null)
      return current.filter((item) => item.id !== id)
    })
  }

  const handleConvert = async () => {
    if (uploads.length === 0) {
      setNotice({ tone: 'error', title: t('officePdfMissingTitle'), message: t('officePdfMissingMessage') })
      return
    }

    const queue = [...uploads]
    resetOutputs()
    setIsConverting(true)
    const converted: Array<{ blob: Blob; result: ConversionResult }> = []
    const usedFileNames = new Set<string>()
    let conversionFailures = 0
    let zipFailed = false

    for (const upload of queue) {
      if (!mountedRef.current) return
      updateUpload(upload.id, { status: 'converting', progress: 4 })

      try {
        const blob = await convertOfficeToPdf(upload.file, upload.kind, (progress) => {
          updateUpload(upload.id, { progress })
        })
        if (!mountedRef.current) return

        const fileName = getUniqueFileName(getOfficePdfFileName(upload.file.name), usedFileNames)
        const result = { url: URL.createObjectURL(blob), fileName, size: blob.size }

        resultUrlsRef.current.add(result.url)
        converted.push({ blob, result })
        updateUpload(upload.id, { status: 'success', progress: 100, result, errorKey: null })
      } catch (error) {
        if (!mountedRef.current) return
        console.error('Office to PDF conversion failed', error)
        conversionFailures += 1
        updateUpload(upload.id, {
          status: 'error',
          progress: 0,
          errorKey: getOfficeErrorKey(error),
        })
      }
    }

    if (mountedRef.current && converted.length > 1) {
      try {
        const zip = new JSZip()
        converted.forEach((item) => zip.file(item.result.fileName, item.blob))
        const zipBlob = await generateZipBlob(zip)
        if (!mountedRef.current) return
        const url = URL.createObjectURL(zipBlob)
        batchUrlRef.current = url
        setBatchDownload({ url, fileName: 'documentos-office-convertidos.zip', size: zipBlob.size })
      } catch {
        zipFailed = true
      }
    }

    if (!mountedRef.current) return
    setIsConverting(false)

    if (converted.length === 0) {
      setNotice({ tone: 'error', title: t('officePdfConvertErrorTitle'), message: t('officePdfConvertErrorMessage') })
      return
    }

    const hasWarnings = conversionFailures > 0 || zipFailed
    const conversionSummary = `${converted.length} ${t('officePdfBatchConvertedCount')}.`
    const failureSummary = conversionFailures > 0 ? ` ${conversionFailures} ${t('officePdfFilesSkipped')}.` : ''
    const zipSummary = zipFailed ? ` ${t('officePdfZipErrorMessage')}` : ''
    setNotice({
      tone: hasWarnings ? 'warning' : 'success',
      title: hasWarnings ? t('officePdfBatchPartialTitle') : t('officePdfConvertedTitle'),
      message: `${conversionSummary}${failureSummary}${zipSummary}`,
    })
  }

  return (
    <>
      <SectionHero
        badge={t('officePdfBadge')}
        title={t('officePdfTitle')}
        description={t('officePdfDescription')}
        aside={
          <div className="rounded-[1.5rem] border border-blue-900/15 bg-blue-700 p-5 text-white shadow-[0_24px_60px_-35px_rgba(29,78,216,0.8)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100">{t('officePdfFlowTitle')}</p>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="rounded-2xl bg-white/12 px-4 py-3">{t('input')}: DOCX / XLSX / PPTX</div>
              <div className="rounded-2xl bg-white/12 px-4 py-3">{t('output')}: PDF</div>
              <div className="rounded-2xl bg-cyan-300/18 px-4 py-3 text-cyan-50">{t('markdownLocalBadge')}</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel min-w-0 p-6 sm:p-8">
          <FileDropzone
            title={t('officePdfUploadTitle')}
            description={t('officePdfUploadDescription')}
            uploadLabel={t('officePdfUploadLabel')}
            acceptedFormats="DOCX, XLSX, XLS, PPTX"
            accept=".docx,.xlsx,.xls,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            maxSize={OFFICE_TO_PDF_MAX_SIZE}
            enforceMaxSize={false}
            multiple
            disabled={isConverting || uploads.length >= MAX_FILES}
            aside={<span className="badge">{MAX_FILES} MAX</span>}
            onSelect={handleSelectFiles}
          />

          {uploads.length > 0 ? (
            <div className="mt-6 grid gap-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label={t('filesLoaded')} value={`${uploads.length} / ${MAX_FILES}`} />
                <Metric label={t('officePdfTotalSize')} value={`${formatBytes(totalInputSize)} / 100 MB`} />
                <Metric label={t('targetOutput')} value="PDF" />
              </div>

              <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                {uploads.map((upload, index) => (
                  <article key={upload.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{index + 1}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900" title={upload.file.name}>{upload.file.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{kindLabels[upload.kind]} · {formatBytes(upload.file.size)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`badge ${upload.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : upload.status === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : ''}`}>
                              {t(statusKeys[upload.status])}
                            </span>
                            <button type="button" className="btn-danger h-9 w-9 px-0" aria-label={t('remove')} title={t('remove')} disabled={isConverting} onClick={() => removeUpload(upload.id)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                                <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {upload.status === 'converting' || upload.progress > 0 ? (
                          <div className="mt-3">
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${upload.progress}%` }} />
                            </div>
                            <p className="mt-1 text-right text-xs font-semibold text-slate-500">{upload.progress}%</p>
                          </div>
                        ) : null}

                        {upload.errorKey ? <p className="mt-3 text-xs leading-5 text-rose-700">{t(upload.errorKey)}</p> : null}
                        {upload.result ? (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                            <span className="min-w-0 truncate">{upload.result.fileName} · {formatBytes(upload.result.size)}</span>
                            <button type="button" className="font-bold underline decoration-emerald-300 underline-offset-4" onClick={() => downloadFromUrl(upload.result!.url, upload.result!.fileName)}>
                              {t('download')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {isConverting ? (
                <div className="panel-subtle p-4">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                    <span>{t('officePdfConverting')}</span><span>{overallProgress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${overallProgress}%` }} />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-primary" disabled={isConverting} onClick={() => void handleConvert()}>
                  {isConverting ? t('officePdfConverting') : t('officePdfConvertAllButton')}
                </button>
                {batchDownload ? (
                  <button type="button" className="btn-download" onClick={() => downloadFromUrl(batchDownload.url, batchDownload.fileName)}>{t('officePdfDownloadZip')}</button>
                ) : null}
                <button type="button" className="btn-secondary" disabled={isConverting} onClick={clearContent}>{t('clearContent')}</button>
              </div>
            </div>
          ) : (
            <div className="mt-6"><EmptyState badge="PDF" title={t('officePdfEmptyTitle')} description={t('officePdfEmptyDescription')} /></div>
          )}
        </section>

        <aside className="panel h-fit p-6 min-[1700px]:sticky min-[1700px]:top-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('processingStatusTitle')}</p>
          <h2 className="mt-3 text-xl font-bold text-slate-950">{t('officePdfStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t('officePdfStatusDescription')}</p>
          <div className="mt-5 grid gap-3">
            <Metric label={t('filesLoaded')} value={String(uploads.length)} />
            <Metric label={t('officePdfSuccessful')} value={String(successfulCount)} valueClassName="text-emerald-700" />
            <Metric label={t('officePdfFailed')} value={String(failedCount)} valueClassName="text-rose-700" />
            {batchDownload ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                <p className="font-bold">{t('officePdfZipReady')}</p>
                <p className="mt-1 break-all">{batchDownload.fileName} · {formatBytes(batchDownload.size)}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
              {locale === 'es' ? 'Los archivos se procesan uno por uno, localmente, y no salen de este dispositivo.' : 'Files are processed one at a time, locally, and never leave this device.'}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

function Metric({ label, value, valueClassName = 'text-slate-900' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="panel-subtle p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={`mt-2 text-lg font-bold ${valueClassName}`}>{value}</p>
    </div>
  )
}
