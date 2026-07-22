import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export type OfficeFileKind = 'docx' | 'xlsx' | 'pptx'

export const OFFICE_TO_PDF_MAX_SIZE = 25 * 1024 * 1024
const MAX_EXCEL_ROWS = 10_000
const MAX_EXCEL_COLUMNS = 100
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
  const pageHeight = orientation === 'landscape' ? 190.5 : 297

  return {
    orientation,
    pageHeight,
    pageWidth: pageHeight * (width / height),
  } as const
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
      ignoreLastRenderedPageBreak: false,
      ignoreWidth: false,
      ignoreHeight: false,
      useBase64URL: true,
    })

    const pages = Array.from(container.querySelectorAll<HTMLElement>('section.naroz-docx-preview'))
    if (!pages.length) throw new Error('DOCX_EMPTY')

    await waitForElementAssets(container)
    let pdf: jsPDF | null = null

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      const pageRect = page.getBoundingClientRect()
      const pageWidth = Math.max(1, pageRect.width)
      const pageHeight = Math.max(1, pageRect.height)
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
