import type { jsPDF as JsPdfDocument } from 'jspdf'
import { limitExcelRange } from '../../excel/lib/excelLimits'
import type { OfficeArchive } from './officeArchiveLimits'

export type OfficeFileKind = 'docx' | 'xlsx' | 'pptx'

export const OFFICE_TO_PDF_MAX_SIZE = 25 * 1024 * 1024
export const OFFICE_TO_PDF_MAX_PAGES = 200
export const OFFICE_TO_PDF_MAX_PAGE_DIMENSION = 4_096
export const OFFICE_TO_PDF_MAX_PAGE_PIXELS = 16_000_000
export const OFFICE_TO_PDF_MAX_TOTAL_PIXELS = 80_000_000
const MAX_EXCEL_ROWS = 10_000
const MAX_EXCEL_COLUMNS = 100
const MAX_EXCEL_SHEETS = 50
const CSS_PIXELS_PER_INCH = 96
const MILLIMETERS_PER_INCH = 25.4
const OFFICE_TO_PDF_RASTER_SCALE = 1.5
const OFFICE_TO_PDF_CANCELLED = 'OFFICE_TO_PDF_CANCELLED'
const WORDPROCESSING_DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
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

function getPdfPageFormat(width: number, height: number) {
  const orientation = width >= height ? 'landscape' : 'portrait'
  const pageWidth = (width / CSS_PIXELS_PER_INCH) * MILLIMETERS_PER_INCH
  const pageHeight = (height / CSS_PIXELS_PER_INCH) * MILLIMETERS_PER_INCH

  return {
    orientation,
    pageHeight,
    pageWidth,
  } as const
}

function throwIfOfficeConversionAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw new Error(OFFICE_TO_PDF_CANCELLED)
}

export function assertOfficePdfPageCount(pageCount: number) {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error('OFFICE_PAGE_COUNT_INVALID')
  }
  if (pageCount > OFFICE_TO_PDF_MAX_PAGES) {
    throw new Error('OFFICE_TOO_MANY_PAGES')
  }
}

export function assertOfficePdfRasterBudget(width: number, height: number, totalPixels = 0) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('OFFICE_PAGE_DIMENSIONS_INVALID')
  }
  if (width > OFFICE_TO_PDF_MAX_PAGE_DIMENSION || height > OFFICE_TO_PDF_MAX_PAGE_DIMENSION) {
    throw new Error('OFFICE_PAGE_DIMENSIONS_TOO_LARGE')
  }

  const rasterWidth = Math.ceil(width * OFFICE_TO_PDF_RASTER_SCALE)
  const rasterHeight = Math.ceil(height * OFFICE_TO_PDF_RASTER_SCALE)
  const pagePixels = rasterWidth * rasterHeight
  if (!Number.isSafeInteger(pagePixels) || pagePixels > OFFICE_TO_PDF_MAX_PAGE_PIXELS) {
    throw new Error('OFFICE_PAGE_RASTER_TOO_LARGE')
  }
  if (!Number.isFinite(totalPixels) || totalPixels < 0 || totalPixels + pagePixels > OFFICE_TO_PDF_MAX_TOTAL_PIXELS) {
    throw new Error('OFFICE_TOTAL_RASTER_TOO_LARGE')
  }

  return totalPixels + pagePixels
}

interface DocxAnchorLayout {
  height: number
  horizontalRelativeFrom: string
  verticalRelativeFrom: string
  width: number
  x: number
  y: number
}

function emuToCssPixels(value: string | null) {
  return (Number(value ?? 0) / 914_400) * CSS_PIXELS_PER_INCH
}

interface DocxLayoutMetadata {
  anchorLayouts: DocxAnchorLayout[]
  expectedPageCount: number | null
}

