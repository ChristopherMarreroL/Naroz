import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { beginPdfStroke, type DrawingPoint, type PdfBrush } from './lib/pdfDrawing'
import type { PdfOverlay } from './lib/pdfEditor'

type Props = {
  ratio: number
  color: string
  size: number
  brush: PdfBrush
  disabled: boolean
  label: string
  eraserPathId: string
  onCommit: (drawing: Pick<PdfOverlay, 'src' | 'x' | 'y' | 'width' | 'height' | 'opacity'>) => void | Promise<void>
  onActive: (active: boolean) => void
  onError: () => void
}

export function PdfDrawingSurface({ ratio, color, size, brush, disabled, label, eraserPathId, onCommit, onActive, onError }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const eraserPath = useRef<SVGPathElement>(null)
  const livePath = useRef('')
  const liveSamples = useRef(0)
  const frame = useRef<number | null>(null)
  const mounted = useRef(true)
  const stroke = useRef<ReturnType<typeof beginPdfStroke> | null>(null)
  const pointer = useRef<number | 'keyboard' | null>(null)
  const cursor = useRef<DrawingPoint>({ x: .5, y: .5 })
  const [keyboardCursor, setKeyboardCursor] = useState<DrawingPoint | null>(null)
  const activeCallback = useRef(onActive)
  useEffect(() => { activeCallback.current = onActive }, [onActive])
  useEffect(() => {
    const target = canvas.current!
    mounted.current = true
    return () => { mounted.current = false; stroke.current = null; pointer.current = null; if (frame.current !== null) cancelAnimationFrame(frame.current); target.width = target.height = 0; activeCallback.current(false) }
  }, [])
  const reset = () => {
    stroke.current = null; pointer.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null; livePath.current = ''; liveSamples.current = 0
    eraserPath.current?.setAttribute('d', '')
    if (canvas.current) canvas.current.width = canvas.current.height = 0
    if (mounted.current) onActive(false)
  }
  const previewPoint = (point: DrawingPoint, first = false) => {
    if (brush !== 'eraser') return
    // Bound the temporary vector path as well as the raster gesture mask.
    if (++liveSamples.current > 20_000) throw new Error('drawing gesture limit')
    const x = (Math.max(0, Math.min(1, point.x)) * 900).toFixed(2)
    const y = (Math.max(0, Math.min(1, point.y)) * 900 / ratio).toFixed(2)
    livePath.current = first ? `M${x} ${y}l0.001 0` : `${livePath.current}L${x} ${y}`
    if (first) eraserPath.current?.setAttribute('d', livePath.current)
    else if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; eraserPath.current?.setAttribute('d', livePath.current) })
  }
  const moveStroke = (point: DrawingPoint) => {
    if (!stroke.current) return
    try { stroke.current.move(point); previewPoint(point) }
    catch { reset(); onError() }
  }
  const begin = (point: DrawingPoint) => {
    if (disabled || stroke.current || !canvas.current) return false
    try {
      stroke.current = beginPdfStroke(canvas.current, ratio, color, size, brush, point)
      canvas.current.style.opacity = brush === 'eraser' ? '0' : String(stroke.current.opacity)
      previewPoint(point, true)
      onActive(true)
      return true
    } catch { reset(); onError(); return false }
  }
  const finish = (cancel = false) => {
    const current = stroke.current
    if (!current) return
    stroke.current = null; pointer.current = null
    if (cancel) { reset(); return }
    eraserPath.current?.setAttribute('d', livePath.current)
    try {
      const pending = onCommit(current.finish())
      if (pending) { void pending.catch(() => { if (mounted.current) onError() }).finally(reset); return }
    } catch { onError() }
    reset()
  }
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }
  }
  return <>
    <svg width="0" height="0" className="pdf-editor-eraser-definitions" aria-hidden="true"><defs><path ref={eraserPath} id={eraserPathId} fill="none" stroke="black" strokeWidth={size} strokeLinecap="round" strokeLinejoin="round" /></defs></svg>
    <canvas ref={canvas} width={0} height={0} className="pdf-editor-drawing-surface" tabIndex={disabled ? -1 : 0} role="group" aria-label={label} aria-describedby="pdf-editor-writing-hint"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        event.stopPropagation(); event.preventDefault()
        if (event.button !== 0 || !event.isPrimary || pointer.current !== null) return
        event.currentTarget.focus({ preventScroll: true }); setKeyboardCursor(null)
        if (begin(point(event))) {
          pointer.current = event.pointerId
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { finish(true) }
        }
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) return
        event.stopPropagation(); event.preventDefault()
        moveStroke(point(event))
      }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) return
        event.stopPropagation(); moveStroke(point(event)); finish()
      }}
      onPointerCancel={(event) => { if (pointer.current === event.pointerId) finish(true) }}
      onLostPointerCapture={(event) => { if (pointer.current === event.pointerId) finish(true) }}
      onBlur={() => { finish(true); setKeyboardCursor(null) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(true); return }
        if (disabled || event.ctrlKey || event.metaKey || event.altKey) return
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault(); event.stopPropagation()
          if (event.repeat || (pointer.current !== null && pointer.current !== 'keyboard')) return
          if (pointer.current === 'keyboard') finish()
          else if (begin(cursor.current)) pointer.current = 'keyboard'
          setKeyboardCursor(cursor.current)
        }
        const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
        if (offsets[event.key] && (pointer.current === null || pointer.current === 'keyboard')) {
          event.preventDefault(); event.stopPropagation()
          const [x, y] = offsets[event.key], step = event.shiftKey ? .04 : .005
          cursor.current = { x: Math.max(0, Math.min(1, cursor.current.x + x * step)), y: Math.max(0, Math.min(1, cursor.current.y + y * step * ratio)) }
          setKeyboardCursor(cursor.current); moveStroke(cursor.current)
        }
      }} />
    {keyboardCursor && <span className="pdf-editor-drawing-cursor" aria-hidden="true" style={{ left: `${keyboardCursor.x * 100}%`, top: `${keyboardCursor.y * 100}%` }} />}
  </>
}
