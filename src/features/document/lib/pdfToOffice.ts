import {
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  SectionType,
  TabStopType,
  TextRun,
} from 'docx'
import { GlobalWorkerOptions, Util, getDocument } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import PptxGenJS from 'pptxgenjs'
import * as XLSX from 'xlsx'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

export const PDF_TO_OFFICE_MAX_SIZE = 25 * 1024 * 1024
export const PDF_TO_OFFICE_MAX_PAGES = 100
const PDF_COLOR_CANVAS_MAX_DIMENSION = 4096
const PDF_COLOR_CANVAS_MAX_PIXELS = 16_000_000
const WORD_MAX_PAGE_POINTS = 22 * 72
const WORD_MAX_FONT_POINTS = WORD_MAX_PAGE_POINTS

export type PdfOfficeFormat = 'docx' | 'xlsx' | 'pptx'

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
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Array<{ y: number; items: PdfTextSpan[] }> = []

  for (const item of sorted) {
    const tolerance = Math.max(2.5, item.height * 0.35)
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance)

    if (row) {
      row.items.push(item)
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length
    } else {
      rows.push({ y: item.y, items: [item] })
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => ({
      y: row.y,
      height: Math.max(...row.items.map((item) => item.height), 1),
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

export async function readPdfStructure(file: File, onProgress?: PdfConversionProgress): Promise<PdfStructure> {
  const data = await file.arrayBuffer()
  const loadingTask = getDocument({
    data,
    useWorkerFetch: true,
    disableStream: true,
    disableAutoFetch: true,
    isEvalSupported: false,
    stopAtErrors: true,
  })
  const pdf = await loadingTask.promise

  try {
    if (pdf.numPages > PDF_TO_OFFICE_MAX_PAGES) {
      throw new Error(`PAGE_LIMIT:${pdf.numPages}`)
    }

    const pages: PdfPageStructure[] = []
    const fontMetadataCache = new Map<string, PdfFontMetadata>()
    let textItems = 0

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: PdfTextSpan[] = []

      const fontNames = new Set(
        content.items
          .filter((item) => 'str' in item)
          .map((item) => item.fontName),
      )
      await Promise.all([...fontNames].map(async (fontName) => {
        if (fontMetadataCache.has(fontName)) return
        const metadata = await resolveFontMetadata(page, fontName)
        if (metadata) fontMetadataCache.set(fontName, metadata)
      }))

      for (const [sourceIndex, item] of content.items.entries()) {
        if (!('str' in item)) {
          continue
        }

        const text = item.str.replace(/\s+/g, ' ')
        if (!text.trim()) {
          continue
        }

        const style = content.styles[item.fontName]
        const metadata = fontMetadataCache.get(item.fontName) ?? null
        const viewportTransform = Util.transform(viewport.transform, item.transform)
        const viewportScale = Math.hypot(viewport.transform[0], viewport.transform[1])
        const verticalFontScale = Math.hypot(viewportTransform[2], viewportTransform[3])
        const transformedWidth = item.width * viewportScale
        const transformedHeight = item.height * viewportScale
        const fontSize = Math.max(1, verticalFontScale, transformedHeight)
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
      page.cleanup()
      onProgress?.(pageNumber, pdf.numPages)
    }

    return { pageCount: pdf.numPages, textItems, pages }
  } finally {
    pdf.cleanup()
    await loadingTask.destroy()
  }
}

function quantizeColorChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value / 16) * 16))
}