async function readDocxLayoutMetadata(zip: OfficeArchive, signal?: AbortSignal): Promise<DocxLayoutMetadata> {
  const { readOfficeArchiveEntryText } = await import('./officeArchiveLimits')
  throwIfOfficeConversionAborted(signal)
  const documentPart = zip.file('word/document.xml')
  const appPart = zip.file('docProps/app.xml')
  if (!documentPart) return { anchorLayouts: [], expectedPageCount: null }

  const documentXml = await readOfficeArchiveEntryText(documentPart, signal)
  throwIfOfficeConversionAborted(signal)
  const xml = new DOMParser().parseFromString(documentXml, 'application/xml')
  if (xml.querySelector('parsererror')) return { anchorLayouts: [], expectedPageCount: null }

  const anchorLayouts = Array.from(xml.getElementsByTagNameNS(WORDPROCESSING_DRAWING_NS, 'anchor')).flatMap((anchor) => {
    const children = Array.from(anchor.children)
    if (!children.some((element) => element.localName === 'wrapTopAndBottom')) return []

    const positionH = children.find((element) => element.localName === 'positionH')
    const positionV = children.find((element) => element.localName === 'positionV')
    const extent = children.find((element) => element.localName === 'extent')
    const x = Array.from(positionH?.children ?? []).find((element) => element.localName === 'posOffset')
    const y = Array.from(positionV?.children ?? []).find((element) => element.localName === 'posOffset')
    if (!extent || !x || !y) return []

    return [{
      height: emuToCssPixels(extent.getAttribute('cy')),
      horizontalRelativeFrom: positionH?.getAttribute('relativeFrom') ?? 'column',
      verticalRelativeFrom: positionV?.getAttribute('relativeFrom') ?? 'paragraph',
      width: emuToCssPixels(extent.getAttribute('cx')),
      x: emuToCssPixels(x.textContent),
      y: emuToCssPixels(y.textContent),
    } satisfies DocxAnchorLayout]
  })

  let expectedPageCount: number | null = null
  if (appPart) {
    const appXmlText = await readOfficeArchiveEntryText(appPart, signal)
    throwIfOfficeConversionAborted(signal)
    const appXml = new DOMParser().parseFromString(appXmlText, 'application/xml')
    const pages = Array.from(appXml.getElementsByTagName('*')).find((element) => element.localName === 'Pages')
    const parsedPages = Number.parseInt(pages?.textContent ?? '', 10)
    if (Number.isFinite(parsedPages) && parsedPages > 0) expectedPageCount = parsedPages
  }

  return { anchorLayouts, expectedPageCount }
}

function applyDocxAnchorLayouts(pages: HTMLElement[], layouts: DocxAnchorLayout[]) {
  const wrappers = pages.flatMap((page) => Array.from(page.querySelectorAll<HTMLDivElement>('div')).filter((wrapper) =>
    wrapper.style.width === '100%'
    && wrapper.firstElementChild instanceof HTMLImageElement))

  wrappers.forEach((wrapper, index) => {
    const layout = layouts[index]
    const image = wrapper.firstElementChild
    const page = wrapper.closest<HTMLElement>('section.naroz-docx-preview')
    const paragraph = wrapper.closest<HTMLElement>('p')
    if (!layout || !(image instanceof HTMLImageElement) || !page || !paragraph) return

    const pageRect = page.getBoundingClientRect()
    const paragraphRect = paragraph.getBoundingClientRect()
    const pageStyle = getComputedStyle(page)
    const paddingLeft = Number.parseFloat(pageStyle.paddingLeft)
    const paddingTop = Number.parseFloat(pageStyle.paddingTop)
    const paragraphX = paragraphRect.left - pageRect.left
    const paragraphY = paragraphRect.top - pageRect.top
    const left = layout.horizontalRelativeFrom === 'page' ? layout.x :
      layout.horizontalRelativeFrom === 'paragraph' || layout.horizontalRelativeFrom === 'character'
        ? paragraphX + layout.x
        : paddingLeft + layout.x
    const top = layout.verticalRelativeFrom === 'page' ? layout.y :
      layout.verticalRelativeFrom === 'paragraph' || layout.verticalRelativeFrom === 'line'
        ? paragraphY + layout.y
        : paddingTop + layout.y

    page.appendChild(wrapper)
    wrapper.style.position = 'absolute'
    wrapper.style.display = 'block'
    wrapper.style.left = left + 'px'
    wrapper.style.top = top + 'px'
    wrapper.style.width = layout.width + 'px'
    wrapper.style.height = layout.height + 'px'
    wrapper.style.textAlign = 'initial'
    wrapper.style.zIndex = '2'
    image.style.position = 'static'
    image.style.width = '100%'
    image.style.height = '100%'

    if (layout.verticalRelativeFrom === 'paragraph' || layout.verticalRelativeFrom === 'line') {
      const currentMinHeight = Number.parseFloat(getComputedStyle(paragraph).minHeight) || 0
      paragraph.style.minHeight = Math.max(currentMinHeight, layout.y + layout.height) + 'px'
    }
  })
}

