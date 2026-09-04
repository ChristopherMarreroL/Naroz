import { PDFHexString, PDFName, type PDFPage } from 'pdf-lib'
import type { PDFPageProxy, TextContent, TextItem, TextStyle } from 'pdfjs-dist/types/src/display/api'
import type { PageViewport } from 'pdfjs-dist/types/src/display/page_viewport'
import { assertNotAborted, FileCompatibilityError } from './core'

export interface PdfWebLink { url: string; rect: [number, number, number, number] }
export const PDF_LINKS_PER_PAGE = 1000
export const PDF_LINKS_PER_OUTPUT = 10_000
const MAX_TEXT_ITEMS = 100_000
const MAX_TEXT_CHARACTERS = 2_000_000
const MAX_RUN_CHARACTERS = 8192

/** Only passive, user-activated URI actions; never copy arbitrary PDF action dictionaries. */
export function safePdfLinkUrl(value: unknown): string | null {
  // eslint-disable-next-line no-control-regex -- Reject embedded URI control characters.
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\u0000-\u001f\u007f]/u.test(value)) return null
  try {
    const url = new URL(/^www\./i.test(value) ? `http://${value}` : value)
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return null
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname) return null
    return url.href
  } catch { return null }
}

export function outputLinkRect(rect: unknown, viewport: Pick<PageViewport, 'transform' | 'width' | 'height'>): PdfWebLink['rect'] | null {
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every((number) => typeof number === 'number' && Number.isFinite(number))) return null
  const [a, b, c, d, e, f] = viewport.transform
  const [x1, y1] = [a * rect[0] + c * rect[1] + e, b * rect[0] + d * rect[1] + f]
  const [x2, y2] = [a * rect[2] + c * rect[3] + e, b * rect[2] + d * rect[3] + f]
  const result: PdfWebLink['rect'] = [
    Math.max(0, Math.min(x1, x2)), Math.max(0, viewport.height - Math.max(y1, y2)),
    Math.min(viewport.width, Math.max(x1, x2)), Math.min(viewport.height, viewport.height - Math.min(y1, y2)),
  ]
  return result.every(Number.isFinite) && result[2] > result[0] && result[3] > result[1] ? result : null
}

function overlaps(a: PdfWebLink['rect'], b: PdfWebLink['rect']) {
  return Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1])
}

interface TextPiece { item: TextItem; style: TextStyle | undefined; start: number }

function usableText(item: TextItem, style?: TextStyle) {
  return item.dir === 'ltr' && !style?.vertical && item.width > 0 && Number.isFinite(item.width)
    && item.transform.length === 6 && item.transform.every((value: unknown) => typeof value === 'number' && Number.isFinite(value))
    && Math.hypot(item.transform[0], item.transform[1]) > 0 && Math.hypot(item.transform[2], item.transform[3]) > 0
}

/** Join adjacent glyph/text fragments only when they share a baseline and have no word gap. */
function adjacent(previous: TextItem, next: TextItem) {
  if (previous.hasEOL) return false
  const [a, b, c, d, x, y] = previous.transform as number[]
  const length = Math.hypot(a, b)
  const nextLength = Math.hypot(next.transform[0], next.transform[1])
  const tolerance = Math.max(0.1, Math.hypot(c, d) * 0.08)
  return Math.abs(a / length - next.transform[0] / nextLength) < 0.01
    && Math.abs(b / length - next.transform[1] / nextLength) < 0.01
    && Math.hypot(next.transform[4] - (x + a / length * previous.width), next.transform[5] - (y + b / length * previous.width)) <= tolerance
}

function textRect(piece: TextPiece, from: number, to: number, context: CanvasRenderingContext2D) {
  const { item, style } = piece
  const [a, b, c, d, x, y] = item.transform as number[]
  const baseline = Math.hypot(a, b)
  const fontHeight = Math.hypot(c, d)
  // PDF.js gives whole-item advances. Measure substrings and scale to that known advance.
  // Entire-item URLs use their exact PDF bounds without relying on substitute-font metrics.
  context.font = `100px ${style?.fontFamily === 'monospace' ? 'monospace' : style?.fontFamily === 'serif' ? 'serif' : 'sans-serif'}`
  const measured = context.measureText(item.str).width
  const fraction = (offset: number) => offset === 0 ? 0 : offset === item.str.length ? 1
    : measured > 0 ? context.measureText(item.str.slice(0, offset)).width / measured : offset / item.str.length
  const start = Math.max(0, Math.min(1, fraction(from))) * item.width
  const end = Math.max(0, Math.min(1, fraction(to))) * item.width
  const ascent = Number.isFinite(style?.ascent) ? Math.min(2, Math.max(0, style!.ascent)) : 0.9
  const descent = Number.isFinite(style?.descent) ? Math.max(-1, Math.min(0, style!.descent)) : -0.2
  const corners = [start, end].flatMap((advance) => [descent, ascent].map((height) => [
    x + a / baseline * advance + c / fontHeight * height * fontHeight,
    y + b / baseline * advance + d / fontHeight * height * fontHeight,
  ]))
  return [Math.min(...corners.map((point) => point[0])), Math.min(...corners.map((point) => point[1])),
    Math.max(...corners.map((point) => point[0])), Math.max(...corners.map((point) => point[1]))]
}

