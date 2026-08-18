import {
  Document,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Packer,
  Paragraph,
  SectionType,
  TabStopType,
  TextRun,
  VerticalPositionRelativeFrom,
} from 'docx'
import { GlobalWorkerOptions, Util, getDocument } from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

export const PDF_TO_OFFICE_MAX_SIZE = 25 * 1024 * 1024
export const PDF_TO_OFFICE_MAX_PAGES = 100
export const PDF_TO_OFFICE_MAX_TEXT_ITEMS = 100_000
export const PDF_TO_OFFICE_MAX_TEXT_CHARACTERS = 5_000_000
const PDF_COLOR_CANVAS_MAX_DIMENSION = 4096
const PDF_COLOR_CANVAS_MAX_PIXELS = 16_000_000
const PDF_COLOR_MAX_SAMPLES_PER_SPAN = 50_000
const PDF_COLOR_MAX_SAMPLES_PER_PAGE = 2_000_000
const PDF_FONT_METADATA_MAX_LOOKUPS = 64
const PDF_FONT_METADATA_MAX_ATTEMPTS_PER_FONT = 2
const PDF_VISUAL_DOCX_RENDER_SCALE = 4
const PDF_VISUAL_DOCX_MAX_IMAGE_BYTES = 100 * 1024 * 1024
const WORD_MAX_PAGE_POINTS = 22 * 72
const WORD_MAX_FONT_POINTS = WORD_MAX_PAGE_POINTS

export type PdfOfficeFormat = 'docx' | 'xlsx' | 'pptx'
export type PdfDocxMode = 'editable' | 'visual'

export interface PdfTextSpan {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontFamily: string
  fontSize: number
  bold: boolean
  italics: boolean
  ascent: number
  sourceIndex: number
}

export interface PdfTextLine {
  y: number
  height: number
  spans: PdfTextSpan[]
}

export interface PdfPageStructure {
  pageNumber: number
  width: number
  height: number
  rows: string[][]
  lines: PdfTextLine[]
}

export interface PdfStructure {
  pageCount: number
  textItems: number
  pages: PdfPageStructure[]
}

export type PdfConversionProgress = (completed: number, total: number) => void

interface PdfLoadingTaskGuard {
  destroy: () => Promise<void>
  dispose: () => void
}

function guardPdfLoadingTask(loadingTask: PDFDocumentLoadingTask, signal?: AbortSignal): PdfLoadingTaskGuard {
  let destroyPromise: Promise<void> | null = null
  const destroy = () => {
    if (destroyPromise) return destroyPromise

    try {
      destroyPromise = loadingTask.destroy().catch(() => undefined).then(() => undefined)
    } catch {
      destroyPromise = Promise.resolve()
    }
    return destroyPromise
  }
  const cancel = () => {
    void destroy()
  }

  if (signal) {
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
  }

  return {
    destroy,
    dispose: () => signal?.removeEventListener('abort', cancel),
  }
}

export function hasComplexPdfLayout(structure: PdfStructure) {
  return structure.pages.some((page) => {
    let separatedRows = 0

    for (const line of page.lines) {
      const spans = [...line.spans].sort((a, b) => a.x - b.x)
      if (spans.length >= 6) return true

      let separatedColumns = 0
      for (let index = 1; index < spans.length; index += 1) {
        const previous = spans[index - 1]
        const gap = spans[index].x - (previous.x + previous.width)
        if (gap > Math.max(18, spans[index].fontSize * 2.5)) separatedColumns += 1
      }
      if (separatedColumns >= 2) separatedRows += 1
    }

    return separatedRows >= 5
  })
}

function maxBy<T>(items: T[], getValue: (item: T) => number, initialValue: number) {
  return items.reduce((maximum, item) => Math.max(maximum, getValue(item)), initialValue)
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.pdf$/i, '') || 'documento'
}

export function getPdfOfficeFileName(fileName: string, format: PdfOfficeFormat) {
  return `${getBaseName(fileName)}-convertido.${format}`
}

export function isSupportedPdf(file: File) {
  return file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
}