interface DocxPageOverflow {
  article: HTMLElement
  children: HTMLElement[]
  clippedOverflow: number
  page: HTMLElement
  pageBottom: number
  printableBottom: number
  printableOverflow: number
}

function getDocxPageOverflow(page: HTMLElement): DocxPageOverflow | null {
  const article = page.querySelector<HTMLElement>(':scope > article')
  if (!article) return null

  const pageRect = page.getBoundingClientRect()
  const pageStyle = getComputedStyle(page)
  const pageHeight = Number.parseFloat(pageStyle.minHeight) || pageRect.height
  const pageBottom = pageRect.top + pageHeight
  const paddingBottom = Number.parseFloat(pageStyle.paddingBottom) || 0
  const printableBottom = pageRect.top + pageHeight - paddingBottom
  const children = Array.from(article.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  )
  const meaningfulChildren = children.filter(
    (child) => child.textContent?.trim() || child.querySelector('img, svg, table'),
  )
  const visibleContentBottom = meaningfulChildren.reduce(
    (bottom, child) => Math.max(bottom, child.getBoundingClientRect().bottom),
    article.getBoundingClientRect().top,
  )

  return {
    article,
    children,
    clippedOverflow: visibleContentBottom - pageBottom,
    page,
    pageBottom,
    printableBottom,
    printableOverflow: article.getBoundingClientRect().bottom - printableBottom,
  }
}

function splitDocxPage(
  pages: HTMLElement[],
  candidate: DocxPageOverflow,
  preserveWordPagination: boolean,
) {
  const firstContent = candidate.children.find(
    (child) => child.textContent?.trim() || child.querySelector('img, svg, table'),
  )
  if (!firstContent) return false

  let splitIndex = -1
  if (preserveWordPagination) {
    const firstContentTop = firstContent.getBoundingClientRect().top
    const semanticThreshold = firstContentTop
      + (candidate.printableBottom - firstContentTop) * 0.8
    splitIndex = candidate.children.findIndex((child, index) =>
      index > 0
      && Boolean(child.textContent?.trim() || child.querySelector('img, svg, table'))
      && child.getBoundingClientRect().top >= semanticThreshold)

    if (splitIndex < 1) {
      splitIndex = candidate.children.findIndex((child, index) =>
        index > 0 && child.getBoundingClientRect().bottom > candidate.printableBottom)
    }
  } else {
    const firstContentTop = firstContent.getBoundingClientRect().top
    const semanticThreshold = firstContentTop
      + (candidate.pageBottom - firstContentTop) * 0.8
    splitIndex = candidate.children.findIndex((child, index) =>
      index > 0
      && Boolean(child.textContent?.trim() || child.querySelector('img, svg, table'))
      && child.getBoundingClientRect().top >= semanticThreshold)

    if (splitIndex < 1) {
      splitIndex = candidate.children.findIndex((child, index) =>
        index > 0
        && Boolean(child.textContent?.trim() || child.querySelector('img, svg, table'))
        && child.getBoundingClientRect().bottom > candidate.pageBottom)
    }
  }

  if (splitIndex < 1 || splitIndex >= candidate.children.length) return false

  const continuation = candidate.page.cloneNode(true)
  if (!(continuation instanceof HTMLElement)) return false
  const continuationArticle = continuation.querySelector<HTMLElement>(':scope > article')
  if (!continuationArticle) return false

  continuationArticle.replaceChildren(...candidate.children.slice(splitIndex))
  candidate.page.insertAdjacentElement('afterend', continuation)
  const pageIndex = pages.indexOf(candidate.page)
  pages.splice(pageIndex + 1, 0, continuation)
  return true
}

