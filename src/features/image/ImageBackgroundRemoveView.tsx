import { useEffect, useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { useToastNotice } from '../../hooks/useToastNotice'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import {
  removeBackgroundFromImage,
  type BackgroundRemovalMode,
  type BackgroundRemovalProgress,
  type BackgroundRemovalResult,
} from './lib/backgroundRemoval'
import { getImageExtensionLabel } from './lib/imageConverter'
import type { ImageUploadState } from './types'
import { assertSafeImageDimensions, assertSafeImageFile } from './lib/imageLimits'
import { BackgroundMaskEditor } from './components/BackgroundMaskEditor'

const BACKGROUND_REMOVAL_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const BACKGROUND_REMOVAL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const MAX_MASK_EDITOR_PIXELS = 16_000_000

interface Notice {
  tone: 'error' | 'warning' | 'success' | 'info'
  title: string
  message: string
}

async function loadImagePreview(file: File): Promise<ImageUploadState> {
  await assertSafeImageFile(file)
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        assertSafeImageDimensions(image.naturalWidth, image.naturalHeight)
        resolve({ file, previewUrl, width: image.naturalWidth, height: image.naturalHeight })
      } catch (error) {
        URL.revokeObjectURL(previewUrl)
        reject(error)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl)
      reject(new Error('IMAGE_LOAD_FAILED'))
    }
    image.src = previewUrl
  })
}

function isSupportedBackgroundRemovalImage(file: File) {
  if (BACKGROUND_REMOVAL_TYPES.has(file.type)) {
    return true
  }

  const lowerName = file.name.toLowerCase()
  return BACKGROUND_REMOVAL_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

export function ImageBackgroundRemoveView() {
  const { t } = useLocale()
  const [upload, setUpload] = useState<ImageUploadState | null>(null)
  const [result, setResult] = useState<BackgroundRemovalResult | null>(null)
  const [removalMode, setRemovalMode] = useState<BackgroundRemovalMode>('auto')
  const [sensitivity, setSensitivity] = useState(55)
  const [removeEnclosedAreas, setRemoveEnclosedAreas] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const [notice, setNotice] = useToastNotice<Notice | null>({
    tone: 'info',
    title: t('removeImageBackground'),
    message: t('removeBackgroundAutomaticHint'),
  })

  const sourceLabel = useMemo(() => {
    if (!upload) {
      return null
    }

    return getImageExtensionLabel(upload.file)
  }, [upload])
  const canRefineResult = upload ? upload.width * upload.height <= MAX_MASK_EDITOR_PIXELS : false

  useEffect(() => () => {
    if (upload?.previewUrl) URL.revokeObjectURL(upload.previewUrl)
  }, [upload])

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url)
  }, [result])

  const clearResult = () => {
    setIsRefining(false)
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

    if (!isSupportedBackgroundRemovalImage(file)) {
      setNotice({
        tone: 'error',
        title: t('unsupportedImage'),
        message: t('backgroundInputSupported'),
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
        message: t('selectBackgroundImageFirst'),
      })
      return
    }

    setIsProcessing(true)
    setProgressMessage(t('backgroundModelPreparing'))
    clearResult()

    try {
      const describeProgress = (progress: BackgroundRemovalProgress) => {
        if (progress.stage === 'analyzing') return t('backgroundAnalyzingEdges')
        if (progress.stage === 'segmenting') return t('backgroundAiSegmenting')
        return progress.percent === undefined
          ? t('backgroundModelPreparing')
          : `${t('backgroundModelLoading')} ${progress.percent}%`
      }
      const nextResult = await removeBackgroundFromImage(
        upload.file,
        { mode: removalMode, removeEnclosedAreas, sensitivity },
        (progress) => setProgressMessage(describeProgress(progress)),
      )
      setResult(nextResult)
      setNotice({
        tone: 'success',
        title: t('removedBackgroundReady'),
        message: t('transparentPngOutput'),
      })
    } catch {
      setNotice({
        tone: 'error',
        title: t('imageBackgroundRemoveErrorTitle'),
        message: t('imageBackgroundRemoveErrorMessage'),
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
              <li>{t('backgroundInputLine')}</li>
              <li>2. {t('transparencyOutput')}: PNG</li>
              <li>3. {t('removeBackgroundAutomaticHint')}</li>
            </ul>
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-4 sm:p-6 lg:p-8">

          <div className="mt-6">
            <FileDropzone
              title={t('removeBackgroundCardTitle')}
              description={t('removeBackgroundCardDesc')}
              buttonLabel={t('selectImage')}
              uploadLabel={t('uploadImageDropzone')}
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
            <>
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
                  <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-900">{t('backgroundRemovalMode')}</span>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                        value={removalMode}
                        disabled={isProcessing}
                        onChange={(event) => {
                          clearResult()
                          setRemovalMode(event.target.value as BackgroundRemovalMode)
                        }}
                      >
                        <option value="auto">{t('backgroundModeAuto')}</option>
                        <option value="uniform">{t('backgroundModeUniform')}</option>
                        <option value="ai">{t('backgroundModeAi')}</option>
                      </select>
                      <span className="text-xs leading-5 text-slate-500">{t(`backgroundMode${removalMode === 'auto' ? 'Auto' : removalMode === 'uniform' ? 'Uniform' : 'Ai'}Desc`)}</span>
                    </label>

                    <label className="grid gap-2">
                      <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                        {t('backgroundSensitivity')}
                        <span className="text-slate-500">{sensitivity}%</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={sensitivity}
                        disabled={isProcessing || removalMode === 'ai'}
                        className="w-full cursor-pointer accent-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                        onChange={(event) => {
                          clearResult()
                          setSensitivity(Number(event.target.value))
                        }}
                      />
                      <span className="text-xs leading-5 text-slate-500">{t('backgroundSensitivityDesc')}</span>
                    </label>

                    <label className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={removeEnclosedAreas}
                        disabled={isProcessing || removalMode === 'ai'}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-slate-950 disabled:opacity-50"
                        onChange={(event) => {
                          clearResult()
                          setRemoveEnclosedAreas(event.target.checked)
                        }}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{t('backgroundRemoveEnclosed')}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{t('backgroundRemoveEnclosedDesc')}</span>
                      </span>
                    </label>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
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
                      <button
                        type="button"
                        className="btn-secondary w-full sm:w-auto"
                        onClick={() => setIsRefining(true)}
                        disabled={isProcessing || !canRefineResult}
                        title={canRefineResult ? undefined : t('backgroundRefineTooLarge')}
                      >
                        {t('backgroundRefineAction')}
                      </button>
                    ) : null}
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
            {result && isRefining && canRefineResult ? (
              <BackgroundMaskEditor
                sourceUrl={upload.previewUrl}
                resultUrl={result.url}
                disabled={isProcessing}
                t={t}
                onClose={() => setIsRefining(false)}
                onApply={(blob) => {
                  setResult((current) => current ? {
                    ...current,
                    blob,
                    url: URL.createObjectURL(blob),
                    size: blob.size,
                  } : current)
                  setIsRefining(false)
                  setNotice({
                    tone: 'success',
                    title: t('backgroundRefinementApplied'),
                    message: t('backgroundRefinementAppliedDesc'),
                  })
                }}
              />
            ) : null}
            </>
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
                <p className="mt-1 text-sm leading-6 text-emerald-700">
                  {result.method === 'uniform' ? t('backgroundUsedUniform') : t('backgroundUsedAi')}
                </p>
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