function mergeNearbyItems(items: PdfTextSpan[]) {
  if (!items.length) {
    return []
  }

  const cells: string[] = []
  let currentText = items[0].text
  let currentEnd = items[0].x + items[0].width

  for (const item of items.slice(1)) {
    const averageCharacterWidth = item.text.length ? item.width / item.text.length : 4
    const gap = item.x - currentEnd

    if (gap <= Math.max(10, averageCharacterWidth * 2.2)) {
      currentText = `${currentText} ${item.text}`.replace(/\s+/g, ' ').trim()
    } else {
      cells.push(currentText.trim())
      currentText = item.text
    }

    currentEnd = Math.max(currentEnd, item.x + item.width)
  }

  cells.push(currentText.trim())
  return cells
}

function groupIntoLines(items: PdfTextSpan[]) {
  const bucketSize = 4
  const maxTolerance = 16
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Array<{ y: number; items: PdfTextSpan[]; bucket: number }> = []
  const buckets = new Map<number, Array<(typeof rows)[number]>>()

  const addToBucket = (row: (typeof rows)[number]) => {
    const bucketRows = buckets.get(row.bucket)
    if (bucketRows) bucketRows.push(row)
    else buckets.set(row.bucket, [row])
  }

  for (const item of sorted) {
    const tolerance = Math.min(maxTolerance, Math.max(2.5, item.height * 0.35))
    const targetBucket = Math.floor(item.y / bucketSize)
    const bucketRadius = Math.ceil(tolerance / bucketSize)
    let row: (typeof rows)[number] | undefined
    let closestDistance = Number.POSITIVE_INFINITY

    for (let bucket = targetBucket - bucketRadius; bucket <= targetBucket + bucketRadius; bucket += 1) {
      for (const candidate of buckets.get(bucket) ?? []) {
        const distance = Math.abs(candidate.y - item.y)
        if (distance <= tolerance && distance < closestDistance) {
          row = candidate
          closestDistance = distance
        }
      }
    }

    if (row) {
      const previousBucket = row.bucket
      row.items.push(item)
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length
      row.bucket = Math.floor(row.y / bucketSize)
      if (row.bucket !== previousBucket) {
        const previousRows = buckets.get(previousBucket)
        const previousIndex = previousRows?.indexOf(row) ?? -1
        if (previousIndex >= 0) previousRows?.splice(previousIndex, 1)
        if (!previousRows?.length) buckets.delete(previousBucket)
        addToBucket(row)
      }
    } else {
      const nextRow = { y: item.y, items: [item], bucket: targetBucket }
      rows.push(nextRow)
      addToBucket(nextRow)
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => ({
      y: row.y,
      height: maxBy(row.items, (item) => item.height, 1),
      spans: row.items.sort((a, b) => a.x - b.x),
    }))
}

interface PdfFontMetadata {
  bold?: boolean
  black?: boolean
  italic?: boolean
  name?: string
  fallbackName?: string
  cssFontInfo?: {
    fontFamily?: string
    fontWeight?: string | number
    italicAngle?: number
  } | null
  systemFontInfo?: {
    css?: string
  } | null
}

function resolveFontMetadata(page: PDFPageProxy, fontName: string) {
  return new Promise<PdfFontMetadata | null>((resolve) => {
    let settled = false
    const finish = (metadata: PdfFontMetadata | null) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      resolve(metadata)
    }
    const timeoutId = setTimeout(() => finish(null), 40)

    try {
      if (page.commonObjs.has(fontName)) {
        finish(page.commonObjs.get(fontName) as PdfFontMetadata)
      } else {
        page.commonObjs.get(fontName, (font: unknown) => finish(font as PdfFontMetadata))
      }
    } catch {
      finish(null)
    }
  })
}