function rgbToHex(red: number, green: number, blue: number) {
  return [red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function colorDistance(first: [number, number, number], second: [number, number, number]) {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

function getBoundedRenderScale(width: number, height: number) {
  const dimensionScale = PDF_COLOR_CANVAS_MAX_DIMENSION / Math.max(width, height, 1)
  const pixelScale = Math.sqrt(PDF_COLOR_CANVAS_MAX_PIXELS / Math.max(width * height, 1))
  return Math.min(1, dimensionScale, pixelScale)
}

function sampleTextColor(
  context: CanvasRenderingContext2D,
  pageHeight: number,
  span: PdfTextSpan,
  renderScale: number,
) {
  const left = Math.max(0, Math.floor(span.x * renderScale))
  const top = Math.max(0, Math.floor((pageHeight - span.y - span.height) * renderScale))
  const width = Math.min(context.canvas.width - left, Math.max(1, Math.ceil(span.width * renderScale)))
  const height = Math.min(context.canvas.height - top, Math.max(1, Math.ceil(span.height * 1.2 * renderScale)))
  if (width <= 0 || height <= 0) return null

  const pixels = context.getImageData(left, top, width, height).data
  const clusters = new Map<string, {
    color: [number, number, number]
    count: number
    red: number
    green: number
    blue: number
  }>()

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 32) continue
    const color: [number, number, number] = [
      quantizeColorChannel(pixels[index]),
      quantizeColorChannel(pixels[index + 1]),
      quantizeColorChannel(pixels[index + 2]),
    ]
    const key = color.join(',')
    const cluster = clusters.get(key)
    if (cluster) {
      cluster.count += 1
      cluster.red += pixels[index]
      cluster.green += pixels[index + 1]
      cluster.blue += pixels[index + 2]
    } else {
      clusters.set(key, {
        color,
        count: 1,
        red: pixels[index],
        green: pixels[index + 1],
        blue: pixels[index + 2],
      })
    }
  }

  const sorted = [...clusters.values()].sort((a, b) => b.count - a.count)
  const background = sorted[0]
  if (!background) return null

  const foregroundCandidates = sorted
    .slice(1)
    .map((cluster) => ({ cluster, contrast: colorDistance(cluster.color, background.color) }))
    .filter(({ cluster, contrast }) => cluster.count >= 2 && contrast >= 32)
    .sort((a, b) => b.contrast - a.contrast || b.cluster.count - a.cluster.count)
  const foreground = foregroundCandidates[0]?.cluster

  return foreground
    ? rgbToHex(
        Math.round(foreground.red / foreground.count),
        Math.round(foreground.green / foreground.count),
        Math.round(foreground.blue / foreground.count),
      )
    : null
}

async function readPdfTextColors(file: File, structure: PdfStructure, onProgress?: PdfConversionProgress) {
  const loadingTask = getDocument({
    data: await file.arrayBuffer(),
    useWorkerFetch: true,
    disableStream: true,
    disableAutoFetch: true,
    isEvalSupported: false,
    stopAtErrors: true,
  })
  const pdf = await loadingTask.promise
  const pageColors = new Map<number, Map<number, string>>()

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const canvas = document.createElement('canvas')

      try {
        const pageStructure = structure.pages[pageNumber - 1]
        if (!pageStructure) continue
        const baseViewport = page.getViewport({ scale: 1 })
        const renderScale = getBoundedRenderScale(baseViewport.width, baseViewport.height)
        const viewport = page.getViewport({ scale: renderScale })
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('CANVAS_UNAVAILABLE')

        canvas.width = Math.max(1, Math.ceil(viewport.width))
        canvas.height = Math.max(1, Math.ceil(viewport.height))
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: context, viewport, canvas }).promise

        const colors = new Map<number, string>()
        pageStructure.lines.forEach((line) => line.spans.forEach((span) => {
          const color = sampleTextColor(context, baseViewport.height, span, renderScale)
          if (color) colors.set(span.sourceIndex, color)
        }))
        pageColors.set(pageNumber, colors)
      } finally {
        canvas.width = 1
        canvas.height = 1
        page.cleanup()
        onProgress?.(pageNumber, pdf.numPages)
      }
    }

    return pageColors
  } finally {
    pdf.cleanup()
    await loadingTask.destroy()
  }
}