function paginateDocxOverflow(pages: HTMLElement[], expectedPageCount: number | null, signal?: AbortSignal) {
  const result = [...pages]
  const maxAdditionalPages = 20
  const expectedPagesToAdd = Math.min(
    Math.max((expectedPageCount ?? result.length) - result.length, 0),
    maxAdditionalPages,
  )
  let addedPages = 0

  while (addedPages < expectedPagesToAdd) {
    throwIfOfficeConversionAborted(signal)
    const candidates = result
      .map(getDocxPageOverflow)
      .filter((entry): entry is DocxPageOverflow => Boolean(entry))
      .sort((left, right) => right.printableOverflow - left.printableOverflow)
    let didSplit = false

    for (const candidate of candidates) {
      throwIfOfficeConversionAborted(signal)
      if (candidate.printableOverflow <= 4) break
      if (splitDocxPage(result, candidate, true)) {
        addedPages += 1
        didSplit = true
        break
      }
    }
    if (!didSplit) break
  }

  while (addedPages < maxAdditionalPages) {
    throwIfOfficeConversionAborted(signal)
    const candidates = result
      .map(getDocxPageOverflow)
      .filter((entry): entry is DocxPageOverflow => Boolean(entry))
      .sort((left, right) => right.clippedOverflow - left.clippedOverflow)
    let didSplit = false

    for (const candidate of candidates) {
      throwIfOfficeConversionAborted(signal)
      if (candidate.clippedOverflow <= 2) break
      if (splitDocxPage(result, candidate, false)) {
        addedPages += 1
        didSplit = true
        break
      }
    }
    if (!didSplit) break
  }

  return result
}

function normalizeDocxPages(pages: HTMLElement[]) {
  pages.forEach((page) => {
    const style = getComputedStyle(page)
    for (const variable of ['--docx-majorHAnsi-font', '--docx-minorHAnsi-font']) {
      const officeFont = style.getPropertyValue(variable).trim()
      if (officeFont) page.style.setProperty(variable, officeFont + ', Arial, sans-serif')
    }

    page.querySelectorAll<HTMLElement>('[style*="font-family"]').forEach((element) => {
      const officeFont = element.style.fontFamily.trim()
      if (officeFont && !/(?:^|,)\s*(?:sans-serif|serif|monospace)\s*$/i.test(officeFont)) {
        element.style.fontFamily = officeFont + ', Arial, sans-serif'
      }
    })

    page.querySelectorAll<HTMLParagraphElement>('p').forEach((paragraph) => {
      const isNumbered = Array.from(paragraph.classList).some((name) => name.includes('-num-'))
      const hasContent = Boolean(paragraph.textContent?.trim() || paragraph.querySelector('img, svg, table'))
      if (isNumbered && !hasContent) paragraph.remove()
    })
  })
}