function normalizeFontFamily(...candidates: Array<string | null | undefined>) {
  const candidate = candidates.find((value) => value?.trim())
  if (!candidate) {
    return 'Aptos'
  }

  const family = candidate
    .split(',')[0]
    .replace(/["']/g, '')
    .replace(/^[A-Z]{6}\+/i, '')
    .replace(/[-_ ]?(bold|black|heavy|semibold|demi|italic|oblique)+$/i, '')
    .trim()

  if (/^(helvetica|arialmt)$/i.test(family)) return 'Arial'
  if (/^(times|timesroman|timesnewromanpsmt)$/i.test(family)) return 'Times New Roman'
  if (/^(courier|couriernewpsmt)$/i.test(family)) return 'Courier New'
  if (/^sans-serif$/i.test(family)) return 'Arial'
  if (/^serif$/i.test(family)) return 'Times New Roman'
  if (/^monospace$/i.test(family)) return 'Courier New'
  return family || 'Aptos'
}

function hasBoldStyle(metadata: PdfFontMetadata | null, ...names: Array<string | null | undefined>) {
  if (metadata?.bold || metadata?.black) return true
  if (metadata?.cssFontInfo?.fontWeight) {
    const weight = Number(metadata.cssFontInfo.fontWeight)
    if ((!Number.isNaN(weight) && weight >= 600) || /bold|semibold|black|heavy/i.test(String(metadata.cssFontInfo.fontWeight))) {
      return true
    }
  }
  return names.some((name) => /bold|black|heavy|semibold|demi/i.test(name ?? ''))
}

function hasItalicStyle(metadata: PdfFontMetadata | null, ...names: Array<string | null | undefined>) {
  if (metadata?.italic || metadata?.cssFontInfo?.italicAngle) return true
  return names.some((name) => /italic|oblique/i.test(name ?? ''))
}

export async function readPdfStructure(file: File, onProgress?: PdfConversionProgress, signal?: AbortSignal): Promise<PdfStructure> {
  const data = await file.arrayBuffer()
  const loadingTask = getDocument({
    data,
    useWorkerFetch: true,
    disableStream: true,
    disableAutoFetch: true,
    stopAtErrors: true,
  })
  const loadingTaskGuard = guardPdfLoadingTask(loadingTask, signal)
  let pdf: PDFDocumentProxy | null = null
  try {
    const loadedPdf = await loadingTask.promise
    pdf = loadedPdf
    if (loadedPdf.numPages > PDF_TO_OFFICE_MAX_PAGES) {
      throw new Error(`PAGE_LIMIT:${loadedPdf.numPages}`)
    }

    const pages: PdfPageStructure[] = []
    const fontMetadataCache = new Map<string, PdfFontMetadata>()
    const fontMetadataAttempts = new Map<string, number>()
    let fontMetadataLookups = 0
    let extractedTextItems = 0
    let textItems = 0
    let textCharacters = 0

    for (let pageNumber = 1; pageNumber <= loadedPdf.numPages; pageNumber += 1) {
      signal?.throwIfAborted()
      const page = await loadedPdf.getPage(pageNumber)

      try {
        const viewport = page.getViewport({ scale: 1 })
        const content = await page.getTextContent()
        signal?.throwIfAborted()
        if (extractedTextItems + content.items.length > PDF_TO_OFFICE_MAX_TEXT_ITEMS) {
          throw new Error(`TEXT_ITEM_LIMIT:${PDF_TO_OFFICE_MAX_TEXT_ITEMS}`)
        }
        extractedTextItems += content.items.length
        const items: PdfTextSpan[] = []
        const pageFontMetadata = new Map<string, PdfFontMetadata | null>()

        for (const [sourceIndex, item] of content.items.entries()) {
          if (!('str' in item)) {
            continue
          }

          if (textCharacters + item.str.length > PDF_TO_OFFICE_MAX_TEXT_CHARACTERS) {
            throw new Error(`TEXT_CHARACTER_LIMIT:${PDF_TO_OFFICE_MAX_TEXT_CHARACTERS}`)
          }
          textCharacters += item.str.length
          const text = item.str.replace(/\s+/g, ' ')
          if (!text.trim()) {
            continue
          }

          const style = content.styles[item.fontName]
          let metadata = fontMetadataCache.get(item.fontName) ?? pageFontMetadata.get(item.fontName)
          if (metadata === undefined) {
            const attempts = fontMetadataAttempts.get(item.fontName) ?? 0
            if (
              fontMetadataLookups < PDF_FONT_METADATA_MAX_LOOKUPS
              && attempts < PDF_FONT_METADATA_MAX_ATTEMPTS_PER_FONT
            ) {
              signal?.throwIfAborted()
              fontMetadataLookups += 1
              fontMetadataAttempts.set(item.fontName, attempts + 1)
              metadata = await resolveFontMetadata(page, item.fontName)
              signal?.throwIfAborted()
            } else {
              metadata = null
            }
            pageFontMetadata.set(item.fontName, metadata)
            if (metadata) fontMetadataCache.set(item.fontName, metadata)
          }
          const viewportTransform = Util.transform(viewport.transform, item.transform)
          const viewportScale = Math.hypot(viewport.transform[0], viewport.transform[1])
          const verticalFontScale = Math.hypot(viewportTransform[2], viewportTransform[3])
          const transformedWidth = item.width * viewportScale
          const transformedHeight = item.height * viewportScale
          const fontSize = Math.max(1, verticalFontScale, transformedHeight)
          if (![viewportTransform[4], viewportTransform[5], transformedWidth, transformedHeight, fontSize].every(Number.isFinite)) {
            continue
          }
          const metadataName = metadata?.name
          const cssFamily = metadata?.cssFontInfo?.fontFamily

          items.push({
            text,
            x: viewportTransform[4],
            y: viewport.height - viewportTransform[5],
            width: transformedWidth,
            height: Math.max(transformedHeight, fontSize * ((style?.ascent ?? 0.8) - (style?.descent ?? -0.2))),
            fontFamily: normalizeFontFamily(cssFamily, metadataName, metadata?.systemFontInfo?.css, style?.fontFamily, metadata?.fallbackName),
            fontSize,
            bold: hasBoldStyle(metadata, metadataName, cssFamily, style?.fontFamily),
            italics: hasItalicStyle(metadata, metadataName, cssFamily, style?.fontFamily),
            ascent: style?.ascent ?? 0.8,
            sourceIndex,
          })
        }

        const lines = groupIntoLines(items)
        textItems += items.length
        pages.push({
          pageNumber,
          width: viewport.width,
          height: viewport.height,
          rows: lines.map((line) => mergeNearbyItems(line.spans)).filter((row) => row.some(Boolean)),
          lines,
        })
      } finally {
        page.cleanup()
        onProgress?.(pageNumber, loadedPdf.numPages)
      }
    }

    return { pageCount: loadedPdf.numPages, textItems, pages }
  } finally {
    loadingTaskGuard.dispose()
    pdf?.cleanup()
    await loadingTaskGuard.destroy()
  }
}

function quantizeColorChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value / 16) * 16))
}

