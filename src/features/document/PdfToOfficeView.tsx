import { useEffect, useState } from 'react'

import { BetaNotice } from '../../components/shared/BetaNotice'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useToastNotice } from '../../hooks/useToastNotice'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import {
  convertPdfStructureToDocx,
  convertPdfStructureToXlsx,
  convertPdfToPptx,
  getPdfOfficeFileName,
  isSupportedPdf,
  PDF_TO_OFFICE_MAX_SIZE,
  readPdfStructure,
  type PdfOfficeFormat,
  type PdfStructure,
} from './lib/pdfToOffice'

interface ConversionResult {
  url: string
  fileName: string
  size: number
}

const outputFormats: Array<{ id: PdfOfficeFormat; label: string; extension: string }> = [
  { id: 'docx', label: 'Word', extension: 'DOCX' },
  { id: 'xlsx', label: 'Excel', extension: 'XLSX' },
  { id: 'pptx', label: 'PowerPoint', extension: 'PPTX' },
]

export function PdfToOfficeView() {
  const { locale, t } = useLocale()
  const [file, setFile] = useState<File | null>(null)
  const [structure, setStructure] = useState<PdfStructure | null>(null)
  const [outputFormat, setOutputFormat] = useState<PdfOfficeFormat>('docx')
  const [isReading, setIsReading] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ConversionResult | null>(null)
  const [, setNotice] = useToastNotice<{
    tone: 'info' | 'success' | 'error' | 'warning'
    title: string
    message: string
  } | null>(null)

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url)
      }
    }
  }, [result])

  const clearResult = () => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }
      return null
    })
  }

  const clearContent = () => {
    clearResult()
    setFile(null)
    setStructure(null)
    setOutputFormat('docx')
    setProgress(0)
  }

  const handleSelectFiles = async (fileList: FileList | null) => {
    const selectedFile = fileList?.[0]
    if (!selectedFile) {
      return
    }

    if (!isSupportedPdf(selectedFile)) {
      setNotice({ tone: 'error', title: t('pdfOfficeInvalidTitle'), message: t('pdfOfficeInvalidMessage') })
      return
    }

    clearResult()
    setFile(selectedFile)
    setStructure(null)
    setProgress(0)
    setIsReading(true)

    try {
      const nextStructure = await readPdfStructure(selectedFile, (completed, total) => {
        setProgress(Math.round((completed / total) * 100))
      })
      setStructure(nextStructure)

      if (!nextStructure.textItems) {
        setOutputFormat('pptx')
        setNotice({ tone: 'warning', title: t('pdfOfficeScannedTitle'), message: t('pdfOfficeScannedMessage') })
      } else {
        setNotice({ tone: 'success', title: t('pdfOfficeLoadedTitle'), message: t('pdfOfficeLoadedMessage') })
      }
    } catch (error) {
      setFile(null)
      const isPageLimit = error instanceof Error && error.message.startsWith('PAGE_LIMIT:')
      setNotice({
        tone: 'error',
        title: t('pdfOfficeReadErrorTitle'),
        message: isPageLimit ? t('pdfOfficePageLimitMessage') : t('pdfOfficeReadErrorMessage'),
      })
    } finally {
      setIsReading(false)
      setProgress(0)
    }
  }

  const handleConvert = async () => {
    if (!file || !structure) {
      setNotice({ tone: 'error', title: t('pdfOfficeMissingTitle'), message: t('pdfOfficeMissingMessage') })
      return
    }

    if (!structure.textItems && outputFormat !== 'pptx') {
      setNotice({ tone: 'warning', title: t('pdfOfficeScannedTitle'), message: t('pdfOfficeScannedMessage') })
      return
    }

    clearResult()
    setIsConverting(true)
    setProgress(0)

    try {
      let blob: Blob
      if (outputFormat === 'docx') {
        blob = await convertPdfStructureToDocx(structure, file.name.replace(/\.pdf$/i, ''))
        setProgress(100)
      } else if (outputFormat === 'xlsx') {
        blob = convertPdfStructureToXlsx(structure)
        setProgress(100)
      } else {
        blob = await convertPdfToPptx(file, (completed, total) => {
          setProgress(Math.round((completed / total) * 100))
        })
      }

      const nextResult = {
        url: URL.createObjectURL(blob),
        fileName: getPdfOfficeFileName(file.name, outputFormat),
        size: blob.size,
      }
      setResult(nextResult)
      setNotice({ tone: 'success', title: t('pdfOfficeConvertedTitle'), message: t('pdfOfficeConvertedMessage') })
    } catch {
      setNotice({ tone: 'error', title: t('pdfOfficeConvertErrorTitle'), message: t('pdfOfficeConvertErrorMessage') })
    } finally {
      setIsConverting(false)
      setProgress(0)
    }
  }

  const hasEditableText = Boolean(structure?.textItems)
  const selectedOutput = outputFormats.find((format) => format.id === outputFormat) ?? outputFormats[0]

  return (
    <>
      <SectionHero
        badge={t('pdfOfficeBadge')}
        title={t('pdfOfficeTitle')}
        description={t('pdfOfficeDescription')}
        aside={
          <div className="rounded-[1.5rem] border border-blue-900/15 bg-blue-700 p-5 text-white shadow-[0_24px_60px_-35px_rgba(29,78,216,0.8)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100">{t('pdfOfficeFlowTitle')}</p>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="rounded-2xl bg-white/12 px-4 py-3">{t('input')}: PDF</div>
              <div className="rounded-2xl bg-white/12 px-4 py-3">{t('output')}: DOCX / XLSX / PPTX</div>
              <div className="rounded-2xl bg-cyan-300/18 px-4 py-3 text-cyan-50">{t('markdownLocalBadge')}</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel min-w-0 p-6 sm:p-8">
          <FileDropzone
            title={t('pdfOfficeUploadTitle')}
            description={t('pdfOfficeUploadDescription')}
            uploadLabel={t('uploadPdfDropzone')}
            acceptedFormats="PDF"
            accept=".pdf,application/pdf"
            maxSize={PDF_TO_OFFICE_MAX_SIZE}
            disabled={isReading || isConverting}
            aside={<span className="badge">PDF</span>}
            onSelect={(files) => void handleSelectFiles(files)}
          />

          <div className="mt-6">
            <BetaNotice message={t('pdfOfficeBetaMessage')} />
          </div>

          {file ? (
            <div className="mt-6 grid gap-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="panel-subtle min-w-0 p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-900" title={file.name}>{file.name}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatBytes(file.size)}</p>
                </div>
                <div className="panel-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('pages')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{structure?.pageCount ?? '-'}</p>
                </div>
                <div className="panel-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('pdfOfficeTextLayer')}</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">{structure ? (hasEditableText ? t('available') : t('notAvailable')) : t('processingNow')}</p>
                </div>
              </div>

              {(isReading || isConverting) ? (
                <div className="panel-subtle p-4">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                    <span>{isReading ? t('pdfOfficeReading') : t('pdfOfficeConverting')}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : null}

              {structure ? (
                <div className="panel-subtle p-4 sm:p-5">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t('pdfOfficeOutputTitle')}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{t('pdfOfficeOutputDescription')}</p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('pdfOfficeOutputTitle')}>
                    {outputFormats.map((format) => {
                      const disabled = !hasEditableText && format.id !== 'pptx'
                      return (
                        <button
                          key={format.id}
                          type="button"
                          role="radio"
                          aria-checked={outputFormat === format.id}
                          disabled={disabled || isConverting}
                          className={`rounded-2xl border p-4 text-left transition ${outputFormat === format.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-300'} disabled:cursor-not-allowed disabled:opacity-45`}
                          onClick={() => {
                            clearResult()
                            setOutputFormat(format.id)
                          }}
                        >
                          <span className="block text-sm font-bold text-slate-950">{format.label}</span>
                          <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{format.extension}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-500">
                    {outputFormat === 'pptx' ? t('pdfOfficePptxMode') : outputFormat === 'xlsx' ? t('pdfOfficeXlsxMode') : t('pdfOfficeDocxMode')}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-primary" disabled={!structure || isReading || isConverting} onClick={() => void handleConvert()}>
                  {isConverting ? t('pdfOfficeConverting') : `${t('pdfOfficeConvertButton')} ${selectedOutput.label}`}
                </button>
                {result ? (
                  <button type="button" className="btn-download" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                    {t('download')} {selectedOutput.extension}
                  </button>
                ) : null}
                <button type="button" className="btn-secondary" disabled={isReading || isConverting} onClick={clearContent}>
                  {t('clearContent')}
                </button>
              </div>

              {result ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-bold">{t('pdfOfficeResultReady')}</p>
                  <p className="mt-1 break-all">{result.fileName} · {formatBytes(result.size)}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState badge="PDF" title={t('pdfOfficeEmptyTitle')} description={t('pdfOfficeEmptyDescription')} />
            </div>
          )}
        </section>

        <aside className="panel h-fit p-6 min-[1700px]:sticky min-[1700px]:top-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('processingStatusTitle')}</p>
          <h2 className="mt-3 text-xl font-bold text-slate-950">{t('pdfOfficeStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t('pdfOfficeStatusDescription')}</p>
          <div className="mt-5 grid gap-3">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('filesLoaded')}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{file ? 1 : 0}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('targetOutput')}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{selectedOutput.extension}</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
              {locale === 'es' ? 'Tus archivos permanecen en este dispositivo durante todo el proceso.' : 'Your files remain on this device throughout the process.'}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