async function convertDocxToPdf(
  documentBuffer: ArrayBuffer,
  archive: OfficeArchive,
  onProgress: (value: number) => void,
  signal?: AbortSignal,
) {
  throwIfOfficeConversionAborted(signal)
  const [{ renderAsync }, { default: html2canvas }, { jsPDF }] = await Promise.all([
    import('docx-preview'),
    import('html2canvas'),
    import('jspdf'),
  ])
  throwIfOfficeConversionAborted(signal)
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
    throwIfOfficeConversionAborted(signal)
    const { anchorLayouts, expectedPageCount } = await readDocxLayoutMetadata(archive, signal)
    if (expectedPageCount !== null) assertOfficePdfPageCount(expectedPageCount)
    throwIfOfficeConversionAborted(signal)
    await renderAsync(documentBuffer, container, undefined, {
      className: 'naroz-docx-preview',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      ignoreWidth: false,
      ignoreHeight: false,
      useBase64URL: true,
    })
    throwIfOfficeConversionAborted(signal)

    let pages = Array.from(container.querySelectorAll<HTMLElement>('section.naroz-docx-preview'))
    if (!pages.length) throw new Error('DOCX_EMPTY')
    assertOfficePdfPageCount(pages.length)

    const wrapper = container.querySelector<HTMLElement>('.naroz-docx-preview-wrapper')
    if (wrapper) {
      wrapper.style.width = 'max-content'
      wrapper.style.alignItems = 'flex-start'
    }
    pages.forEach((page) => {
      page.style.flex = 'none'
    })
    normalizeDocxPages(pages)
    await waitForElementAssets(container, signal)
    pages = paginateDocxOverflow(pages, expectedPageCount, signal)
    assertOfficePdfPageCount(pages.length)
    throwIfOfficeConversionAborted(signal)
    pages.forEach((page) => {
      const computedPage = getComputedStyle(page)
      const pageWidth = Math.max(1, Number.parseFloat(computedPage.width))
      const pageHeight = Math.max(1, Number.parseFloat(computedPage.minHeight))
      page.style.width = pageWidth + 'px'
      page.style.height = pageHeight + 'px'
      page.style.minWidth = pageWidth + 'px'
      page.style.minHeight = pageHeight + 'px'
    })
    applyDocxAnchorLayouts(pages, anchorLayouts)
    await waitForElementAssets(container, signal)
    let pdf: JsPdfDocument | null = null
    let totalRasterPixels = 0

    for (let index = 0; index < pages.length; index += 1) {
      throwIfOfficeConversionAborted(signal)
      const page = pages[index]
      const computedPage = getComputedStyle(page)
      const pageWidth = Math.max(1, Number.parseFloat(computedPage.width))
      const pageHeight = Math.max(1, Number.parseFloat(computedPage.height))
      totalRasterPixels = assertOfficePdfRasterBudget(pageWidth, pageHeight, totalRasterPixels)
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff',
        scale: 1.5,
        logging: false,
        useCORS: true,
        width: pageWidth,
        height: pageHeight,
        windowWidth: pageWidth,
        windowHeight: pageHeight,
      })
      try {
        throwIfOfficeConversionAborted(signal)

        const format = getPdfPageFormat(pageWidth, pageHeight)
        if (!pdf) {
          pdf = new jsPDF({
            unit: 'mm',
            format: [format.pageWidth, format.pageHeight],
            orientation: format.orientation,
          })
        } else {
          pdf.addPage([format.pageWidth, format.pageHeight], format.orientation)
        }
        pdf.addImage(
          canvas.toDataURL('image/jpeg', 0.95),
          'JPEG',
          0,
          0,
          format.pageWidth,
          format.pageHeight,
          undefined,
          'FAST',
        )
      } finally {
        canvas.width = 1
        canvas.height = 1
      }
      throwIfOfficeConversionAborted(signal)
      onProgress(Math.round(((index + 1) / pages.length) * 100))
    }

    if (!pdf) throw new Error('DOCX_EMPTY')
    throwIfOfficeConversionAborted(signal)
    return pdf.output('blob')
  } finally {
    container.remove()
  }
}

