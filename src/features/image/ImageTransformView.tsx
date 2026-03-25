import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { getImageExtensionLabel, isSupportedImageType } from './lib/imageConverter'
import { canvasToImageBlob, createEditedImageName, getImageExtension, getImageMimeType, loadImageElement, loadImagePreview } from './lib/imageEditor'
import type { ConvertedImageResult, ImageUploadState } from './types'

interface Notice {
  tone: 'error' | 'warning' | 'success' | 'info'
  title: string
  message: string
}

export function ImageTransformView() {
  const { t } = useLocale()
  const [upload, setUpload] = useState<ImageUploadState | null>(null)
  const [result, setResult] = useState<ConvertedImageResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  const [notice, setNotice] = useState<Notice | null>({ tone: 'info', title: t('processingLocal'), message: t('transformImageCardDesc') })

  const sourceLabel = useMemo(() => (upload ? getImageExtensionLabel(upload.file) : null), [upload])
  const previewTransform = useMemo(() => `rotate(${rotation}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`, [flipX, flipY, rotation])

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
    setRotation(0)
    setFlipX(false)
    setFlipY(false)
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('transformImageCardDesc') })
  }

  const handleSelectedFile = async (file: File | null | undefined) => {
    if (!file) {
      return
    }

    clearResult()

    if (!isSupportedImageType(file)) {
      setNotice({ tone: 'error', title: t('unsupportedImage'), message: t('imageInputSupported') })
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
      setRotation(0)
      setFlipX(false)
      setFlipY(false)
      setNotice({ tone: 'success', title: t('imageLoaded'), message: t('imageReadyToTransform') })
    } catch (error) {
      setNotice({ tone: 'error', title: t('imageLoadErrorTitle'), message: error instanceof Error && error.message !== 'IMAGE_LOAD_FAILED' ? error.message : t('imageLoadErrorMessage') })
    }
  }

  const handleExport = async () => {
    if (!upload) {
      setNotice({ tone: 'error', title: t('imageMissing'), message: t('selectImageFirst') })
      return
    }

    setIsProcessing(true)
    clearResult()

    try {
      const image = await loadImageElement(upload.file)
      const quarterTurns = ((rotation % 360) + 360) % 360
      const rotated = quarterTurns === 90 || quarterTurns === 270
      const canvas = document.createElement('canvas')
      canvas.width = rotated ? image.naturalHeight : image.naturalWidth
      canvas.height = rotated ? image.naturalWidth : image.naturalHeight
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error(t('imageConvertErrorMessage'))
      }

      if (upload.file.type === 'image/jpeg') {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }

      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate((rotation * Math.PI) / 180)
      context.scale(flipX ? -1 : 1, flipY ? -1 : 1)
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

      const blob = await canvasToImageBlob(canvas, getImageMimeType(upload.file))
      const nextResult: ConvertedImageResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: createEditedImageName(upload.file.name, 'editada', getImageExtension(upload.file)),
        size: blob.size,
        format: upload.file.type === 'image/jpeg' ? 'jpeg' : upload.file.type === 'image/webp' ? 'webp' : 'png',
      }

      setResult(nextResult)
      setNotice({ tone: 'success', title: t('transformImageCompleted'), message: t('transformImageCompletedMessage') })
    } catch (error) {
      setNotice({ tone: 'error', title: t('transformImageError'), message: error instanceof Error ? error.message : t('imageConvertErrorMessage') })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      <SectionHero
        badge={t('transformImageBadge')}
        title={t('transformImageTitle')}
        description={t('transformImageDesc')}
        aside={
          <div className="rounded-[1.6rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.78)] sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{t('formatsAvailable')}</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>{t('imageInputLine')}</li>
              <li>2. {t('keepFormat')}</li>
              <li>3. {t('transformImageHint')}</li>
            </ul>
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-4 sm:p-6 lg:p-8">
          <FileDropzone
            title={t('transformImageCardTitle')}
            description={t('transformImageCardDesc')}
            buttonLabel={t('selectImage')}
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            disabled={isProcessing}
            aside={<span className="badge">JPG / PNG / WebP</span>}
            onSelect={(files) => {
              void handleSelectedFile(files?.[0])
            }}
          />

          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {upload ? (
            <div className="mt-6 grid gap-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
                <div className="panel-subtle overflow-hidden p-3">
                  <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-[1.2rem] bg-slate-100 p-5 lg:min-h-[620px]">
                    <img src={upload.previewUrl} alt={upload.file.name} className="max-h-[520px] max-w-full object-contain transition duration-300 lg:max-h-[660px]" style={{ transform: previewTransform }} />
                  </div>
                </div>

                <div className="grid gap-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p><p className="mt-2 break-words text-sm font-semibold text-slate-900">{upload.file.name}</p></div>
                    <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(upload.file.size)}</p></div>
                    <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('format')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{sourceLabel}</p></div>
                    <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('rotation')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{rotation}deg</p></div>
                  </div>

                  <div className="panel-subtle p-5 sm:p-6">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <button type="button" className="btn-secondary" onClick={() => setRotation((current) => (current - 90 + 360) % 360)}>{t('rotateLeft')}</button>
                      <button type="button" className="btn-secondary" onClick={() => setRotation((current) => (current + 90) % 360)}>{t('rotateRight')}</button>
                      <button type="button" className="btn-secondary" onClick={() => setFlipX((current) => !current)}>{t('flipHorizontal')}</button>
                      <button type="button" className="btn-secondary" onClick={() => setFlipY((current) => !current)}>{t('flipVertical')}</button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="font-semibold text-slate-900">{t('transformState')}</p>
                      <p className="mt-2">{t('rotation')}: {rotation}deg</p>
                      <p className="mt-1">{t('flipHorizontal')}: {flipX ? t('enabled') : t('disabled')}</p>
                      <p className="mt-1">{t('flipVertical')}: {flipY ? t('enabled') : t('disabled')}</p>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleExport} disabled={isProcessing}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M7 5h10v10H7z" /><path d="m12 3 3 3-3 3" /><path d="M15 6H9a3 3 0 0 0-3 3v6" /><path d="m12 21-3-3 3-3" /></svg>
                        {isProcessing ? t('transformingImage') : t('transformImageBtn')}
                      </button>
                      <button type="button" className="btn-secondary w-full sm:w-auto" onClick={clearAll} disabled={isProcessing}>
                        {t('clearContent')}
                      </button>
                      <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => { setRotation(0); setFlipX(false); setFlipY(false) }} disabled={isProcessing}>{t('resetChanges')}</button>
                      {result ? <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M12 4v10" /><path d="m8 10 4 4 4-4" /><path d="M5 19h14" /></svg>{t('downloadTransformedImage')}</button> : null}
                    </div>
                  </div>
                </div>
              </div>

              {result ? (
                <div className="panel-subtle overflow-hidden p-3">
                  <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-[1.2rem] bg-slate-100 p-5 lg:min-h-[440px]">
                    <img src={result.url} alt={result.fileName} className="max-h-[380px] max-w-full object-contain lg:max-h-[480px]" />
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6"><EmptyState badge={t('noImage')} title={t('emptyTransformImageTitle')} description={t('emptyTransformImageDesc')} /></div>
          )}
        </section>

        <section className="panel p-4 sm:p-6 lg:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('transformStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('transformStatusDesc')}</p>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('rotation')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{rotation}deg</p></div>
            <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('mirrorState')}</p><p className="mt-2 text-sm font-semibold text-slate-900">H {flipX ? t('enabled') : t('disabled')} · V {flipY ? t('enabled') : t('disabled')}</p></div>
            {result ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-700">{t('outputReady')}</p><p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p></div> : null}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">{t('transformImageHint')}</div>
          </div>
        </section>
      </div>
    </>
  )
}