function rgbToHex(red: number, green: number, blue: number) {
  return [red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function getReadableDocxTextColor(color: string) {
  const channels = color.match(/[\dA-F]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255)
  if (!channels || channels.length !== 3) return '000000'

  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ))
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const contrastAgainstWhite = 1.05 / (luminance + 0.05)

  return contrastAgainstWhite >= 4.5 ? color : '000000'
}

function colorDistance(first: [number, number, number], second: [number, number, number]) {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

function getBoundedRenderScale(width: number, height: number, maximumScale = 1) {
  const dimensionScale = PDF_COLOR_CANVAS_MAX_DIMENSION / Math.max(width, height, 1)
  const pixelScale = Math.sqrt(PDF_COLOR_CANVAS_MAX_PIXELS / Math.max(width * height, 1))
  return Math.min(maximumScale, dimensionScale, pixelScale)
}

function sampleTextColor(
  pagePixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  pageHeight: number,
  span: PdfTextSpan,
  renderScale: number,
  sampleBudget: number,
) {
  const padding = Math.max(1, Math.ceil(renderScale * 2))
  const left = Math.max(0, Math.floor(span.x * renderScale) - padding)
  const top = Math.max(0, Math.floor((pageHeight - span.y - span.height) * renderScale) - padding)
  const right = Math.min(canvasWidth, Math.ceil((span.x + span.width) * renderScale) + padding)
  const bottom = Math.min(
    canvasHeight,
    Math.ceil((pageHeight - span.y + span.height * 0.2) * renderScale) + padding,
  )
  const width = right - left
  const height = bottom - top
  const maxSamples = Math.min(PDF_COLOR_MAX_SAMPLES_PER_SPAN, sampleBudget)
  if (width <= 0 || height <= 0 || maxSamples <= 0) return { color: null, samples: 0 }

  const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / maxSamples)))
  const clusters = new Map<string, {
    color: [number, number, number]
    count: number
    red: number
    green: number
    blue: number
  }>()
  const borderCounts = new Map<string, number>()
  let samples = 0

  sampleRows: for (let y = top; y < bottom; y += stride) {
    for (let x = left; x < right; x += stride) {
      if (samples >= maxSamples) break sampleRows
      samples += 1
      const index = (y * canvasWidth + x) * 4
      if (pagePixels[index + 3] < 32) continue
      const color: [number, number, number] = [
        quantizeColorChannel(pagePixels[index]),
        quantizeColorChannel(pagePixels[index + 1]),
        quantizeColorChannel(pagePixels[index + 2]),
      ]
      const key = color.join(',')
      if (x === left || y === top || x + stride >= right || y + stride >= bottom) {
        borderCounts.set(key, (borderCounts.get(key) ?? 0) + 1)
      }
      const cluster = clusters.get(key)
      if (cluster) {
        cluster.count += 1
        cluster.red += pagePixels[index]
        cluster.green += pagePixels[index + 1]
        cluster.blue += pagePixels[index + 2]
      } else {
        clusters.set(key, {
          color,
          count: 1,
          red: pagePixels[index],
          green: pagePixels[index + 1],
          blue: pagePixels[index + 2],
        })
      }
    }
  }

  const sorted = [...clusters.values()].sort((a, b) => b.count - a.count)
  const backgroundKey = [...borderCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const background = (backgroundKey ? clusters.get(backgroundKey) : null) ?? sorted[0]
  if (!background) return { color: null, samples }

  const foregroundCandidates = sorted
    .filter((cluster) => cluster !== background)
    .map((cluster) => ({ cluster, contrast: colorDistance(cluster.color, background.color) }))
    .filter(({ cluster, contrast }) => cluster.count >= 2 && contrast >= 32)
    .sort((a, b) => b.contrast - a.contrast || b.cluster.count - a.cluster.count)
  const foreground = foregroundCandidates[0]?.cluster

  return {
    color: foreground
      ? rgbToHex(
          Math.round(foreground.red / foreground.count),
          Math.round(foreground.green / foreground.count),
          Math.round(foreground.blue / foreground.count),
        )
      : null,
    samples,
  }
}

