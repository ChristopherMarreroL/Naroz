import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

export type OfficeFileKind = 'docx' | 'xlsx' | 'pptx'

export const OFFICE_TO_PDF_MAX_SIZE = 25 * 1024 * 1024
const MAX_EXCEL_ROWS = 10_000
const MAX_EXCEL_COLUMNS = 100
const EMU_PER_INCH = 914_400
const PPTX_PAGE_WIDTH = 13.333
const PPTX_PAGE_HEIGHT = 7.5

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

function getExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function getOfficeFileKind(file: File): OfficeFileKind | null {
  const extension = getExtension(file.name)
  if (extension === 'docx') return 'docx'
  if (extension === 'xlsx' || extension === 'xls') return 'xlsx'
  if (extension === 'pptx') return 'pptx'
  return null
}

export function getOfficePdfFileName(fileName: string) {
  return `${fileName.replace(/\.(docx|xlsx?|pptx)$/i, '') || 'documento'}-convertido.pdf`
}

function createPdfFromCanvas(canvas: HTMLCanvasElement, pdf?: jsPDF) {
  const pageWidth = 210
  const pageHeight = 297
  const imageHeight = (canvas.height * pageWidth) / canvas.width
  const document = pdf ?? new jsPDF({ unit: 'mm', format: 'a4', orientation: imageHeight > pageHeight ? 'portrait' : 'portrait' })
  const totalPages = Math.max(1, Math.ceil(imageHeight / pageHeight))

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    if (pdf || pageIndex > 0) document.addPage('a4', 'portrait')
    document.addImage(canvas, 'JPEG', 0, -pageIndex * pageHeight, pageWidth, imageHeight, undefined, 'FAST')
  }

  return document
}

async function convertDocxToPdf(file: File, onProgress: (value: number) => void) {
  const [{ renderAsync }, { default: html2canvas }] = await Promise.all([
    import('docx-preview'),
    import('html2canvas'),
  ])
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  Object.assign(container.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: '816px',
    background: '#ffffff',
    zIndex: '-1',
  })
  document.body.appendChild(container)

  try {
    await renderAsync(await file.arrayBuffer(), container, undefined, {
      className: 'naroz-docx-preview',
      inWrapper: true,
      breakPages: true,
      ignoreWidth: false,
      ignoreHeight: false,
      useBase64URL: true,
    })

    const renderedPages = Array.from(container.querySelectorAll<HTMLElement>('.naroz-docx-preview'))
    const pages = renderedPages.length ? renderedPages : [container]
    let pdf: jsPDF | undefined

    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await html2canvas(pages[index], {
        backgroundColor: '#ffffff',
        scale: 1.5,
        logging: false,
        useCORS: true,
      })
      pdf = createPdfFromCanvas(canvas, pdf)
      canvas.width = 1
      canvas.height = 1
      onProgress(Math.round(((index + 1) / pages.length) * 100))
    }

    if (!pdf) throw new Error('DOCX_EMPTY')
    return pdf.output('blob')
  } finally {
    container.remove()
  }
}

async function convertSpreadsheetToPdf(file: File, onProgress: (value: number) => void) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  if (!workbook.SheetNames.length) throw new Error('XLSX_EMPTY')

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    if (sheetIndex > 0) pdf.addPage('a4', 'landscape')
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    })
    const normalizedRows = rows.slice(0, MAX_EXCEL_ROWS).map((row) => row.slice(0, MAX_EXCEL_COLUMNS).map(String))
    const head = normalizedRows.length ? [normalizedRows[0]] : [['']]
    const body = normalizedRows.length > 1 ? normalizedRows.slice(1) : []

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text(sheetName.slice(0, 80), 36, 34)
    autoTable(pdf, {
      head,
      body,
      startY: 48,
      theme: 'grid',
      margin: 30,
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [29, 78, 216], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      showHead: 'everyPage',
    })
    onProgress(Math.round(((sheetIndex + 1) / workbook.SheetNames.length) * 100))
  })

  return pdf.output('blob')
}

function parseXml(text: string) {
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('PPTX_XML')
  return xml
}

function getElements(parent: ParentNode, name: string) {
  return Array.from((parent as Document | Element).getElementsByTagName(name))
}

function getFirst(parent: ParentNode, name: string) {
  return getElements(parent, name)[0]
}

function emuToInches(value: string | null, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number / EMU_PER_INCH : fallback
}

