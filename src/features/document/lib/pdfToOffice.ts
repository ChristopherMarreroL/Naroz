import {
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  SectionType,
  TabStopType,
  TextRun,
} from 'docx'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import PptxGenJS from 'pptxgenjs'
import * as XLSX from 'xlsx'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

export const PDF_TO_OFFICE_MAX_SIZE = 25 * 1024 * 1024
export const PDF_TO_OFFICE_MAX_PAGES = 100

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
      cells.push(currentText)
      currentText = item.text
    }

    currentEnd = Math.max(currentEnd, item.x + item.width)
  }

  cells.push(currentText)
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
    const fontMetadataCache = new Map<string, Promise<PdfFontMetadata | null>>()
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
      await Promise.all([...fontNames].map((fontName) => {
        let metadataPromise = fontMetadataCache.get(fontName)
        if (!metadataPromise) {
          metadataPromise = resolveFontMetadata(page, fontName)
          fontMetadataCache.set(fontName, metadataPromise)
        }
        return metadataPromise
      }))

      for (const item of content.items) {
        if (!('str' in item)) {
          continue
        }

        const text = item.str.replace(/\s+/g, ' ').trim()
        if (!text) {
          continue
        }

        const style = content.styles[item.fontName]
        const metadata = await fontMetadataCache.get(item.fontName) ?? null
        const fontSize = Math.max(1, Math.hypot(item.transform[0], item.transform[1]), item.height)
        const metadataName = metadata?.name
        const cssFamily = metadata?.cssFontInfo?.fontFamily

        items.push({
          text,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: Math.max(item.height, fontSize * ((style?.ascent ?? 0.8) - (style?.descent ?? -0.2))),
          fontFamily: normalizeFontFamily(cssFamily, metadataName, metadata?.systemFontInfo?.css, style?.fontFamily, metadata?.fallbackName),
          fontSize,
          bold: hasBoldStyle(metadata, metadataName, cssFamily, style?.fontFamily),
          italics: hasItalicStyle(metadata, metadataName, cssFamily, style?.fontFamily),
          ascent: style?.ascent ?? 0.8,
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

export async function convertPdfStructureToDocx(structure: PdfStructure, title: string) {
  const toTwips = (points: number) => Math.max(0, Math.round(points * 20))
  const toHalfPoints = (points: number) => Math.max(2, Math.round(points * 2))

  const sections = structure.pages.map((page) => {
    let previousBottom = 0
    const children = page.lines.length ? page.lines.map((line) => {
      const sortedSpans = [...line.spans].sort((a, b) => a.x - b.x)
      const maxAscent = Math.max(...sortedSpans.map((span) => span.fontSize * span.ascent), line.height * 0.8)
      const top = Math.max(0, page.height - line.y - maxAscent)
      const lineHeight = Math.max(line.height, ...sortedSpans.map((span) => span.fontSize * 1.08))
      const before = Math.max(0, top - previousBottom)
      previousBottom = Math.max(previousBottom, top + lineHeight)

      const tabPositions: number[] = []
      const runs: TextRun[] = []
      let previousEnd = 0

      sortedSpans.forEach((span, spanIndex) => {
        const gap = span.x - previousEnd
        const needsTab = spanIndex === 0 ? span.x > 1 : gap > Math.max(4, span.fontSize * 0.75)

        if (needsTab) {
          const position = toTwips(Math.min(page.width - 1, Math.max(1, span.x)))
          if (!tabPositions.includes(position)) tabPositions.push(position)
          runs.push(new TextRun({ text: '\t' }))
        } else if (spanIndex > 0 && gap > span.fontSize * 0.12) {
          runs.push(new TextRun({ text: ' ', size: toHalfPoints(span.fontSize), font: span.fontFamily }))
        }

        runs.push(new TextRun({
          text: span.text,
          font: span.fontFamily,
          size: toHalfPoints(span.fontSize),
          bold: span.bold,
          italics: span.italics,
        }))
        previousEnd = Math.max(previousEnd, span.x + span.width)
      })

      return new Paragraph({
        children: runs.length ? runs : [new TextRun({ text: ' ' })],
        tabStops: tabPositions.map((position) => ({ type: TabStopType.LEFT, position })),
        spacing: {
          before: toTwips(before),
          after: 0,
          line: Math.max(20, toTwips(lineHeight)),
          lineRule: LineRuleType.EXACT,
        },
        widowControl: false,
      })
    }) : [new Paragraph({ children: [new TextRun({ text: ' ' })] })]

    return {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: toTwips(page.width), height: toTwips(page.height) },
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
          run: { font: 'Aptos', size: 22, color: '172033' },
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