async function readPdfTextColors(
  file: File,
  structure: PdfStructure,
  onProgress?: PdfConversionProgress,
  signal?: AbortSignal,
) {
  const loadingTask = getDocument({
    data: await file.arrayBuffer(),
    useWorkerFetch: true,
    disableStream: true,
    disableAutoFetch: true,
    stopAtErrors: true,
  })
  const loadingTaskGuard = guardPdfLoadingTask(loadingTask, signal)
  const pageColors = new Map<number, Map<number, string>>()
  let pdf: PDFDocumentProxy | null = null

  try {
    const loadedPdf = await loadingTask.promise
    pdf = loadedPdf
    for (let pageNumber = 1; pageNumber <= loadedPdf.numPages; pageNumber += 1) {
      signal?.throwIfAborted()
      const page = await loadedPdf.getPage(pageNumber)
      const canvas = document.createElement('canvas')

      try {
        const pageStructure = structure.pages[pageNumber - 1]
        if (!pageStructure) continue
        if (!pageStructure.lines.some((line) => line.spans.length > 0)) {
          pageColors.set(pageNumber, new Map())
          continue
        }
        const baseViewport = page.getViewport({ scale: 1 })
        const renderScale = getBoundedRenderScale(baseViewport.width, baseViewport.height)
        const viewport = page.getViewport({ scale: renderScale })
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('CANVAS_UNAVAILABLE')

        canvas.width = Math.max(1, Math.ceil(viewport.width))
        canvas.height = Math.max(1, Math.ceil(viewport.height))
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        const renderTask = page.render({ canvasContext: context, viewport, canvas })
        const cancelRender = () => renderTask.cancel()
        signal?.addEventListener('abort', cancelRender, { once: true })
        try {
          await renderTask.promise
        } finally {
          signal?.removeEventListener('abort', cancelRender)
        }
        signal?.throwIfAborted()

        const colors = new Map<number, string>()
        const pagePixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let sampleBudget = PDF_COLOR_MAX_SAMPLES_PER_PAGE
        sampleLines: for (const line of pageStructure.lines) {
          for (const span of line.spans) {
            const sample = sampleTextColor(
              pagePixels,
              canvas.width,
              canvas.height,
              baseViewport.height,
              span,
              renderScale,
              sampleBudget,
            )
            sampleBudget -= sample.samples
            if (sample.color) colors.set(span.sourceIndex, sample.color)
            if (sampleBudget <= 0) break sampleLines
          }
        }
        pageColors.set(pageNumber, colors)
      } catch (error) {
        if (signal?.aborted) throw error
        pageColors.set(pageNumber, new Map())
      } finally {
        canvas.width = 1
        canvas.height = 1
        page.cleanup()
        onProgress?.(pageNumber, loadedPdf.numPages)
      }
    }

    return pageColors
  } finally {
    loadingTaskGuard.dispose()
    pdf?.cleanup()
    await loadingTaskGuard.destroy()
  }
}

interface RenderedPdfPage {
  data: Uint8Array
  width: number
  height: number
}