async function convertSpreadsheetToPdf(file: File, onProgress: (value: number) => void, signal?: AbortSignal) {
  throwIfOfficeConversionAborted(signal)
  const [{ jsPDF }, { autoTable }, XLSX] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('xlsx'),
  ])
  throwIfOfficeConversionAborted(signal)
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true,
    sheetRows: MAX_EXCEL_ROWS,
  })
  throwIfOfficeConversionAborted(signal)
  if (!workbook.SheetNames.length) throw new Error('XLSX_EMPTY')
  if (workbook.SheetNames.length > MAX_EXCEL_SHEETS) throw new Error('XLSX_TOO_MANY_SHEETS')

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })

  for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
    throwIfOfficeConversionAborted(signal)
    if (sheetIndex > 0) pdf.addPage('a4', 'landscape')
    const sheet = workbook.Sheets[sheetName]
    const sourceRange = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1')
    const limitedRange = limitExcelRange(sourceRange, MAX_EXCEL_ROWS, MAX_EXCEL_COLUMNS)
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(sheet, {
      header: 1,
      defval: '',
      raw: false,
      range: limitedRange,
    })
    const normalizedRows = rows.map((row) => row.map(String))
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
  }

  throwIfOfficeConversionAborted(signal)
  return pdf.output('blob')
}

async function waitForElementAssets(element: HTMLElement, signal?: AbortSignal) {
  throwIfOfficeConversionAborted(signal)
  await document.fonts.ready
  throwIfOfficeConversionAborted(signal)

  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(images.map(async (image) => {
    if (image.complete) return

    await new Promise<void>((resolve, reject) => {
      const timeoutId: { current?: number } = {}
      const finish = () => {
        image.removeEventListener('load', finish)
        image.removeEventListener('error', finish)
        if (timeoutId.current !== undefined) window.clearTimeout(timeoutId.current)
        signal?.removeEventListener('abort', cancel)
        resolve()
      }
      const cancel = () => {
        image.removeEventListener('load', finish)
        image.removeEventListener('error', finish)
        if (timeoutId.current !== undefined) window.clearTimeout(timeoutId.current)
        signal?.removeEventListener('abort', cancel)
        reject(new Error(OFFICE_TO_PDF_CANCELLED))
      }

      if (signal?.aborted) {
        cancel()
        return
      }

      image.addEventListener('load', finish, { once: true })
      image.addEventListener('error', finish, { once: true })
      signal?.addEventListener('abort', cancel, { once: true })
      timeoutId.current = window.setTimeout(finish, 5000)
    })
  }))

  throwIfOfficeConversionAborted(signal)
  await new Promise<void>((resolve, reject) => {
    const animationFrames: { first?: number; second?: number } = {}
    const finish = () => {
      if (animationFrames.first !== undefined) window.cancelAnimationFrame(animationFrames.first)
      if (animationFrames.second !== undefined) window.cancelAnimationFrame(animationFrames.second)
      signal?.removeEventListener('abort', cancel)
      resolve()
    }
    const cancel = () => {
      if (animationFrames.first !== undefined) window.cancelAnimationFrame(animationFrames.first)
      if (animationFrames.second !== undefined) window.cancelAnimationFrame(animationFrames.second)
      signal?.removeEventListener('abort', cancel)
      reject(new Error(OFFICE_TO_PDF_CANCELLED))
    }

    if (signal?.aborted) {
      cancel()
      return
    }

    signal?.addEventListener('abort', cancel, { once: true })
    animationFrames.first = requestAnimationFrame(() => {
      animationFrames.second = requestAnimationFrame(finish)
    })
  })
}

