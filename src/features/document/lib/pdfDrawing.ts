import type { PdfOverlay } from './pdfEditor'
import { imageBudget, overlayBounds } from './pdfEditorState'

export type PdfBrush = 'round' | 'square' | 'marker' | 'eraser'
export type PdfStroke = Pick<PdfOverlay, 'src' | 'x' | 'y' | 'width' | 'height' | 'opacity'>
export type DrawingPoint = { x: number; y: number }

/** One bounded canvas per gesture; no growing list of pointer samples is retained. */
export function beginPdfStroke(canvas: HTMLCanvasElement, ratio: number, color: string, size: number, brush: PdfBrush, start: DrawingPoint) {
  if (!Number.isFinite(ratio) || ratio <= 0 || !/^#[0-9a-f]{6}$/i.test(color) || !Number.isFinite(size) || size < 1 || size > 40) throw new Error('invalid brush')
  canvas.width = Math.max(1, Math.round(Math.min(2048, 2048 * ratio)))
  canvas.height = Math.max(1, Math.round(Math.min(2048, 2048 / ratio)))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('drawing unavailable')
  const thickness = size * canvas.width / 900
  context.strokeStyle = context.fillStyle = brush === 'eraser' ? '#64748b' : color
  context.lineWidth = thickness
  context.lineCap = brush === 'round' || brush === 'eraser' ? 'round' : 'square'
  context.lineJoin = 'round'
  const point = (value: DrawingPoint) => ({ x: Math.max(0, Math.min(1, value.x)) * canvas.width, y: Math.max(0, Math.min(1, value.y)) * canvas.height })
  let previous = point(start)
  let left = previous.x, top = previous.y, right = left, bottom = top
  if (brush === 'round' || brush === 'eraser') {
    context.beginPath(); context.arc(left, top, thickness / 2, 0, Math.PI * 2); context.fill()
  } else context.fillRect(left - thickness / 2, top - thickness / 2, thickness, thickness)
  return {
    opacity: brush === 'marker' || brush === 'eraser' ? .3 : 1,
    move(value: DrawingPoint) {
      const next = point(value)
      context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(next.x, next.y); context.stroke()
      left = Math.min(left, next.x); right = Math.max(right, next.x)
      top = Math.min(top, next.y); bottom = Math.max(bottom, next.y)
      previous = next
    },
    finish() {
      const x = Math.max(0, Math.floor(left - thickness - 2)), y = Math.max(0, Math.floor(top - thickness - 2))
      const width = Math.min(canvas.width, Math.ceil(right + thickness + 2)) - x
      const height = Math.min(canvas.height, Math.ceil(bottom + thickness + 2)) - y
      const cropped = document.createElement('canvas')
      cropped.width = width; cropped.height = height
      try {
        const target = cropped.getContext('2d')
        if (!target) throw new Error('drawing unavailable')
        target.drawImage(canvas, x, y, width, height, 0, 0, width, height)
        return { src: cropped.toDataURL('image/png'), x: x / canvas.width, y: y / canvas.height, width: width / canvas.width, height: height / canvas.height, opacity: brush === 'marker' ? .3 : 1 }
      } finally { cropped.width = cropped.height = 0 }
    },
  }
}

/** Decode only bounded, locally generated PNGs; never fetch a URL to erase a stroke. */
async function drawingBitmap(src: string) {
  const prefix = 'data:image/png;base64,'
  if (!src.startsWith(prefix) || src.length > 32_000_000) throw new Error('drawing source')
  const bytes = Uint8Array.from(atob(src.slice(prefix.length)), (character) => character.charCodeAt(0))
  if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) throw new Error('drawing source')
  const header = new DataView(bytes.buffer)
  const width = header.getUint32(16), height = header.getUint32(20)
  if (!width || !height || width > 2048 || height > 2048) throw new Error('drawing dimensions')
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  if (bitmap.width !== width || bitmap.height !== height) { bitmap.close(); throw new Error('drawing dimensions') }
  return bitmap
}

/** One undoable eraser gesture. Original PDF content, imported images and text are untouched. */
export async function erasePdfStrokes(items: PdfOverlay[], page: number, ratio: number, mask: PdfStroke, cancelled: () => boolean = () => false) {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('drawing ratio')
  if (![mask.x, mask.y, mask.width, mask.height].every(Number.isFinite) || mask.x < 0 || mask.y < 0 || mask.width <= 0 || mask.height <= 0 || mask.x + mask.width > 1 + 1e-8 || mask.y + mask.height > 1 + 1e-8 || !imageBudget(items)) throw new Error('drawing budget')
  const candidates = items.filter((item) => {
    if (item.page !== page || item.kind !== 'drawing' || item.text !== undefined) return false
    const bounds = overlayBounds(item, ratio)
    return bounds.right >= mask.x && bounds.left <= mask.x + mask.width && bounds.bottom >= mask.y && bounds.top <= mask.y + mask.height
  })
  if (!candidates.length || cancelled()) return items
  const erased = new Map<string, PdfOverlay | null>()
  const result = () => items.flatMap((item) => erased.has(item.id) ? erased.get(item.id) ? [erased.get(item.id)!] : [] : [item])
  const maskBitmap = await drawingBitmap(mask.src)
  const canvas = document.createElement('canvas')
  try {
    for (const item of candidates) {
      if (cancelled()) return items
      const bitmap = await drawingBitmap(item.src)
      try {
        if (cancelled()) return items
        canvas.width = bitmap.width; canvas.height = bitmap.height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('drawing unavailable')
        context.drawImage(bitmap, 0, 0)
        const alphaSum = () => {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          let sum = 0
          for (let index = 3; index < pixels.length; index += 4) sum += pixels[index]
          return sum
        }
        const before = alphaSum()
        const angle = (item.rotation ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
        const a = bitmap.width / item.width * cos, b = -bitmap.height / item.height * sin * ratio
        const c = bitmap.width / item.width * sin / ratio, d = bitmap.height / item.height * cos
        const cx = item.x + item.width / 2, cy = item.y + item.height / 2
        context.setTransform(a, b, c, d, bitmap.width / 2 - a * cx - c * cy, bitmap.height / 2 - b * cx - d * cy)
        context.globalCompositeOperation = 'destination-out'
        context.drawImage(maskBitmap, mask.x, mask.y, mask.width, mask.height)
        const after = alphaSum()
        if (after !== before) {
          erased.set(item.id, after === 0 ? null : { ...item, src: canvas.toDataURL('image/png') })
          if (!imageBudget(result())) throw new Error('drawing budget')
        }
      } finally { bitmap.close(); canvas.width = canvas.height = 0 }
    }
    if (cancelled() || !erased.size) return items
    return result()
  } finally { maskBitmap.close(); canvas.width = canvas.height = 0 }
}