export interface PdfVisualDocxLabels {
  page: string
  originalPdf: string
  documentDescription: string
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG_ENCODING_FAILED'))
    }, 'image/png')
  })
}

async function renderPdfPagesForWord(
  file: File,
  onProgress?: PdfConversionProgress,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const loadingTask = getDocument({
    data: await file.arrayBuffer(),
    useWorkerFetch: true,
    disableStream: true,
    disableAutoFetch: true,
    stopAtErrors: true,
  })
  const loadingTaskGuard = guardPdfLoadingTask(loadingTask, signal)
  const pages: RenderedPdfPage[] = []
  let totalImageBytes = 0

  try {
    const pdf = await loadingTask.promise
    signal?.throwIfAborted()

    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        signal?.throwIfAborted()
        const page = await pdf.getPage(pageNumber)
        const canvas = document.createElement('canvas')

        try {
          const baseViewport = page.getViewport({ scale: 1 })
          const renderScale = getBoundedRenderScale(
            baseViewport.width,
            baseViewport.height,
            PDF_VISUAL_DOCX_RENDER_SCALE,
          )
          const viewport = page.getViewport({ scale: renderScale })
          const context = canvas.getContext('2d', { alpha: false })
          if (!context) throw new Error('CANVAS_UNAVAILABLE')

          canvas.width = Math.max(1, Math.ceil(viewport.width))
          canvas.height = Math.max(1, Math.ceil(viewport.height))
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)

          const renderTask = page.render({ canvasContext: context, viewport, canvas })
          const cancelRender = () => renderTask.cancel()
          signal?.addEventListener('abort', cancelRender, { once: true })
          try {
            await renderTask.promise
          } finally {
            signal?.removeEventListener('abort', cancelRender)
          }
          signal?.throwIfAborted()

          const blob = await canvasToPng(canvas)
          signal?.throwIfAborted()
          const data = new Uint8Array(await blob.arrayBuffer())
          totalImageBytes += data.byteLength
          if (totalImageBytes > PDF_VISUAL_DOCX_MAX_IMAGE_BYTES) {
            throw new Error('VISUAL_DOCX_IMAGE_LIMIT')
          }
          pages.push({
            data,
            width: baseViewport.width,
            height: baseViewport.height,
          })
        } finally {
          canvas.width = 1
          canvas.height = 1
          page.cleanup()
          onProgress?.(pageNumber, pdf.numPages)
        }
      }
    } finally {
      pdf.cleanup()
    }
  } finally {
    loadingTaskGuard.dispose()
    await loadingTaskGuard.destroy()
  }

  return pages
}

async function convertPdfToVisualDocx(
  file: File,
  title: string,
  labels: PdfVisualDocxLabels,
  onProgress?: PdfConversionProgress,
  signal?: AbortSignal,
) {
  const toTwips = (points: number) => Math.max(0, Math.round(points * 20))
  const renderedPages = await renderPdfPagesForWord(file, onProgress, signal)
  signal?.throwIfAborted()

  const sections = renderedPages.map((page, pageIndex) => {
    const layoutScale = Math.min(1, WORD_MAX_PAGE_POINTS / page.width, WORD_MAX_PAGE_POINTS / page.height)
    const width = page.width * layoutScale
    const height = page.height * layoutScale
    const pixelsPerPoint = 96 / 72
    const pageLabel = `${labels.page} ${pageIndex + 1}`

    return {
      properties: {
        type: pageIndex === 0 ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE,
        page: {
          size: { width: toTwips(width), height: toTwips(height) },
          margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 },
        },
      },
      children: [new Paragraph({
        children: [new ImageRun({
          type: 'png',
          data: page.data,
          transformation: {
            width: width * pixelsPerPoint,
            height: height * pixelsPerPoint,
          },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
            allowOverlap: true,
            behindDocument: false,
            layoutInCell: false,
          },
          altText: {
            title: pageLabel,
            description: `${pageLabel} ${labels.originalPdf}`,
            name: pageLabel,
          },
        })],
        spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
      })],
    }
  })

  const document = new Document({
    creator: 'Naroz',
    title,
    description: labels.documentDescription,
    sections,
  })

  return Packer.toBlob(document)
}

