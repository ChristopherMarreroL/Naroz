import { useEffect, useState } from 'react'

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

interface ConversionResult {
  url: string
  fileName: string
  size: number
}

const kindLabels: Record<OfficeFileKind, string> = {
  docx: 'Word / DOCX',
  xlsx: 'Excel / XLSX',
  pptx: 'PowerPoint / PPTX',
}

export function OfficeToPdfView() {
  const { locale, t } = useLocale()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<OfficeFileKind | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ConversionResult | null>(null)
  const [, setNotice] = useToastNotice<{
    tone: 'info' | 'success' | 'error' | 'warning'
    title: string
    message: string
  } | null>(null)

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url)
  }, [result])

  const clearResult = () => {
    setResult((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return null
    })
  }

  const clearContent = () => {
    clearResult()
    setFile(null)
    setKind(null)
    setProgress(0)
  }

  const handleSelectFiles = (fileList: FileList | null) => {
    const selectedFile = fileList?.[0]
    if (!selectedFile) return
    const selectedKind = getOfficeFileKind(selectedFile)

    if (!selectedKind) {
      setNotice({ tone: 'error', title: t('officePdfInvalidTitle'), message: t('officePdfInvalidMessage') })
      return
    }

    clearResult()
    setFile(selectedFile)
    setKind(selectedKind)
    setProgress(0)
    setNotice({ tone: 'success', title: t('officePdfLoadedTitle'), message: t('officePdfLoadedMessage') })
  }

  const handleConvert = async () => {
    if (!file || !kind) {
      setNotice({ tone: 'error', title: t('officePdfMissingTitle'), message: t('officePdfMissingMessage') })
      return
    }

    clearResult()
    setIsConverting(true)
    setProgress(4)

    try {
      const blob = await convertOfficeToPdf(file, kind, setProgress)
      const nextResult = {
        url: URL.createObjectURL(blob),
        fileName: getOfficePdfFileName(file.name),
        size: blob.size,
      }
      setResult(nextResult)
      setProgress(100)
      setNotice({ tone: 'success', title: t('officePdfConvertedTitle'), message: t('officePdfConvertedMessage') })
    } catch {
      setNotice({ tone: 'error', title: t('officePdfConvertErrorTitle'), message: t('officePdfConvertErrorMessage') })
      setProgress(0)
    } finally {
      setIsConverting(false)
    }
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
            disabled={isConverting}
            aside={<span className="badge">OFFICE</span>}
            onSelect={handleSelectFiles}
          />

          {file && kind ? (
            <div className="mt-6 grid gap-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="panel-subtle min-w-0 p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-900" title={file.name}>{file.name}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatBytes(file.size)}</p>
                </div>
                <div className="panel-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('format')}</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">{kindLabels[kind]}</p>
                </div>
              </div>

              {isConverting || progress > 0 ? (
                <div className="panel-subtle p-4">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                    <span>{isConverting ? t('officePdfConverting') : t('officePdfResultReady')}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-primary" disabled={isConverting} onClick={() => void handleConvert()}>
                  {isConverting ? t('officePdfConverting') : t('officePdfConvertButton')}
                </button>
                {result ? (
                  <button type="button" className="btn-download" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                    {t('download')} PDF
                  </button>
                ) : null}
                <button type="button" className="btn-secondary" disabled={isConverting} onClick={clearContent}>{t('clearContent')}</button>
              </div>

              {result ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-bold">{t('officePdfResultReady')}</p>
                  <p className="mt-1 break-all">{result.fileName} · {formatBytes(result.size)}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState badge="PDF" title={t('officePdfEmptyTitle')} description={t('officePdfEmptyDescription')} />
            </div>
          )}
        </section>

        <aside className="panel h-fit p-6 min-[1700px]:sticky min-[1700px]:top-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('processingStatusTitle')}</p>
          <h2 className="mt-3 text-xl font-bold text-slate-950">{t('officePdfStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t('officePdfStatusDescription')}</p>
          <div className="mt-5 grid gap-3">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('filesLoaded')}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{file ? 1 : 0}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('targetOutput')}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">PDF</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
              {locale === 'es' ? 'El archivo se procesa localmente y no sale de este dispositivo.' : 'The file is processed locally and never leaves this device.'}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
