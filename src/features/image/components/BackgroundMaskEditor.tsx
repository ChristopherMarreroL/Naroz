import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type BrushTool = 'erase' | 'restore'

interface BackgroundMaskEditorProps {
  disabled?: boolean
  onApply: (blob: Blob) => void
  onClose: () => void
  resultUrl: string
  sourceUrl: string
  t: (key: string) => string
}

interface Point {
  x: number
  y: number
}

const MAX_UNDO_PIXELS = 8_000_000

function loadCanvasImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('MASK_EDITOR_IMAGE_LOAD_FAILED'))
    image.src = url
  })
}

function exportPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('MASK_EDITOR_EXPORT_FAILED'))
    }, 'image/png')
  })
}

export function BackgroundMaskEditor({
  disabled = false,
  onApply,
  onClose,
  resultUrl,
  sourceUrl,
  t,
}: BackgroundMaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasStageRef = useRef<HTMLDivElement | null>(null)
  const brushCursorRef = useRef<HTMLDivElement | null>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const initialImageRef = useRef<HTMLImageElement | null>(null)
  const undoRef = useRef<ImageData | null>(null)
  const undoHadChangesRef = useRef(false)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<Point | null>(null)
  const [brushTool, setBrushTool] = useState<BrushTool>('erase')
  const [brushSize, setBrushSize] = useState(32)
  const [hasChanges, setHasChanges] = useState(false)
  const [hasUndo, setHasUndo] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const hideBrushCursor = () => {
    const cursor = brushCursorRef.current
    if (cursor) cursor.style.opacity = '0'
  }

  const updateBrushCursor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const stage = canvasStageRef.current
    const cursor = brushCursorRef.current
    if (!canvas || !stage || !cursor || !isReady || disabled || isApplying) {
      hideBrushCursor()
      return false
    }

    const canvasBounds = canvas.getBoundingClientRect()
    const stageBounds = stage.getBoundingClientRect()
    const isInside = event.clientX >= canvasBounds.left
      && event.clientX <= canvasBounds.right
      && event.clientY >= canvasBounds.top
      && event.clientY <= canvasBounds.bottom
    const x = Math.min(canvasBounds.width, Math.max(0, event.clientX - canvasBounds.left))
    const y = Math.min(canvasBounds.height, Math.max(0, event.clientY - canvasBounds.top))

    cursor.style.left = `${canvasBounds.left - stageBounds.left + x}px`
    cursor.style.top = `${canvasBounds.top - stageBounds.top + y}px`
    cursor.style.opacity = isInside || drawingRef.current ? '1' : '0'
    return isInside
  }

  useEffect(() => {
    let isCurrent = true
    setIsReady(false)
    setLoadFailed(false)
    setHasChanges(false)
    setHasUndo(false)
    undoRef.current = null
    undoHadChangesRef.current = false

    Promise.all([loadCanvasImage(sourceUrl), loadCanvasImage(resultUrl)])
      .then(([sourceImage, resultImage]) => {
        if (!isCurrent) return
        const canvas = canvasRef.current
        if (!canvas) return

        canvas.width = resultImage.naturalWidth
        canvas.height = resultImage.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('MASK_EDITOR_CANVAS_UNAVAILABLE')
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(resultImage, 0, 0, canvas.width, canvas.height)

        const sourceCanvas = document.createElement('canvas')
        sourceCanvas.width = canvas.width
        sourceCanvas.height = canvas.height
        const sourceContext = sourceCanvas.getContext('2d')
        if (!sourceContext) throw new Error('MASK_EDITOR_SOURCE_CANVAS_UNAVAILABLE')
        sourceContext.drawImage(sourceImage, 0, 0, canvas.width, canvas.height)

        sourceCanvasRef.current = sourceCanvas
        initialImageRef.current = resultImage
        setIsReady(true)
      })
      .catch((error) => {
        console.error('Background mask editor failed to load', error)
        if (isCurrent) setLoadFailed(true)
      })

    return () => {
      isCurrent = false
      sourceCanvasRef.current = null
      initialImageRef.current = null
      undoRef.current = null
      undoHadChangesRef.current = false
    }
  }, [resultUrl, sourceUrl])

  useEffect(() => {
    if (!isReady || disabled || isApplying) hideBrushCursor()
  }, [disabled, isApplying, isReady])

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return null
    return {
      x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height,
    }
  }

  const drawBrush = (from: Point, to: Point) => {
    const canvas = canvasRef.current
    const sourceCanvas = sourceCanvasRef.current
    if (!canvas || !sourceCanvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const bounds = canvas.getBoundingClientRect()
    const scaledBrushSize = brushSize * canvas.width / Math.max(1, bounds.width)
    context.save()
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = scaledBrushSize
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)

    if (brushTool === 'erase') {
      context.globalCompositeOperation = 'destination-out'
      context.strokeStyle = '#000'
    } else {
      const sourcePattern = context.createPattern(sourceCanvas, 'no-repeat')
      if (!sourcePattern) {
        context.restore()
        return
      }
      context.globalCompositeOperation = 'source-over'
      context.strokeStyle = sourcePattern
    }

    context.stroke()
    if (from.x === to.x && from.y === to.y) {
      context.beginPath()
      context.arc(to.x, to.y, scaledBrushSize / 2, 0, Math.PI * 2)
      context.fillStyle = context.strokeStyle
      context.fill()
    }
    context.restore()
    setHasChanges(true)
  }

  const saveUndo = () => {
    const canvas = canvasRef.current
    if (!canvas || canvas.width * canvas.height > MAX_UNDO_PIXELS) {
      undoRef.current = null
      setHasUndo(false)
      return
    }
    const context = canvas.getContext('2d')
    if (!context) return
    undoRef.current = context.getImageData(0, 0, canvas.width, canvas.height)
    undoHadChangesRef.current = hasChanges
    setHasUndo(true)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isReady || disabled || isApplying) return
    updateBrushCursor(event)
    const point = getCanvasPoint(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    saveUndo()
    drawingRef.current = true
    lastPointRef.current = point
    drawBrush(point, point)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    updateBrushCursor(event)
    if (!drawingRef.current) return
    const point = getCanvasPoint(event)
    const previous = lastPointRef.current
    if (!point || !previous) return
    drawBrush(previous, point)
    lastPointRef.current = point
  }

  const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPointRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    updateBrushCursor(event)
  }

  const handleUndo = () => {
    const canvas = canvasRef.current
    const undo = undoRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !undo) return
    context.putImageData(undo, 0, 0)
    setHasChanges(undoHadChangesRef.current)
    undoRef.current = null
    undoHadChangesRef.current = false
    setHasUndo(false)
  }

  const handleReset = () => {
    const canvas = canvasRef.current
    const initialImage = initialImageRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !initialImage) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(initialImage, 0, 0, canvas.width, canvas.height)
    undoRef.current = null
    undoHadChangesRef.current = false
    setHasUndo(false)
    setHasChanges(false)
  }

  const handleApply = async () => {
    const canvas = canvasRef.current
    if (!canvas || !hasChanges) return
    setIsApplying(true)
    try {
      onApply(await exportPng(canvas))
    } catch (error) {
      console.error('Background mask editor failed to export', error)
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <section className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-950 text-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.9)]">
      <div className="border-b border-white/10 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-white">{t('backgroundRefineTitle')}</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">{t('backgroundRefineDesc')}</p>
          </div>
          <button type="button" className="self-start rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10" onClick={onClose} disabled={disabled || isApplying}>
            {t('backgroundCloseEditor')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:p-5">
        <div
          ref={canvasStageRef}
          className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-2xl border border-white/10"
          style={{
            backgroundColor: '#f8fafc',
            backgroundImage: 'linear-gradient(45deg, #dbe4ef 25%, transparent 25%), linear-gradient(-45deg, #dbe4ef 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #dbe4ef 75%), linear-gradient(-45deg, transparent 75%, #dbe4ef 75%)',
            backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
            backgroundSize: '24px 24px',
          }}
        >
          <canvas
            ref={canvasRef}
            className={`block max-h-[560px] max-w-full touch-none object-contain ${isReady && !disabled && !isApplying ? 'cursor-none' : ''}`}
            aria-label={t('backgroundRefineCanvasLabel')}
            onPointerDown={handlePointerDown}
            onPointerEnter={updateBrushCursor}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => {
              if (!drawingRef.current) hideBrushCursor()
            }}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
          />
          <div
            ref={brushCursorRef}
            aria-hidden="true"
            className={`pointer-events-none absolute z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white opacity-0 shadow-[0_0_0_1px_rgba(15,23,42,0.8)] transition-[width,height,background-color,opacity] duration-75 ${brushTool === 'erase' ? 'bg-rose-400/20' : 'bg-emerald-300/20'}`}
            style={{
              width: brushSize,
              height: brushSize,
              boxShadow: brushTool === 'erase'
                ? '0 0 0 1px rgba(15,23,42,0.85), 0 0 0 3px rgba(251,113,133,0.65)'
                : '0 0 0 1px rgba(15,23,42,0.85), 0 0 0 3px rgba(110,231,183,0.65)',
            }}
          >
            <span className={`h-1.5 w-1.5 rounded-full border border-slate-950/70 ${brushTool === 'erase' ? 'bg-rose-300' : 'bg-emerald-200'}`} />
          </div>
          {!isReady ? (
            <div className="absolute inset-0 grid place-items-center bg-slate-950/75 px-6 text-center text-sm font-semibold text-white">
              {loadFailed ? t('backgroundRefineLoadError') : t('backgroundRefineLoading')}
            </div>
          ) : null}
        </div>

        <div className="grid content-start gap-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
            <button
              type="button"
              aria-pressed={brushTool === 'erase'}
              className={`rounded-xl px-3 py-2.5 text-xs font-bold transition ${brushTool === 'erase' ? 'bg-rose-400 text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}
              onClick={() => setBrushTool('erase')}
              disabled={disabled || isApplying}
            >
              {t('backgroundBrushErase')}
            </button>
            <button
              type="button"
              aria-pressed={brushTool === 'restore'}
              className={`rounded-xl px-3 py-2.5 text-xs font-bold transition ${brushTool === 'restore' ? 'bg-emerald-300 text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}
              onClick={() => setBrushTool('restore')}
              disabled={disabled || isApplying}
            >
              {t('backgroundBrushRestore')}
            </button>
          </div>

          <label className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
            <span className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
              {t('backgroundBrushSize')}
              <span>{brushSize}px</span>
            </span>
            <input
              type="range"
              min="8"
              max="128"
              step="2"
              value={brushSize}
              className="w-full cursor-pointer accent-white"
              onChange={(event) => setBrushSize(Number(event.target.value))}
              disabled={disabled || isApplying}
            />
          </label>

          <p className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-3 text-xs leading-5 text-sky-100">
            {brushTool === 'erase' ? t('backgroundBrushEraseHint') : t('backgroundBrushRestoreHint')}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl border border-white/15 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-40" onClick={handleUndo} disabled={!hasUndo || disabled || isApplying}>
              {t('backgroundUndo')}
            </button>
            <button type="button" className="rounded-xl border border-white/15 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-40" onClick={handleReset} disabled={!hasChanges || disabled || isApplying}>
              {t('resetChanges')}
            </button>
          </div>

          <button type="button" className="rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void handleApply()} disabled={!hasChanges || disabled || isApplying}>
            {isApplying ? t('backgroundApplyingRefinement') : t('backgroundApplyRefinement')}
          </button>
        </div>
      </div>
    </section>
  )
}