export async function convertPdfStructureToDocx(
  structure: PdfStructure,
  title: string,
  sourceFile?: File,
  onProgress?: PdfConversionProgress,
  signal?: AbortSignal,
  mode: PdfDocxMode = 'editable',
  visualLabels?: PdfVisualDocxLabels,
) {
  if (mode === 'visual') {
    if (!sourceFile) throw new Error('SOURCE_FILE_REQUIRED')
    if (!visualLabels) throw new Error('VISUAL_DOCX_LABELS_REQUIRED')
    return convertPdfToVisualDocx(sourceFile, title, visualLabels, onProgress, signal)
  }

  const toTwips = (points: number) => Math.max(0, Math.round(points * 20))
  const toHalfPoints = (points: number) => Math.min(WORD_MAX_FONT_POINTS * 2, Math.max(2, Math.round(points * 2)))
  const pageColors: Map<number, Map<number, string>> = sourceFile
    ? await readPdfTextColors(sourceFile, structure, onProgress, signal).catch((error) => {
        if (signal?.aborted) throw error
        return new Map()
      })
    : new Map()
  signal?.throwIfAborted()

  const sections = structure.pages.map((page) => {
    const layoutScale = Math.min(1, WORD_MAX_PAGE_POINTS / page.width, WORD_MAX_PAGE_POINTS / page.height)
    const scaleLayout = (value: number) => value * layoutScale
    const maxPageFontPoints = Math.max(1, Math.min(WORD_MAX_FONT_POINTS, scaleLayout(page.width), scaleLayout(page.height)))
    const getFontPoints = (value: number) => Math.min(maxPageFontPoints, Math.max(1, scaleLayout(value)))
    const lineMetrics = page.lines.map((line) => {
      const sortedSpans = [...line.spans].sort((a, b) => a.x - b.x)
      const maxAscent = maxBy(sortedSpans, (span) => span.fontSize * span.ascent, line.height * 0.8)
      const top = Math.min(page.height, Math.max(0, page.height - line.y - maxAscent))
      const naturalHeight = Math.min(page.height, maxBy(sortedSpans, (span) => span.fontSize * 1.08, line.height))

      return { sortedSpans, top, naturalHeight }
    })

    const children = lineMetrics.length ? lineMetrics.map(({ sortedSpans, top, naturalHeight }, lineIndex) => {
      const nextTop = lineMetrics[lineIndex + 1]?.top
      const lineHeight = nextTop === undefined
        ? naturalHeight
        : Math.min(page.height, Math.max(1, nextTop - top))
      const before = lineIndex === 0 ? top : 0

      const tabPositions: number[] = []
      const tabPositionSet = new Set<number>()
      const runs: TextRun[] = []
      let previousEnd = 0

      sortedSpans.forEach((span, spanIndex) => {
        const gap = span.x - previousEnd
        const needsTab = spanIndex === 0 ? span.x > 1 : gap > Math.max(4, span.fontSize * 0.75)

        if (needsTab) {
          const position = toTwips(scaleLayout(Math.min(page.width - 1, Math.max(1, span.x))))
          if (!tabPositionSet.has(position)) {
            tabPositionSet.add(position)
            tabPositions.push(position)
          }
          runs.push(new TextRun({ text: '\t' }))
        } else if (spanIndex > 0 && gap > span.fontSize * 0.12) {
          runs.push(new TextRun({ text: ' ', size: toHalfPoints(getFontPoints(span.fontSize)), font: span.fontFamily }))
        }

        runs.push(new TextRun({
          text: span.text,
          font: span.fontFamily,
          size: toHalfPoints(getFontPoints(span.fontSize)),
          bold: span.bold,
          italics: span.italics,
          color: getReadableDocxTextColor(pageColors.get(page.pageNumber)?.get(span.sourceIndex) ?? '000000'),
        }))
        previousEnd = Math.max(previousEnd, span.x + span.width)
      })

      return new Paragraph({
        children: runs.length ? runs : [new TextRun({ text: ' ' })],
        tabStops: tabPositions.map((position) => ({ type: TabStopType.LEFT, position })),
        spacing: {
          before: toTwips(scaleLayout(before)),
          after: 0,
          line: Math.max(20, toTwips(Math.min(scaleLayout(page.height), scaleLayout(lineHeight)))),
          lineRule: LineRuleType.EXACT,
        },
        widowControl: false,
      })
    }) : [new Paragraph({ children: [new TextRun({ text: ' ' })] })]

    return {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: toTwips(scaleLayout(page.width)), height: toTwips(scaleLayout(page.height)) },
          margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 },
        },
      },
      children,
    }
  })

  const document = new Document({
    creator: 'Naroz',
    title,
    description: 'PDF reconstruido como documento Word por Naroz',
    styles: {
      default: {
        document: {
          run: { font: 'Aptos', size: 22, color: '000000' },
          paragraph: { spacing: { after: 0 } },
        },
      },
    },
    sections,
  })

  return Packer.toBlob(document)
}