export async function collectPdfPageLinks(page: PDFPageProxy, context: CanvasRenderingContext2D, signal?: AbortSignal): Promise<PdfWebLink[]> {
  assertNotAborted(signal)
  const viewport = page.getViewport({ scale: 1 })
  const annotations: unknown[] = await page.getAnnotations({ intent: 'display' })
  assertNotAborted(signal)
  if (annotations.length > PDF_LINKS_PER_PAGE) throw new FileCompatibilityError('PDF_LINK_LIMIT')
  const links: PdfWebLink[] = []
  for (const data of annotations) {
    if (!data || typeof data !== 'object') continue
    const annotation = data as Record<string, unknown>
    if (annotation.annotationType !== 2 || (typeof annotation.annotationFlags === 'number' && (annotation.annotationFlags & 35))) continue
    const url = safePdfLinkUrl(annotation.url)
    const rect = outputLinkRect(annotation.rect, viewport)
    if (url && rect) links.push({ url, rect })
  }
  const explicitLinks = [...links]
  let text = ''
  let pieces: TextPiece[] = []
  const flush = () => {
    // eslint-disable-next-line no-control-regex -- Bound URL matches at PDF text control characters.
    for (const match of text.matchAll(/(?<![\w@./-])(?:https?:\/\/[^\s<>"'\u0000-\u001f\u007f]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b(?:[/?#][^\s<>"'\u0000-\u001f\u007f]*)?)/giu)) {
      if (match[0].length > 2048) continue
      let candidate = match[0].replace(/[.,;:!?]+$/u, '')
      for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
        let excess = candidate.split(close).length - candidate.split(open).length
        let end = candidate.length
        while (end > 0 && candidate[end - 1] === close && excess > 0) { end--; excess-- }
        candidate = candidate.slice(0, end)
      }
      const url = safePdfLinkUrl(/^(?:https?:\/\/|www\.)/i.test(candidate) ? candidate : `https://${candidate}`)
      if (!url) continue
      const end = match.index + candidate.length
      for (const piece of pieces) {
        const from = Math.max(0, match.index - piece.start)
        const to = Math.min(piece.item.str.length, end - piece.start)
        if (to <= from) continue
        const rect = outputLinkRect(textRect(piece, from, to, context), viewport)
        // An explicit link may intentionally have a destination different from its label.
        if (rect && !explicitLinks.some((link) => overlaps(link.rect, rect))) {
          if (links.length >= PDF_LINKS_PER_PAGE) throw new FileCompatibilityError('PDF_LINK_LIMIT')
          links.push({ url, rect })
        }
      }
    }
    text = ''; pieces = []
  }
  const reader = (page.streamTextContent() as ReadableStream<TextContent>).getReader()
  let cancelled: Promise<void> | undefined
  const cancel = () => { cancelled ??= reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', cancel, { once: true })
  let itemCount = 0
  let characterCount = 0
  const styles = new Map<string, TextStyle>()
  let finished = false
  try {
    while (true) {
      assertNotAborted(signal)
      const { value, done } = await reader.read()
      assertNotAborted(signal)
      if (done) { finished = true; break }
      for (const [name, style] of Object.entries(value.styles)) {
        styles.set(name, style)
        if (styles.size > 1000) throw new FileCompatibilityError('PDF_LINK_LIMIT')
      }
      for (const item of value.items) {
        if (!('str' in item)) continue
        itemCount++; characterCount += item.str.length
        if (itemCount > MAX_TEXT_ITEMS || characterCount > MAX_TEXT_CHARACTERS) throw new FileCompatibilityError('PDF_LINK_LIMIT')
        const style = styles.get(item.fontName)
        if (!usableText(item, style) || item.str.length > MAX_RUN_CHARACTERS) { flush(); continue }
        const previous = pieces.at(-1)?.item
        if (text.length + item.str.length > MAX_RUN_CHARACTERS || (previous && !adjacent(previous, item))) flush()
        pieces.push({ item, style, start: text.length }); text += item.str
        if (item.hasEOL) flush()
      }
    }
    flush()
    return links
  } finally {
    signal?.removeEventListener('abort', cancel)
    if (!finished) cancel()
    await cancelled
    reader.releaseLock()
  }
}

export function addPdfPageLinks(page: PDFPage, links: PdfWebLink[]) {
  for (const { url, rect } of links) {
    const annotation = page.doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFHexString.of(Array.from(new TextEncoder().encode(url), (byte) => byte.toString(16).padStart(2, '0')).join('')) },
      P: page.ref,
    })
    annotation.set(PDFName.of('F'), page.doc.context.obj(4))
    page.node.addAnnot(page.doc.context.register(annotation))
  }
}
