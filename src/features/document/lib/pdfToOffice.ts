import { Document, Packer, Paragraph, TextRun } from 'docx'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import PptxGenJS from 'pptxgenjs'
import * as XLSX from 'xlsx'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

export const PDF_TO_OFFICE_MAX_SIZE = 25 * 1024 * 1024
export const PDF_TO_OFFICE_MAX_PAGES = 100

export type PdfOfficeFormat = 'docx' | 'xlsx' | 'pptx'

interface PositionedText {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface PdfPageStructure {
  pageNumber: number
  width: number
  height: number
  rows: string[][]
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

function mergeNearbyItems(items: PositionedText[]) {
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

function groupIntoRows(items: PositionedText[]) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Array<{ y: number; items: PositionedText[] }> = []

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
    .map((row) => mergeNearbyItems(row.items.sort((a, b) => a.x - b.x)))
    .filter((row) => row.some(Boolean))
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
    let textItems = 0

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: PositionedText[] = []

      for (const item of content.items) {
        if (!('str' in item)) {
          continue
        }

        const text = item.str.replace(/\s+/g, ' ').trim()
        if (!text) {
          continue
        }

        items.push({
          text,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        })
      }

      textItems += items.length
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        rows: groupIntoRows(items),
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
  const children: Paragraph[] = []

  structure.pages.forEach((page, pageIndex) => {
    const lines = page.rows.length ? page.rows : [['']]

    lines.forEach((cells, lineIndex) => {
      children.push(new Paragraph({
        pageBreakBefore: pageIndex > 0 && lineIndex === 0,
        children: [new TextRun({ text: cells.join('\t') || ' ' })],
        spacing: { after: 80, line: 276 },
      }))
    })
  })

  const document = new Document({
    creator: 'Naroz',
    title,
    description: 'PDF reconstruido como documento Word por Naroz',
    styles: {
      default: {
        document: {
          run: { font: 'Aptos', size: 22, color: '172033' },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [{ properties: {}, children }],
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
