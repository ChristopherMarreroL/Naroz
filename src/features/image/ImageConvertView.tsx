import { useMemo, useState } from 'react'

import JSZip from 'jszip'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { convertImageFile, getImageExtensionLabel, isSupportedImageType } from './lib/imageConverter'
import { loadImagePreview } from './lib/imageEditor'
import type { ConvertedImageResult, ImageOutputFormat, ImageUploadState } from './types'

type NoticeTone = 'error' | 'warning' | 'success' | 'info'

interface Notice {
  tone: NoticeTone
  title: string
  message: string
}

interface BatchDownloadResult {
  url: string
  fileName: string
  size: number
}

interface ConversionFailure {
  fileName: string
  reason: string
}

const OUTPUT_OPTIONS: Array<{ value: ImageOutputFormat; label: string }> = [
  { value: 'jpeg', label: 'JPG / JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'gif', label: 'GIF' },
  { value: 'ico', label: 'ICO' },
  { value: 'svg', label: 'SVG' },
]

const ZIP_THRESHOLD = 5

function createZipName(format: ImageOutputFormat) {
  return `imagenes-convertidas-${format}.zip`
}

function joinFileNames(fileNames: string[]) {
  return fileNames.join(', ')
}

async function generateZipBlob(zip: JSZip): Promise<Blob> {
  if (typeof zip.generateAsync === 'function') {
    return zip.generateAsync({ type: 'blob' })
  }

  return zip.generate({ type: 'blob' })
}

export function ImageConvertView() {
  const { t } = useLocale()
  const [uploads, setUploads] = useState<ImageUploadState[]>([])
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>('webp')
  const [results, setResults] = useState<ConvertedImageResult[]>([])
  const [batchDownload, setBatchDownload] = useState<BatchDownloadResult | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>({
    tone: 'info',
    title: t('localConversion'),
    message: t('imageLocalInfo'),
  })

  const primaryUpload = uploads[0] ?? null
  const sourceLabel = useMemo(() => {
    if (!primaryUpload) {
      return null
    }

    return uploads.length === 1 ? getImageExtensionLabel(primaryUpload.file) : t('multipleFilesLoaded')
  }, [primaryUpload, t, uploads.length])

  const totalInputSize = useMemo(() => uploads.reduce((sum, item) => sum + item.file.size, 0), [uploads])
  const outputInfo = useMemo(() => outputFormat.toUpperCase(), [outputFormat])
  const shouldUseZip = results.length >= ZIP_THRESHOLD
  const singleResult = results.length === 1 ? results[0] : null

  const downloadAllResults = () => {
    results.forEach((item, index) => {
      window.setTimeout(() => {
        downloadFromUrl(item.url, item.fileName)
      }, index * 180)
    })
  }

  const clearResults = () => {
    setResults((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url))
      return []
    })

    setBatchDownload((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return null
    })
  }

  const clearAll = () => {
    clearResults()
    setUploads((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      return []
    })
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('imageConvertDesc') })
  }

  const handleSelectedFiles = async (fileList: FileList | null) => {
    const incomingFiles = Array.from(fileList ?? [])
    if (incomingFiles.length === 0) {
      return
    }

    clearResults()

    const validFiles = incomingFiles.filter((file) => isSupportedImageType(file))
    const invalidFiles = incomingFiles.filter((file) => !isSupportedImageType(file))

    if (validFiles.length === 0) {
      setNotice({ tone: 'error', title: t('unsupportedImage'), message: t('imageInputSupported') })
      return
    }

    try {
      setUploads((current) => {
        current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
        return current
      })

      const previewResults = await Promise.allSettled(validFiles.map((file) => loadImagePreview(file)))
      const nextUploads = previewResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const unreadableFiles = previewResults.flatMap((result, index) => (result.status === 'rejected' ? [validFiles[index].name] : []))
      const skippedFiles = [...invalidFiles.map((file) => file.name), ...unreadableFiles]

      if (nextUploads.length === 0) {
        setNotice({
          tone: 'error',
          title: t('imageLoadErrorTitle'),
          message: skippedFiles.length > 0 ? `${t('imageBatchSkipped')} ${joinFileNames(skippedFiles)}` : t('imageLoadErrorMessage'),
        })
        return
      }

      setUploads(nextUploads)

      if (skippedFiles.length > 0) {
        setNotice({
          tone: 'warning',
          title: t('unsupportedImage'),
          message: `${t('imageBatchAccepted')} ${nextUploads.length}. ${t('imageBatchSkipped')} ${joinFileNames(skippedFiles)}`,
        })
      } else {
        setNotice({
          tone: 'success',
          title: t('imageLoaded'),
          message: nextUploads.length > 1 ? `${t('imageBatchReady')} ${nextUploads.length}.` : t('imageReadyToChoose'),
        })
      }
    } catch (error) {
      setNotice({
        tone: 'error',
        title: t('imageLoadErrorTitle'),
        message: error instanceof Error && error.message !== 'IMAGE_LOAD_FAILED' ? error.message : t('imageLoadErrorMessage'),
      })
    }
  }

  const handleConvert = async () => {
    if (uploads.length === 0) {
      setNotice({ tone: 'error', title: t('imageMissing'), message: t('selectImageFirst') })
      return
    }

    setIsConverting(true)
    clearResults()

    try {
      const shouldPackageAsZip = uploads.length >= ZIP_THRESHOLD
      const convertedItems: ConvertedImageResult[] = []
      const failedItems: ConversionFailure[] = []
      const zip = shouldPackageAsZip ? new JSZip() : null
      let zipEntryCount = 0

      for (const upload of uploads) {
        try {
          const convertedItem = await convertImageFile(upload.file, outputFormat)
          if (zip) {
            zip.file(convertedItem.fileName, await convertedItem.blob.arrayBuffer())
            zipEntryCount += 1
            URL.revokeObjectURL(convertedItem.url)
          } else {
            convertedItems.push(convertedItem)
          }
        } catch (error) {
          failedItems.push({
            fileName: upload.file.name,
            reason: error instanceof Error ? error.message : t('imageConvertErrorMessage'),
          })
        }
      }

      const successfulCount = zip ? zipEntryCount : convertedItems.length

      if (successfulCount === 0) {
        throw new Error(failedItems[0]?.reason ?? t('imageConvertErrorMessage'))
      }

      if (zip) {
        setResults([])

        const zipBlob = await generateZipBlob(zip)
        const zipUrl = URL.createObjectURL(zipBlob)
        setBatchDownload({
          url: zipUrl,
          fileName: createZipName(outputFormat),
          size: zipBlob.size,
        })
        setNotice({
          tone: failedItems.length > 0 ? 'warning' : 'success',
          title: failedItems.length > 0 ? t('imageConvertErrorTitle') : t('conversionCompleted'),
          message:
            failedItems.length > 0
              ? `${t('imageBatchZipReady')} ${successfulCount}. ${t('imageBatchSkipped')} ${joinFileNames(failedItems.map((item) => item.fileName))}`
              : `${t('imageBatchZipReady')} ${successfulCount}.`,
        })
      } else {
        setResults(convertedItems)

        setNotice({
          tone: failedItems.length > 0 ? 'warning' : 'success',
          title: failedItems.length > 0 ? t('imageConvertErrorTitle') : t('conversionCompleted'),
          message:
            failedItems.length > 0
              ? `${successfulCount === 1 ? `${t('imageReadyFormat')} ${outputFormat.toUpperCase()}.` : `${t('imageBatchDirectReady')} ${successfulCount}.`} ${t('imageBatchSkipped')} ${joinFileNames(failedItems.map((item) => item.fileName))}`
              : successfulCount === 1
                ? `${t('imageReadyFormat')} ${outputFormat.toUpperCase()}.`
                : `${t('imageBatchDirectReady')} ${successfulCount}.`,
        })
      }
    } catch (error) {
      setNotice({
        tone: 'error',
        title: t('imageConvertErrorTitle'),
        message: error instanceof Error ? error.message : t('imageConvertErrorMessage'),
      })
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <>
      <SectionHero
        badge={t('imageBadge')}
        title={t('imageHeroTitle')}
        description={t('imageHeroDesc')}
        aside={
          <div className="rounded-[1.6rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.78)] sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{t('formatsAvailable')}</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>{t('imageInputLine')}</li>
              <li>{t('imageOutputLine')}</li>
              <li>3. {t('imageBatchHint')}</li>
            </ul>
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-4 sm:p-6 lg:p-8">
          <FileDropzone
            title={t('loadImage')}
            description={t('imageConvertDesc')}
            buttonLabel={t('selectImage')}
            accept="image/jpeg,image/png,image/webp,image/svg+xml,.jpg,.jpeg,.png,.webp,.svg"
            multiple
            disabled={isConverting}
            aside={<span className="badge">JPG / PNG / WebP / SVG</span>}
            onSelect={(files) => {
              void handleSelectedFiles(files)
            }}
          />

          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {primaryUpload ? (
            <div className="mt-6 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
              <div className="grid gap-4">
                <div className="panel-subtle overflow-hidden p-3">
                  <div className="overflow-hidden rounded-[1.2rem] bg-slate-100">
                    <img src={primaryUpload.previewUrl} alt={primaryUpload.file.name} className="aspect-square h-full w-full object-contain sm:aspect-[4/3]" />
                  </div>
                </div>

                {uploads.length > 1 ? (
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('filesLoaded')}</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {uploads.slice(0, 5).map((item) => (
                        <div key={item.file.name} className="truncate rounded-2xl bg-slate-50 px-3 py-2">{item.file.name}</div>
                      ))}
                      {uploads.length > 5 ? <div className="text-xs text-slate-500">+{uploads.length - 5} {t('moreFiles')}</div> : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('filesLoaded')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{uploads.length}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(totalInputSize)}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('format')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{sourceLabel}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('resolution')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{primaryUpload.width}x{primaryUpload.height}</p>
                  </div>
                </div>

                <div className="panel-subtle p-5 sm:p-6">
                  <label className="text-sm font-semibold text-slate-900" htmlFor="output-format">{t('outputFormat')}</label>
                  <select
                    id="output-format"
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                    value={outputFormat}
                    onChange={(event) => setOutputFormat(event.target.value as ImageOutputFormat)}
                  >
                    {OUTPUT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>

                  {outputFormat === 'jpeg' && uploads.some((item) => item.file.type === 'image/png') ? (
                    <div className="mt-4">
                      <AlertBanner tone="warning" title={t('transparencyTitle')} message={t('transparencyMessage')} />
                    </div>
                  ) : null}

                  {outputFormat === 'gif' ? (
                    <div className="mt-4">
                      <AlertBanner tone="info" title={t('staticGifTitle')} message={t('staticGifMessage')} />
                    </div>
                  ) : null}

                  {outputFormat === 'ico' ? (
                    <div className="mt-4">
                      <AlertBanner tone="info" title={t('icoTitle')} message={t('icoMessage')} />
                    </div>
                  ) : null}

                  {outputFormat === 'avif' ? (
                    <div className="mt-4">
                      <AlertBanner tone="info" title={t('avifTitle')} message={t('avifMessage')} />
                    </div>
                  ) : null}

                  {outputFormat === 'webp' ? (
                    <div className="mt-4">
                      <AlertBanner tone="info" title={t('webpTitle')} message={t('webpMessage')} />
                    </div>
                  ) : null}

                  {outputFormat === 'svg' ? (
                    <div className="mt-4">
                      <AlertBanner tone="info" title={t('svgTitle')} message={t('svgMessage')} />
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleConvert} disabled={isConverting}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                        <path d="M4 12h10" />
                        <path d="m10 6 6 6-6 6" />
                        <rect x="4" y="5" width="3" height="14" rx="1" />
                      </svg>
                      {isConverting ? t('converting') : uploads.length > 1 ? t('convertImagesBtn') : t('convertImageBtn')}
                    </button>
                    <button type="button" className="btn-secondary w-full sm:w-auto" onClick={clearAll} disabled={isConverting}>
                      {t('clearContent')}
                    </button>
                    {batchDownload ? (
                      <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(batchDownload.url, batchDownload.fileName)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                          <path d="M12 4v10" />
                          <path d="m8 10 4 4 4-4" />
                          <path d="M5 19h14" />
                        </svg>
                        {t('downloadConvertedZip')}
                      </button>
                    ) : results.length > 1 ? (
                      <button type="button" className="btn-download w-full sm:w-auto" onClick={downloadAllResults}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                          <path d="M12 4v10" />
                          <path d="m8 10 4 4 4-4" />
                          <path d="M5 19h14" />
                        </svg>
                        {t('downloadConvertedImages')}
                      </button>
                    ) : singleResult ? (
                      <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(singleResult.url, singleResult.fileName)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                          <path d="M12 4v10" />
                          <path d="m8 10 4 4 4-4" />
                          <path d="M5 19h14" />
                        </svg>
                        {t('downloadConvertedImage')}
                      </button>
                    ) : null}
                  </div>

                  {results.length > 0 && !shouldUseZip ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {results.map((item) => (
                        <div key={item.fileName} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          {item.fileName}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState badge={t('noImage')} title={t('emptyImageTitle')} description={t('emptyImageDesc')} />
            </div>
          )}
        </section>

        <section className="panel p-4 sm:p-6 lg:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('imageStatus')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('imageStatusDesc')}</p>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('targetOutput')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{outputInfo}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('filesLoaded')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{uploads.length}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('compatibility')}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t('compatibilityTextImage')}</p>
            </div>
            {batchDownload ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('zipReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{batchDownload.fileName} · {formatBytes(batchDownload.size)}</p>
              </div>
            ) : null}
            {results.length > 1 && !shouldUseZip ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('outputReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{results.length} {results.length === 1 ? t('convertedFileReady') : t('convertedFilesReady')}</p>
              </div>
            ) : null}
            {singleResult ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('outputReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{singleResult.fileName} · {formatBytes(singleResult.size)}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  )
}
