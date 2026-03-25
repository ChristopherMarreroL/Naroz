import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

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

type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

interface DragState {
  startX: number
  startY: number
  initialCropX: number
  initialCropY: number
  initialCropWidth: number
  initialCropHeight: number
  mode: CropHandle
}

const MIN_CROP_SIZE = 10

interface PreviewGeometry {
  imageWidth: number
  imageHeight: number
  offsetX: number
  offsetY: number
}

export function ImageCropView() {
  const { t } = useLocale()
  const cropFrameRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [upload, setUpload] = useState<ImageUploadState | null>(null)
  const [result, setResult] = useState<ConvertedImageResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDraggingCrop, setIsDraggingCrop] = useState(false)
  const [cropX, setCropX] = useState(10)
  const [cropY, setCropY] = useState(10)
  const [cropWidth, setCropWidth] = useState(80)
  const [cropHeight, setCropHeight] = useState(80)
  const [notice, setNotice] = useState<Notice | null>({
    tone: 'info',
    title: t('processingLocal'),
    message: t('cropImageCardDesc'),
  })
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })

  const sourceLabel = useMemo(() => (upload ? getImageExtensionLabel(upload.file) : null), [upload])

  const previewGeometry = useMemo<PreviewGeometry>(() => {
    if (!upload || frameSize.width <= 0 || frameSize.height <= 0) {
      return { imageWidth: 0, imageHeight: 0, offsetX: 0, offsetY: 0 }
    }

    const imageRatio = upload.width / upload.height
    const frameRatio = frameSize.width / frameSize.height

    if (imageRatio > frameRatio) {
      const imageWidth = frameSize.width
      const imageHeight = imageWidth / imageRatio
      return { imageWidth, imageHeight, offsetX: 0, offsetY: (frameSize.height - imageHeight) / 2 }
    }

    const imageHeight = frameSize.height
    const imageWidth = imageHeight * imageRatio
    return { imageWidth, imageHeight, offsetX: (frameSize.width - imageWidth) / 2, offsetY: 0 }
  }, [frameSize.height, frameSize.width, upload])

  const cropBoxStyle = useMemo(
    () => ({
      left: `${previewGeometry.offsetX + (cropX / 100) * previewGeometry.imageWidth}px`,
      top: `${previewGeometry.offsetY + (cropY / 100) * previewGeometry.imageHeight}px`,
      width: `${(cropWidth / 100) * previewGeometry.imageWidth}px`,
      height: `${(cropHeight / 100) * previewGeometry.imageHeight}px`,
    }),
    [cropHeight, cropWidth, cropX, cropY, previewGeometry.imageHeight, previewGeometry.imageWidth, previewGeometry.offsetX, previewGeometry.offsetY],
  )

  useEffect(() => {
    const frame = cropFrameRef.current
    if (!frame) {
      return undefined
    }

    const syncSize = () => {
      setFrameSize({ width: frame.clientWidth, height: frame.clientHeight })
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(frame)

    return () => {
      observer.disconnect()
    }
  }, [upload])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || previewGeometry.imageWidth <= 0 || previewGeometry.imageHeight <= 0) {
        return
      }

      const deltaX = ((event.clientX - dragState.startX) / previewGeometry.imageWidth) * 100
      const deltaY = ((event.clientY - dragState.startY) / previewGeometry.imageHeight) * 100

      let nextX = dragState.initialCropX
      let nextY = dragState.initialCropY
      let nextWidth = dragState.initialCropWidth
      let nextHeight = dragState.initialCropHeight

      if (dragState.mode === 'move') {
        nextX = dragState.initialCropX + deltaX
        nextY = dragState.initialCropY + deltaY
      }

      if (dragState.mode.includes('e')) {
        nextWidth = dragState.initialCropWidth + deltaX
      }

      if (dragState.mode.includes('s')) {
        nextHeight = dragState.initialCropHeight + deltaY
      }

      if (dragState.mode.includes('w')) {
        nextX = dragState.initialCropX + deltaX
        nextWidth = dragState.initialCropWidth - deltaX
      }

      if (dragState.mode.includes('n')) {
        nextY = dragState.initialCropY + deltaY
        nextHeight = dragState.initialCropHeight - deltaY
      }

      if (nextWidth < MIN_CROP_SIZE) {
        if (dragState.mode.includes('w')) {
          nextX -= MIN_CROP_SIZE - nextWidth
        }
        nextWidth = MIN_CROP_SIZE
      }

      if (nextHeight < MIN_CROP_SIZE) {
        if (dragState.mode.includes('n')) {
          nextY -= MIN_CROP_SIZE - nextHeight
        }
        nextHeight = MIN_CROP_SIZE
      }

      nextX = Math.max(0, Math.min(100 - nextWidth, nextX))
      nextY = Math.max(0, Math.min(100 - nextHeight, nextY))
      nextWidth = Math.max(MIN_CROP_SIZE, Math.min(100 - nextX, nextWidth))
      nextHeight = Math.max(MIN_CROP_SIZE, Math.min(100 - nextY, nextHeight))

      setCropX(Number(nextX.toFixed(2)))
      setCropY(Number(nextY.toFixed(2)))
      setCropWidth(Number(nextWidth.toFixed(2)))
      setCropHeight(Number(nextHeight.toFixed(2)))
    }

    const handlePointerUp = () => {
      dragStateRef.current = null
      setIsDraggingCrop(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [previewGeometry.imageHeight, previewGeometry.imageWidth])

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
    setCropX(10)
    setCropY(10)
    setCropWidth(80)
    setCropHeight(80)
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('cropImageCardDesc') })
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
      setCropX(10)
      setCropY(10)
      setCropWidth(80)
      setCropHeight(80)
      setNotice({ tone: 'success', title: t('imageLoaded'), message: t('imageReadyToCrop') })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: t('imageLoadErrorTitle'),
        message: error instanceof Error && error.message !== 'IMAGE_LOAD_FAILED' ? error.message : t('imageLoadErrorMessage'),
      })
    }
  }

  const handleCrop = async () => {
    if (!upload) {
      setNotice({ tone: 'error', title: t('imageMissing'), message: t('selectImageFirst') })
      return
    }

    setIsProcessing(true)
    clearResult()

    try {
      const image = await loadImageElement(upload.file)
      const cropPixelX = Math.round((cropX / 100) * image.naturalWidth)
      const cropPixelY = Math.round((cropY / 100) * image.naturalHeight)
      const cropPixelWidth = Math.max(1, Math.round((cropWidth / 100) * image.naturalWidth))
      const cropPixelHeight = Math.max(1, Math.round((cropHeight / 100) * image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = cropPixelWidth
      canvas.height = cropPixelHeight
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error(t('imageConvertErrorMessage'))
      }

      if (upload.file.type === 'image/jpeg') {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }

      context.drawImage(
        image,
        cropPixelX,
        cropPixelY,
        cropPixelWidth,
        cropPixelHeight,
        0,
        0,
        cropPixelWidth,
        cropPixelHeight,
      )

      const blob = await canvasToImageBlob(canvas, getImageMimeType(upload.file))
      const nextResult: ConvertedImageResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: createEditedImageName(upload.file.name, 'recorte', getImageExtension(upload.file)),
        size: blob.size,
        format: upload.file.type === 'image/jpeg' ? 'jpeg' : upload.file.type === 'image/webp' ? 'webp' : 'png',
      }

      setResult(nextResult)
      setNotice({ tone: 'success', title: t('cropImageCompleted'), message: t('cropImageCompletedMessage') })
    } catch (error) {
      setNotice({ tone: 'error', title: t('cropImageError'), message: error instanceof Error ? error.message : t('imageConvertErrorMessage') })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCropDragStart = (event: ReactPointerEvent<HTMLElement>, mode: CropHandle = 'move') => {
    if (!cropFrameRef.current) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      initialCropX: cropX,
      initialCropY: cropY,
      initialCropWidth: cropWidth,
      initialCropHeight: cropHeight,
      mode,
    }
    setIsDraggingCrop(true)
  }

  const handleMap = [
    { key: 'nw', className: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
    { key: 'n', className: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize' },
    { key: 'ne', className: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
    { key: 'e', className: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize' },
    { key: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize' },
    { key: 's', className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize' },
    { key: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize' },
    { key: 'w', className: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize' },
  ] satisfies Array<{ key: CropHandle; className: string }>

  return (
    <>
      <SectionHero
        badge={t('cropImageBadge')}
        title={t('cropImageTitle')}
        description={t('cropImageDesc')}
        aside={
          <div className="rounded-[1.6rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.78)] sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{t('formatsAvailable')}</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>{t('imageInputLine')}</li>
              <li>2. {t('keepFormat')}</li>
              <li>3. {t('cropImageHint')}</li>
            </ul>
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-4 sm:p-6 lg:p-8">
          <FileDropzone
            title={t('cropImageCardTitle')}
            description={t('cropImageCardDesc')}
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
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(380px,1.15fr)_minmax(0,0.85fr)] lg:gap-6">
              <div className="grid gap-4">
                <div className="panel-subtle overflow-hidden p-3">
                  <div ref={cropFrameRef} className="relative overflow-hidden rounded-[1.2rem] bg-slate-100">
                    <img src={upload.previewUrl} alt={upload.file.name} className="aspect-[4/3] h-full min-h-[360px] w-full object-contain lg:min-h-[520px]" />
                    <div className="pointer-events-none absolute inset-0 bg-slate-950/30" />
                    <div
                      className={`absolute border-2 border-white shadow-[0_0_0_999px_rgba(15,23,42,0.18)] ${isDraggingCrop ? 'cursor-grabbing' : 'cursor-grab'}`}
                      style={cropBoxStyle}
                      onPointerDown={(event) => handleCropDragStart(event, 'move')}
                    >
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                        {t('dragCropArea')}
                      </div>
                      {handleMap.map((handle) => (
                        <button
                          key={handle.key}
                          type="button"
                          aria-label={`${t('resizeCropArea')} ${handle.key}`}
                          className={`absolute h-4 w-4 rounded-full border-2 border-slate-950 bg-white shadow-sm ${handle.className}`}
                          onPointerDown={(event) => handleCropDragStart(event, handle.key)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {result ? (
                  <div className="panel-subtle overflow-hidden p-3">
                    <div className="overflow-hidden rounded-[1.2rem] bg-slate-100">
                      <img src={result.url} alt={result.fileName} className="aspect-square h-full w-full object-contain sm:aspect-[4/3]" />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p><p className="mt-2 break-words text-sm font-semibold text-slate-900">{upload.file.name}</p></div>
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(upload.file.size)}</p></div>
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('format')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{sourceLabel}</p></div>
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('resolution')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{upload.width}x{upload.height}</p></div>
                </div>

                <div className="panel-subtle p-5 sm:p-6">
                  <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
                    {t('cropDragHint')}
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleCrop} disabled={isProcessing}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M7 4v10a3 3 0 0 0 3 3h10" /><path d="M4 7h10a3 3 0 0 1 3 3v10" /></svg>
                      {isProcessing ? t('croppingImage') : t('cropImageBtn')}
                    </button>
                    <button type="button" className="btn-secondary w-full sm:w-auto" onClick={clearAll} disabled={isProcessing || !upload}>
                      {t('clearContent')}
                    </button>
                    {result ? <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M12 4v10" /><path d="m8 10 4 4 4-4" /><path d="M5 19h14" /></svg>{t('downloadCroppedImage')}</button> : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6"><EmptyState badge={t('noImage')} title={t('emptyCropImageTitle')} description={t('emptyCropImageDesc')} /></div>
          )}
        </section>

        <section className="panel p-4 sm:p-6 lg:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('cropStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('cropStatusDesc')}</p>

          <div className="mt-6 grid gap-4">
            {result ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-700">{t('outputReady')}</p><p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p></div> : null}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">{t('cropImageHint')}</div>
          </div>
        </section>
      </div>
    </>
  )
}