async function convertPresentationToPdf(file: File, onProgress: (value: number) => void, signal?: AbortSignal) {
  throwIfOfficeConversionAborted(signal)
  const [{ PptxViewer, RECOMMENDED_ZIP_LIMITS }, { default: html2canvas }, { jsPDF }] = await Promise.all([
    import('@aiden0z/pptx-renderer'),
    import('html2canvas'),
    import('jspdf'),
  ])
  throwIfOfficeConversionAborted(signal)
  const viewerHost = document.createElement('div')
  const exportHost = document.createElement('div')
  let destroyViewer: () => void = () => {}

  for (const host of [viewerHost, exportHost]) {
    host.setAttribute('aria-hidden', 'true')
    Object.assign(host.style, {
      position: 'fixed',
      left: '-100000px',
      top: '0',
      overflow: 'hidden',
      background: '#ffffff',
      zIndex: '-1',
    })
    document.body.appendChild(host)
  }

  try {
    const viewer = await PptxViewer.open(await file.arrayBuffer(), viewerHost, {
      renderMode: 'slide',
      fitMode: 'none',
      zipLimits: RECOMMENDED_ZIP_LIMITS,
      pdfjs: false,
      signal,
    })
    destroyViewer = () => viewer.destroy()
    throwIfOfficeConversionAborted(signal)

    if (!viewer.slideCount || !viewer.slideWidth || !viewer.slideHeight) {
      throw new Error('PPTX_EMPTY')
    }
    assertOfficePdfPageCount(viewer.slideCount)
    assertOfficePdfRasterBudget(viewer.slideWidth, viewer.slideHeight)

    exportHost.style.width = `${viewer.slideWidth}px`
    exportHost.style.height = `${viewer.slideHeight}px`
    const isLandscape = viewer.slideWidth >= viewer.slideHeight
    const pageHeight = isLandscape ? 190.5 : 297
    const pageWidth = pageHeight * (viewer.slideWidth / viewer.slideHeight)
    const orientation = isLandscape ? 'landscape' : 'portrait'
    const pdf = new jsPDF({ unit: 'mm', format: [pageWidth, pageHeight], orientation })
    let totalRasterPixels = 0

    for (let index = 0; index < viewer.slideCount; index += 1) {
      throwIfOfficeConversionAborted(signal)
      exportHost.replaceChildren()
      const handle = viewer.renderSlideToContainer(index, exportHost)
      if (!handle) throw new Error('PPTX_SLIDE')

      try {
        await handle.ready
        throwIfOfficeConversionAborted(signal)
        await waitForElementAssets(handle.element, signal)
        totalRasterPixels = assertOfficePdfRasterBudget(viewer.slideWidth, viewer.slideHeight, totalRasterPixels)
        const canvas = await html2canvas(handle.element, {
          backgroundColor: '#ffffff',
          scale: 1.5,
          logging: false,
          useCORS: true,
          width: viewer.slideWidth,
          height: viewer.slideHeight,
          windowWidth: viewer.slideWidth,
          windowHeight: viewer.slideHeight,
        })
        try {
          throwIfOfficeConversionAborted(signal)

          if (index > 0) pdf.addPage([pageWidth, pageHeight], orientation)
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
        } finally {
          canvas.width = 1
          canvas.height = 1
        }
      } finally {
        handle.dispose()
      }

      throwIfOfficeConversionAborted(signal)
      onProgress(Math.round(((index + 1) / viewer.slideCount) * 100))
    }

    throwIfOfficeConversionAborted(signal)
    return pdf.output('blob')
  } finally {
    destroyViewer()
    viewerHost.remove()
    exportHost.remove()
  }
}
export async function convertOfficeToPdf(
  file: File,
  kind: OfficeFileKind,
  onProgress: (value: number) => void,
  signal?: AbortSignal,
) {
  throwIfOfficeConversionAborted(signal)
  if (kind === 'docx') {
    const documentBuffer = await file.arrayBuffer()
    const { loadSafeOfficeArchive } = await import('./officeArchiveLimits')
    const archive = await loadSafeOfficeArchive(documentBuffer, signal)
    throwIfOfficeConversionAborted(signal)
    return convertDocxToPdf(documentBuffer, archive.zip, onProgress, signal)
  }

  if (kind === 'pptx' || (kind === 'xlsx' && file.name.toLowerCase().endsWith('.xlsx'))) {
    const { assertSafeOfficeArchive } = await import('./officeArchiveLimits')
    await assertSafeOfficeArchive(await file.arrayBuffer(), signal)
    throwIfOfficeConversionAborted(signal)
  }

  if (kind === 'xlsx') return convertSpreadsheetToPdf(file, onProgress, signal)
  return convertPresentationToPdf(file, onProgress, signal)
}
