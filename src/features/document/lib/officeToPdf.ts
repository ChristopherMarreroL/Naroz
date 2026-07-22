import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

export type OfficeFileKind = 'docx' | 'xlsx' | 'pptx'

export const OFFICE_TO_PDF_MAX_SIZE = 25 * 1024 * 1024
const MAX_EXCEL_ROWS = 10_000
const MAX_EXCEL_COLUMNS = 100
const CSS_PIXELS_PER_INCH = 96
const MILLIMETERS_PER_INCH = 25.4
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

async function readDocxLayoutMetadata(buffer: ArrayBuffer): Promise<DocxLayoutMetadata> {
  const zip = await new JSZip().loadAsync(buffer)
  const documentPart = zip.file('word/document.xml')
  const appPart = zip.file('docProps/app.xml')
  if (!documentPart) return { anchorLayouts: [], expectedPageCount: null }

  const xml = new DOMParser().parseFromString(await documentPart.async('text'), 'application/xml')
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
    const appXml = new DOMParser().parseFromString(await appPart.async('text'), 'application/xml')
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

function paginateDocxOverflow(pages: HTMLElement[], expectedPageCount: number | null) {
  const result = [...pages]
  const pagesToAdd = Math.min(Math.max((expectedPageCount ?? result.length) - result.length, 0), 20)

  for (let iteration = 0; iteration < pagesToAdd; iteration += 1) {
    const candidate = result
      .map((page) => {
        const article = page.querySelector<HTMLElement>(':scope > article')
        if (!article) return null

        const pageRect = page.getBoundingClientRect()
        const pageStyle = getComputedStyle(page)
        const pageHeight = Number.parseFloat(pageStyle.minHeight) || pageRect.height
        const contentBottom = pageRect.top + pageHeight - Number.parseFloat(pageStyle.paddingBottom)
        return {
          article,
          contentBottom,
          overflow: article.getBoundingClientRect().bottom - contentBottom,
          page,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) => right.overflow - left.overflow)[0]

    if (!candidate || candidate.overflow <= 4) break

    const children = Array.from(candidate.article.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    )
    const firstContent = children.find((child) => child.textContent?.trim() || child.querySelector('img'))
    if (!firstContent) break

    const semanticThreshold = firstContent.getBoundingClientRect().top
      + (candidate.contentBottom - firstContent.getBoundingClientRect().top) * 0.8
    let splitIndex = children.findIndex((child, index) =>
      index > 0
      && Boolean(child.textContent?.trim() || child.querySelector('img'))
      && child.getBoundingClientRect().top >= semanticThreshold)

    if (splitIndex < 1) {
      splitIndex = children.findIndex((child, index) =>
        index > 0 && child.getBoundingClientRect().bottom > candidate.contentBottom)
    }
    if (splitIndex < 1 || splitIndex >= children.length) break

    const continuation = candidate.page.cloneNode(true)
    if (!(continuation instanceof HTMLElement)) break
    const continuationArticle = continuation.querySelector<HTMLElement>(':scope > article')
    if (!continuationArticle) break

    continuationArticle.replaceChildren(...children.slice(splitIndex))
    candidate.page.insertAdjacentElement('afterend', continuation)
    const pageIndex = result.indexOf(candidate.page)
    result.splice(pageIndex + 1, 0, continuation)
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
    const documentBuffer = await file.arrayBuffer()
    const { anchorLayouts, expectedPageCount } = await readDocxLayoutMetadata(documentBuffer)
    await renderAsync(documentBuffer, container, undefined, {
      className: 'naroz-docx-preview',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      ignoreWidth: false,
      ignoreHeight: false,
      useBase64URL: true,
    })

    let pages = Array.from(container.querySelectorAll<HTMLElement>('section.naroz-docx-preview'))
    if (!pages.length) throw new Error('DOCX_EMPTY')

    const wrapper = container.querySelector<HTMLElement>('.naroz-docx-preview-wrapper')
    if (wrapper) {
      wrapper.style.width = 'max-content'
      wrapper.style.alignItems = 'flex-start'
    }
    pages.forEach((page) => {
      page.style.flex = 'none'
    })
    normalizeDocxPages(pages)
    await waitForElementAssets(container)
    pages = paginateDocxOverflow(pages, expectedPageCount)
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
    await waitForElementAssets(container)
    let pdf: jsPDF | null = null

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      const computedPage = getComputedStyle(page)
      const pageWidth = Math.max(1, Number.parseFloat(computedPage.width))
      const pageHeight = Math.max(1, Number.parseFloat(computedPage.height))
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

async function waitForElementAssets(element: HTMLElement) {
  await document.fonts.ready

  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(images.map(async (image) => {
    if (image.complete) return

    await new Promise<void>((resolve) => {
      const finish = () => {
        image.removeEventListener('load', finish)
        image.removeEventListener('error', finish)
        resolve()
      }
      image.addEventListener('load', finish, { once: true })
      image.addEventListener('error', finish, { once: true })
      window.setTimeout(finish, 5000)
    })
  }))

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function convertPresentationToPdf(file: File, onProgress: (value: number) => void) {
  const [{ PptxViewer, RECOMMENDED_ZIP_LIMITS }, { default: html2canvas }] = await Promise.all([
    import('@aiden0z/pptx-renderer'),
    import('html2canvas'),
  ])
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
    })
    destroyViewer = () => viewer.destroy()

    if (!viewer.slideCount || !viewer.slideWidth || !viewer.slideHeight) {
      throw new Error('PPTX_EMPTY')
    }

    exportHost.style.width = `${viewer.slideWidth}px`
    exportHost.style.height = `${viewer.slideHeight}px`
    const isLandscape = viewer.slideWidth >= viewer.slideHeight
    const pageHeight = isLandscape ? 190.5 : 297
    const pageWidth = pageHeight * (viewer.slideWidth / viewer.slideHeight)
    const orientation = isLandscape ? 'landscape' : 'portrait'
    const pdf = new jsPDF({ unit: 'mm', format: [pageWidth, pageHeight], orientation })

    for (let index = 0; index < viewer.slideCount; index += 1) {
      exportHost.replaceChildren()
      const handle = viewer.renderSlideToContainer(index, exportHost)
      if (!handle) throw new Error('PPTX_SLIDE')

      try {
        await handle.ready
        await waitForElementAssets(handle.element)
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

        if (index > 0) pdf.addPage([pageWidth, pageHeight], orientation)
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
        canvas.width = 1
        canvas.height = 1
      } finally {
        handle.dispose()
      }

      onProgress(Math.round(((index + 1) / viewer.slideCount) * 100))
    }

    return pdf.output('blob')
  } finally {
    destroyViewer()
    viewerHost.remove()
    exportHost.remove()
  }
}
export async function convertOfficeToPdf(file: File, kind: OfficeFileKind, onProgress: (value: number) => void) {
  if (kind === 'docx') return convertDocxToPdf(file, onProgress)
  if (kind === 'xlsx') return convertSpreadsheetToPdf(file, onProgress)
  return convertPresentationToPdf(file, onProgress)
}