function safeSheetName(pageNumber: number) {
  return `Pagina ${pageNumber}`.slice(0, 31)
}

export async function convertPdfStructureToXlsx(structure: PdfStructure) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()

  structure.pages.forEach((page) => {
    const rows = page.rows.length ? page.rows : [['']]
    const worksheet = XLSX.utils.aoa_to_sheet(rows)
    const columnCount = maxBy(rows, (row) => row.length, 1)
    worksheet['!cols'] = Array.from({ length: columnCount }, (_, columnIndex) => ({
      wch: Math.min(60, maxBy(rows, (row) => row[columnIndex]?.length ?? 0, 12)),
    }))
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(page.pageNumber))
  })

  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true })
  return new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/jpeg', 0.9)
}

export async function convertPdfToPptx(
  file: File,
  onProgress?: PdfConversionProgress,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const { default: PptxGenJS } = await import('pptxgenjs')
  signal?.throwIfAborted()
  const data = await file.arrayBuffer()
  signal?.throwIfAborted()
  const loadingTask = getDocument({
    data,
    useWorkerFetch: true,
    disableStream: true,
    disableAutoFetch: true,
    stopAtErrors: true,
  })
  const loadingTaskGuard = guardPdfLoadingTask(loadingTask, signal)
  let pdf: PDFDocumentProxy | null = null

  try {
    const loadedPdf = await loadingTask.promise
    pdf = loadedPdf
    signal?.throwIfAborted()
    if (loadedPdf.numPages > PDF_TO_OFFICE_MAX_PAGES) {
      throw new Error(`PAGE_LIMIT:${loadedPdf.numPages}`)
    }

    const presentation = new PptxGenJS()
    presentation.layout = 'LAYOUT_WIDE'
    presentation.author = 'Naroz'
    presentation.company = 'Naroz'
    presentation.subject = 'PDF convertido a PowerPoint'
    presentation.title = getBaseName(file.name)

    const slideWidth = 13.333
    const slideHeight = 7.5

    for (let pageNumber = 1; pageNumber <= loadedPdf.numPages; pageNumber += 1) {
      signal?.throwIfAborted()
      const page = await loadedPdf.getPage(pageNumber)
      const canvas = document.createElement('canvas')

      try {
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(2, 1800 / Math.max(baseViewport.width, baseViewport.height))
        const viewport = page.getViewport({ scale })
        const context = canvas.getContext('2d', { alpha: false })

        if (!context) {
          throw new Error('CANVAS_UNAVAILABLE')
        }

        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        const renderTask = page.render({ canvasContext: context, viewport, canvas })
        const cancelRender = () => renderTask.cancel()
        signal?.addEventListener('abort', cancelRender, { once: true })
        try {
          await renderTask.promise
        } finally {
          signal?.removeEventListener('abort', cancelRender)
        }
        signal?.throwIfAborted()

        const pageRatio = viewport.width / viewport.height
        const slideRatio = slideWidth / slideHeight
        const imageWidth = pageRatio > slideRatio ? slideWidth : slideHeight * pageRatio
        const imageHeight = pageRatio > slideRatio ? slideWidth / pageRatio : slideHeight
        const slide = presentation.addSlide()
        slide.background = { color: 'FFFFFF' }
        slide.addImage({
          data: canvasToDataUrl(canvas),
          x: (slideWidth - imageWidth) / 2,
          y: (slideHeight - imageHeight) / 2,
          w: imageWidth,
          h: imageHeight,
        })
      } finally {
        page.cleanup()
        canvas.width = 1
        canvas.height = 1
      }
      onProgress?.(pageNumber, loadedPdf.numPages)
    }

    signal?.throwIfAborted()
    const output = await presentation.write({ outputType: 'blob', compression: true })
    signal?.throwIfAborted()
    if (!(output instanceof Blob)) {
      throw new Error('PPTX_OUTPUT_INVALID')
    }

    return output
  } finally {
    loadingTaskGuard.dispose()
    pdf?.cleanup()
    await loadingTaskGuard.destroy()
  }
}
