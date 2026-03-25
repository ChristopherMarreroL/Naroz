import { useEffect, useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { BetaNotice } from '../../components/shared/BetaNotice'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { preloadBackgroundRemoval, removeBackgroundFromImage } from './lib/backgroundRemoval'
import { getImageExtensionLabel, isSupportedImageType } from './lib/imageConverter'
import type { ConvertedImageResult, ImageUploadState } from './types'

interface Notice {
  tone: 'error' | 'warning' | 'success' | 'info'
  title: string
  message: string
}

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

export function ImageBackgroundRemoveView() {
  const { t } = useLocale()
  const [upload, setUpload] = useState<ImageUploadState | null>(null)
  const [result, setResult] = useState<ConvertedImageResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>({
    tone: 'info',
    title: t('removeImageBackground'),
    message: t('removeBackgroundAutomaticHint'),
  })

  useEffect(() => {
    void preloadBackgroundRemoval((message) => {
      setProgressMessage(message)
    }).finally(() => {
      setProgressMessage((current) => current)
    })
  }, [])

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
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('removeBackgroundCardDesc') })
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
        message: t('imageReadyToRemoveBackground'),
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: t('imageLoadErrorTitle'),
        message: error instanceof Error && error.message !== 'IMAGE_LOAD_FAILED' ? error.message : t('imageLoadErrorMessage'),
      })
    }
  }

  const handleRemoveBackground = async () => {
    if (!upload) {
      setNotice({
        tone: 'error',
        title: t('imageMissing'),
        message: t('selectImageFirst'),
      })
      return
    }

    setIsProcessing(true)
    setProgressMessage(t('backgroundModelPreparing'))
    clearResult()

    try {
      const nextResult = await removeBackgroundFromImage(upload.file, (message) => {
        setProgressMessage(message)
      })
      setResult(nextResult)
      setNotice({
        tone: 'success',
        title: t('removedBackgroundReady'),
        message: t('transparentPngOutput'),
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: t('imageBackgroundRemoveErrorTitle'),
        message: error instanceof Error ? error.message : t('imageConvertErrorMessage'),
      })
    } finally {
      setIsProcessing(false)
      setProgressMessage(null)
    }
  }

  return (
    <>
      <SectionHero
        badge={t('imageBackgroundBadge')}
        title={t('removeImageBackgroundTitle')}
        description={t('removeImageBackgroundDesc')}
        aside={
          <div className="rounded-[1.6rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.78)] sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{t('formatsAvailable')}</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>{t('imageInputLine')}</li>
              <li>2. {t('transparencyOutput')}: PNG</li>
              <li>3. {t('removeBackgroundAutomaticHint')}</li>
            </ul>
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-4 sm:p-6 lg:p-8">
          <BetaNotice message={t('removeBackgroundBetaMessage')} />

          <div className="mt-6">
            <FileDropzone
              title={t('removeBackgroundCardTitle')}
              description={t('removeBackgroundCardDesc')}
              buttonLabel={t('selectImage')}
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              disabled={isProcessing}
              aside={<span className="badge">JPG / PNG / WebP</span>}
              onSelect={(files) => {
                void handleSelectedFile(files?.[0])
              }}
            />
          </div>

          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {upload ? (
            <div className="mt-6 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
              <div className="grid gap-4">
                <div className="panel-subtle overflow-hidden p-3">
                  <div className="overflow-hidden rounded-[1.2rem] bg-slate-100">
                    <img src={upload.previewUrl} alt={upload.file.name} className="aspect-square h-full w-full object-contain sm:aspect-[4/3]" />
                  </div>
                </div>

                {result ? (
                  <div className="panel-subtle overflow-hidden p-3">
                    <div
                      className="overflow-hidden rounded-[1.2rem]"
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                        backgroundSize: '24px 24px',
                        backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
                        backgroundColor: '#f8fafc',
                      }}
                    >
                      <img src={result.url} alt={result.fileName} className="aspect-square h-full w-full object-contain sm:aspect-[4/3]" />
                    </div>
                  </div>
                ) : null}
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
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">{t('automaticDetection')}</p>
                    <p className="mt-2">{t('backgroundAutomaticDescription')}</p>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p>{t('transparentPngOutput')}</p>
                    <p className="mt-2">{progressMessage ?? t('removeBackgroundAutomaticHint')}</p>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleRemoveBackground} disabled={isProcessing}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                        <path d="M5 19V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12" />
                        <path d="m8 14 2.5-2.5L13 14l2-2 2 2" />
                        <path d="M4 19h16" />
                      </svg>
                      {isProcessing ? t('removingBackground') : t('removeBackgroundBtn')}
                    </button>
                    <button type="button" className="btn-secondary w-full sm:w-auto" onClick={clearAll} disabled={isProcessing}>
                      {t('clearContent')}
                    </button>
                    {result ? (
                      <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                          <path d="M12 4v10" />
                          <path d="m8 10 4 4 4-4" />
                          <path d="M5 19h14" />
                        </svg>
                        {t('downloadBackgroundRemoved')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState badge={t('noImage')} title={t('emptyRemoveBackgroundTitle')} description={t('emptyRemoveBackgroundDesc')} />
            </div>
          )}
        </section>

        <section className="panel p-4 sm:p-6 lg:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('backgroundRemovalStatus')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('backgroundRemovalStatusDesc')}</p>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('transparencyOutput')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{t('transparentPngOutput')}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('automaticDetection')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{t('enabled')}</p>
            </div>
            {progressMessage ? (
              <div className="panel-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('progressDetail')}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{progressMessage}</p>
              </div>
            ) : null}
            {result ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('removedBackgroundReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
              {t('removeBackgroundAutomaticHint')}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
