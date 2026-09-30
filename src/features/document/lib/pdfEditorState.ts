import type { PdfOverlay } from './pdfEditor'

export type EditorHistory = { entries: PdfOverlay[][]; index: number }
export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'
export type AlignmentGuides = { x?: number; y?: number }

export function sameElements(a: PdfOverlay[], b: PdfOverlay[]) {
  return a.length === b.length && a.every((item, index) => {
    const other = b[index]
    return Object.keys(item).every((key) => item[key as keyof PdfOverlay] === other[key as keyof PdfOverlay]) && Object.keys(other).every((key) => item[key as keyof PdfOverlay] === other[key as keyof PdfOverlay])
  })
}

function retainedImagesFit(items: PdfOverlay[]) {
  const sources = new Set(items.filter((item) => item.text === undefined).map((item) => item.src))
  return sources.size <= 30 && [...sources].reduce((total, src) => total + src.length, 0) <= 32_000_000
}

export function imageBudget(items: PdfOverlay[]) {
  return items.length <= 100 && retainedImagesFit(items)
}

/** Evict oldest undo snapshots when their images exceed the retained-memory budget. */
export function appendHistory(state: EditorHistory, next: PdfOverlay[]): EditorHistory {
  if (!imageBudget(next)) throw new Error('resource budget')
  if (sameElements(state.entries[state.index], next)) return state
  const entries = [...state.entries.slice(0, state.index + 1), next].slice(-51)
  while (entries.length > 1 && !retainedImagesFit(entries.flat())) {
    entries.shift()
  }
  return { entries, index: entries.length - 1 }
}

export function overlayBounds(item: PdfOverlay, ratio: number) {
  const radians = (item.rotation ?? 0) * Math.PI / 180
  const width = Math.abs(Math.cos(radians)) * item.width + Math.abs(Math.sin(radians)) * item.height / ratio
  const height = Math.abs(Math.sin(radians)) * item.width * ratio + Math.abs(Math.cos(radians)) * item.height
  const cx = item.x + item.width / 2, cy = item.y + item.height / 2
  return { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2, width, height, cx, cy }
}

export function fitOverlay(item: PdfOverlay, ratio: number) {
  const next = { ...item }
  let bounds = overlayBounds(next, ratio)
  const scale = Math.min(1, 1 / bounds.width, 1 / bounds.height)
  next.width *= scale; next.height *= scale
  next.x = bounds.cx - next.width / 2; next.y = bounds.cy - next.height / 2
  bounds = overlayBounds(next, ratio)
  next.x += Math.max(0, -bounds.left) - Math.max(0, bounds.right - 1)
  next.y += Math.max(0, -bounds.top) - Math.max(0, bounds.bottom - 1)
  return next
}

export function resizeOverlay(item: PdfOverlay, corner: ResizeCorner, dx: number, dy: number, ratio: number) {
  const sx = corner.endsWith('e') ? 1 : -1, sy = corner.startsWith('s') ? 1 : -1
  const angle = (item.rotation ?? 0) * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const width = item.width, height = item.height / ratio
  const localX = cos * dx + sin * dy / ratio, localY = -sin * dx + cos * dy / ratio
  const wanted = Math.max(.05, 1 + (localX * sx * width + localY * sy * height) / (width * width + height * height))
  const at = (factor: number) => {
    const offsetX = sx * width * (factor - 1) / 2, offsetY = sy * height * (factor - 1) / 2
    const cx = item.x + width / 2 + cos * offsetX - sin * offsetY
    const cy = item.y + item.height / 2 + (sin * offsetX + cos * offsetY) * ratio
    return { ...item, x: cx - width * factor / 2, y: cy - item.height * factor / 2, width: width * factor, height: item.height * factor }
  }
  const fits = (factor: number) => { const b = overlayBounds(at(factor), ratio); return b.left >= -1e-8 && b.top >= -1e-8 && b.right <= 1 + 1e-8 && b.bottom <= 1 + 1e-8 }
  if (fits(wanted)) return at(wanted)
  let low = wanted < 1 ? .05 : 1, high = wanted
  for (let step = 0; step < 32; step++) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid }
  return at(low)
}

/** Apply the same local-corner gesture for keyboard and pointer resizing, including rotation. */
export function resizeOverlayByFactor(item: PdfOverlay, corner: ResizeCorner, factor: number, ratio: number) {
  const sx = corner.endsWith('e') ? 1 : -1, sy = corner.startsWith('s') ? 1 : -1
  const angle = (item.rotation ?? 0) * Math.PI / 180
  const x = sx * item.width * (factor - 1), y = sy * item.height / ratio * (factor - 1)
  return resizeOverlay(item, corner, Math.cos(angle) * x - Math.sin(angle) * y, (Math.sin(angle) * x + Math.cos(angle) * y) * ratio, ratio)
}

export function snapOverlay(item: PdfOverlay, others: PdfOverlay[], ratio: number, thresholdX: number, thresholdY: number) {
  let next = fitOverlay(item, ratio)
  const bounds = overlayBounds(next, ratio)
  const xTargets = [0, .5, 1], yTargets = [0, .5, 1]
  for (const other of others) {
    if (other.id === item.id || other.page !== item.page) continue
    const b = overlayBounds(other, ratio)
    xTargets.push(b.left, b.cx, b.right); yTargets.push(b.top, b.cy, b.bottom)
  }
  const nearest = (points: number[], targets: number[], threshold: number) => {
    let best: { delta: number; guide: number } | undefined
    for (const point of points) for (const target of targets) {
      const delta = target - point
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, guide: target }
    }
    return best
  }
  const x = nearest([bounds.left, bounds.cx, bounds.right], xTargets, thresholdX)
  const y = nearest([bounds.top, bounds.cy, bounds.bottom], yTargets, thresholdY)
  next = fitOverlay({ ...next, x: next.x + (x?.delta ?? 0), y: next.y + (y?.delta ?? 0) }, ratio)
  const guides: AlignmentGuides = {}
  if (x && Math.abs(next.x - item.x - x.delta) < thresholdX) guides.x = x.guide
  if (y && Math.abs(next.y - item.y - y.delta) < thresholdY) guides.y = y.guide
  return { item: next, guides }
}