export async function convertPdfStructureToDocx(
  structure: PdfStructure,
  title: string,
  sourceFile?: File,
  onProgress?: PdfConversionProgress,
) {
  const toTwips = (points: number) => Math.max(0, Math.round(points * 20))
  const toHalfPoints = (points: number) => Math.min(WORD_MAX_FONT_POINTS * 2, Math.max(2, Math.round(points * 2)))
  const pageColors = sourceFile ? await readPdfTextColors(sourceFile, structure, onProgress) : new Map<number, Map<number, string>>()

  const sections = structure.pages.map((page) => {
    const layoutScale = Math.min(1, WORD_MAX_PAGE_POINTS / page.width, WORD_MAX_PAGE_POINTS / page.height)
    const scaleLayout = (value: number) => value * layoutScale
    const maxPageFontPoints = Math.max(1, Math.min(WORD_MAX_FONT_POINTS, scaleLayout(page.width), scaleLayout(page.height)))
    const getFontPoints = (value: number) => Math.min(maxPageFontPoints, Math.max(1, scaleLayout(value)))
    const lineMetrics = page.lines.map((line) => {
      const sortedSpans = [...line.spans].sort((a, b) => a.x - b.x)
      const maxAscent = Math.max(...sortedSpans.map((span) => span.fontSize * span.ascent), line.height * 0.8)
      const top = Math.min(page.height, Math.max(0, page.height - line.y - maxAscent))
      const naturalHeight = Math.min(page.height, Math.max(line.height, ...sortedSpans.map((span) => span.fontSize * 1.08)))

      return { sortedSpans, top, naturalHeight }
    })

    const children = lineMetrics.length ? lineMetrics.map(({ sortedSpans, top, naturalHeight }, lineIndex) => {
      const nextTop = lineMetrics[lineIndex + 1]?.top
      const lineHeight = nextTop === undefined
        ? naturalHeight
        : Math.min(page.height, Math.max(1, nextTop - top))
      const before = lineIndex === 0 ? top : 0

      const tabPositions: number[] = []
      const runs: TextRun[] = []
      let previousEnd = 0

      sortedSpans.forEach((span, spanIndex) => {
        const gap = span.x - previousEnd
        const needsTab = spanIndex === 0 ? span.x > 1 : gap > Math.max(4, span.fontSize * 0.75)

        if (needsTab) {
          const position = toTwips(scaleLayout(Math.min(page.width - 1, Math.max(1, span.x))))
          if (!tabPositions.includes(position)) tabPositions.push(position)
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
          color: pageColors.get(page.pageNumber)?.get(span.sourceIndex) ?? '000000',
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

export function convertPdfStructureToXlsx(structure: PdfStructure) {
  const workbook = XLSX.utils.book_new()

  structure.pages.forEach((page) => {
    const rows = page.rows.length ? page.rows : [['']]
    const worksheet = XLSX.utils.aoa_to_sheet(rows)
    const columnCount = Math.max(...rows.map((row) => row.length), 1)
    worksheet['!cols'] = Array.from({ length: columnCount }, (_, columnIndex) => ({
      wch: Math.min(60, Math.max(12, ...rows.map((row) => row[columnIndex]?.length ?? 0))),
    }))
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(page.pageNumber))
  })

  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true })
  return new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/jpeg', 0.9)
}

export async function convertPdfToPptx(file: File, onProgress?: PdfConversionProgress) {
  const data = await file.arrayBuffer()
  const loadingTask = getDocument({
    data,
    useWorkerFetch: true,
    disableStream: true,
    disableAutoFetch: true,
    isEvalSupported: false,
    stopAtErrors: true,
  })
  const pdf = await loadingTask.promise

  try {
    if (pdf.numPages > PDF_TO_OFFICE_MAX_PAGES) {
      throw new Error(`PAGE_LIMIT:${pdf.numPages}`)
    }

    const presentation = new PptxGenJS()
    presentation.layout = 'LAYOUT_WIDE'
    presentation.author = 'Naroz'
    presentation.company = 'Naroz'
    presentation.subject = 'PDF convertido a PowerPoint'
    presentation.title = getBaseName(file.name)

    const slideWidth = 13.333
    const slideHeight = 7.5

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(2, 1800 / Math.max(baseViewport.width, baseViewport.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { alpha: false })

      if (!context) {
        throw new Error('CANVAS_UNAVAILABLE')
      }

      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport, canvas }).promise

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

      page.cleanup()
      canvas.width = 1
      canvas.height = 1
      onProgress?.(pageNumber, pdf.numPages)
    }

    const output = await presentation.write({ outputType: 'blob', compression: true })
    if (!(output instanceof Blob)) {
      throw new Error('PPTX_OUTPUT_INVALID')
    }

    return output
  } finally {
    pdf.cleanup()
    await loadingTask.destroy()
  }
}