function readTransform(parent: ParentNode) {
  const transform = getFirst(parent, 'a:xfrm') ?? getFirst(parent, 'p:xfrm')
  const offset = transform ? getFirst(transform, 'a:off') : undefined
  const extent = transform ? getFirst(transform, 'a:ext') : undefined
  return {
    x: emuToInches(offset?.getAttribute('x') ?? null),
    y: emuToInches(offset?.getAttribute('y') ?? null),
    width: Math.max(0.1, emuToInches(extent?.getAttribute('cx') ?? null, 1)),
    height: Math.max(0.1, emuToInches(extent?.getAttribute('cy') ?? null, 0.5)),
  }
}

function getSlideNumber(path: string) {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
}

async function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: mime }))
  })
}

function resolveZipPath(base: string, target: string) {
  const segments = `${base}/${target}`.split('/')
  const output: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') output.pop()
    else output.push(segment)
  }
  return output.join('/')
}

async function convertPresentationToPdf(file: File, onProgress: (value: number) => void) {
  const zip = await new JSZip().loadAsync(await file.arrayBuffer())
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((left, right) => getSlideNumber(left) - getSlideNumber(right))
  if (!slidePaths.length) throw new Error('PPTX_EMPTY')

  const pdf = new jsPDF({ unit: 'in', format: [PPTX_PAGE_WIDTH, PPTX_PAGE_HEIGHT], orientation: 'landscape' })

  for (let index = 0; index < slidePaths.length; index += 1) {
    if (index > 0) pdf.addPage([PPTX_PAGE_WIDTH, PPTX_PAGE_HEIGHT], 'landscape')
    const slidePath = slidePaths[index]
    const slideFile = zip.file(slidePath)
    if (!slideFile) continue
    const slideXml = parseXml(await slideFile.async('text'))
    const slideNumber = getSlideNumber(slidePath)
    const relationshipsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`
    const relationshipsFile = zip.file(relationshipsPath)
    const relationships = new Map<string, string>()

    if (relationshipsFile) {
      const relationshipsXml = parseXml(await relationshipsFile.async('text'))
      getElements(relationshipsXml, 'Relationship').forEach((relationship) => {
        const id = relationship.getAttribute('Id')
        const target = relationship.getAttribute('Target')
        if (id && target) relationships.set(id, resolveZipPath('ppt/slides', target))
      })
    }

    for (const shape of getElements(slideXml, 'p:sp')) {
      const text = getElements(shape, 'a:t').map((node) => node.textContent ?? '').join(' ').trim()
      if (!text) continue
      const box = readTransform(shape)
      const sizeValue = getFirst(shape, 'a:rPr')?.getAttribute('sz') ?? getFirst(shape, 'a:defRPr')?.getAttribute('sz')
      const fontSize = Math.min(44, Math.max(8, Number(sizeValue ?? 1800) / 100))
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(fontSize)
      pdf.setTextColor(15, 23, 42)
      pdf.text(pdf.splitTextToSize(text, box.width), box.x, box.y + Math.min(box.height, fontSize / 72), {
        baseline: 'top',
        maxWidth: box.width,
      })
    }

    for (const picture of getElements(slideXml, 'p:pic')) {
      const blip = getFirst(picture, 'a:blip')
      const relationshipId = blip?.getAttribute('r:embed')
      const imagePath = relationshipId ? relationships.get(relationshipId) : undefined
      const imageFile = imagePath ? zip.file(imagePath) : null
      const extension = imagePath ? getExtension(imagePath) : ''
      const mime = MIME_BY_EXTENSION[extension]
      if (!imageFile || !mime) continue
      const dataUrl = await bytesToDataUrl(await imageFile.async('uint8array'), mime)
      const box = readTransform(picture)
      pdf.addImage(dataUrl, extension === 'jpg' || extension === 'jpeg' ? 'JPEG' : extension.toUpperCase(), box.x, box.y, box.width, box.height, undefined, 'FAST')
    }

    onProgress(Math.round(((index + 1) / slidePaths.length) * 100))
  }

  return pdf.output('blob')
}

export async function convertOfficeToPdf(file: File, kind: OfficeFileKind, onProgress: (value: number) => void) {
  if (kind === 'docx') return convertDocxToPdf(file, onProgress)
  if (kind === 'xlsx') return convertSpreadsheetToPdf(file, onProgress)
  return convertPresentationToPdf(file, onProgress)
}
