import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { convertImageFile, getImageExtensionLabel, isSupportedImageType } from './lib/imageConverter'
import type { ConvertedImageResult, ImageOutputFormat, ImageUploadState } from './types'

type NoticeTone = 'error' | 'warning' | 'success' | 'info'

interface Notice {
  tone: NoticeTone
  title: string
  message: string
}

const OUTPUT_OPTIONS: Array<{ value: ImageOutputFormat; label: string }> = [
  { value: 'jpeg', label: 'JPG / JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'gif', label: 'GIF' },
  { value: 'ico', label: 'ICO' },
]

function loadImagePreview(file: File): Promise<ImageUploadState> {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({
        file,
        previewUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl)
      reject(new Error('IMAGE_LOAD_FAILED'))
    }
    image.src = previewUrl
  })
}

export function ImageConvertView() {
  const { t } = useLocale()
  const [upload, setUpload] = useState<ImageUploadState | null>(null)
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>('webp')
  const [result, setResult] = useState<ConvertedImageResult | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>({
    tone: 'info',
    title: t('localConversion'),
    message: t('imageLocalInfo'),
  })

  const sourceLabel = useMemo(() => {
    if (!upload) {
      return null
    }

    return getImageExtensionLabel(upload.file)
  }, [upload])

  const clearResult = () => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return null
    })
  }

  const clearAll = () => {
    clearResult()
    setUpload((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl)
      }

      return null
    })
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('imageConvertDesc') })
  }

  const handleSelectedFile = async (file: File | null | undefined) => {
    if (!file) {
      return
    }

    clearResult()

    if (!isSupportedImageType(file)) {
      setNotice({
        tone: 'error',
        title: t('unsupportedImage'),
        message: t('imageInputSupported'),
      })
      return
    }

    try {
      setUpload((current) => {
        if (current?.previewUrl) {
          URL.revokeObjectURL(current.previewUrl)
        }

        return current
      })

      const nextUpload = await loadImagePreview(file)
      setUpload(nextUpload)
      setNotice({
        tone: 'success',
        title: t('imageLoaded'),
        message: t('imageReadyToChoose'),
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: t('imageLoadErrorTitle'),
        message: error instanceof Error && error.message !== 'IMAGE_LOAD_FAILED' ? error.message : t('imageLoadErrorMessage'),
      })
    }
  }

  const handleConvert = async () => {
    if (!upload) {
      setNotice({
        tone: 'error',
        title: t('imageMissing'),
        message: t('selectImageFirst'),
      })
      return
    }

    setIsConverting(true)
    clearResult()

    try {
      const converted = await convertImageFile(upload.file, outputFormat)
      setResult(converted)
      setNotice({
        tone: 'success',
        title: t('conversionCompleted'),
        message: `${t('imageReadyFormat')} ${outputFormat.toUpperCase()}.`,
      })
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
              <li>3. {t('realConversion')}</li>
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
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            disabled={isConverting}
            aside={<span className="badge">JPG / PNG / WebP</span>}
            onSelect={(files) => {
              void handleSelectedFile(files?.[0])
            }}
          />

          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {upload ? (
            <div className="mt-6 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
              <div className="panel-subtle overflow-hidden p-3">
                <div className="overflow-hidden rounded-[1.2rem] bg-slate-100">
                  <img src={upload.previewUrl} alt={upload.file.name} className="aspect-square h-full w-full object-contain sm:aspect-[4/3]" />
                </div>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p>
                    <p className="mt-2 break-words text-sm font-semibold text-slate-900">{upload.file.name}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(upload.file.size)}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('format')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{sourceLabel}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('resolution')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{upload.width}x{upload.height}</p>
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

                  {outputFormat === 'jpeg' && sourceLabel === 'PNG' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="warning"
                        title={t('transparencyTitle')}
                        message={t('transparencyMessage')}
                      />
                    </div>
                  ) : null}

                  {outputFormat === 'gif' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="info"
                        title={t('staticGifTitle')}
                        message={t('staticGifMessage')}
                      />
                    </div>
                  ) : null}

                  {outputFormat === 'ico' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="info"
                        title={t('icoTitle')}
                        message={t('icoMessage')}
                      />
                    </div>
                  ) : null}

                  {outputFormat === 'avif' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="info"
                        title={t('avifTitle')}
                        message={t('avifMessage')}
                      />
                    </div>
                  ) : null}

                  {outputFormat === 'webp' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="info"
                        title={t('webpTitle')}
                        message={t('webpMessage')}
                      />
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleConvert} disabled={isConverting}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                        <path d="M4 12h10" />
                        <path d="m10 6 6 6-6 6" />
                        <rect x="4" y="5" width="3" height="14" rx="1" />
                      </svg>
                      {isConverting ? t('converting') : t('convertImageBtn')}
                    </button>
                    <button type="button" className="btn-secondary w-full sm:w-auto" onClick={clearAll} disabled={isConverting}>
                      {t('clearContent')}
                    </button>
                    {result ? (
                      <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                          <path d="M12 4v10" />
                          <path d="m8 10 4 4 4-4" />
                          <path d="M5 19h14" />
                        </svg>
                        {t('downloadConvertedImage')}
                      </button>
                    ) : null}
                  </div>
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
              <p className="mt-2 text-sm font-semibold text-slate-900">{outputFormat.toUpperCase()}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('compatibility')}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t('compatibilityTextImage')}
              </p>
            </div>
            {result ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('outputReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  )
}
