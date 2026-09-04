import { EncryptedPDFError, PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { assertSafeImageDimensions } from '../../features/image/lib/imageLimits'
import { assertNotAborted, classifyPdfError, FileCompatibilityError, hasPdfSignature, type FilePreflightResult } from './core'
import { addPdfPageLinks, collectPdfPageLinks, PDF_LINKS_PER_OUTPUT } from './pdfLinks'

export const PDF_COMPATIBILITY_MAX_PIXELS = 250_000_000
export const PDF_COMPATIBILITY_MAX_BYTES = 100 * 1024 * 1024
// pdf-lib 1.x's ES5 Error subclass does not reliably preserve its prototype/name.
const encryptedPdfMessage = new EncryptedPDFError().message
export interface PdfRasterBudget { pixels: number; bytes: number; links?: number }

async function openReadablePdf(data: Uint8Array, signal?: AbortSignal) {
  assertNotAborted(signal)
  const { createPdfLoadingTask } = await import('./pdfRuntime')
  assertNotAborted(signal)
  const task = createPdfLoadingTask(data)
  let destroyed: Promise<void> | undefined
  const destroy = () => destroyed ??= task.destroy().catch(() => undefined)
  const abort = () => { void destroy() }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    assertNotAborted(signal)
    const pdf = await task.promise
    assertNotAborted(signal)
    return { pdf, dispose: async () => {
      signal?.removeEventListener('abort', abort)
      await destroy()
    } }
  } catch (error) {
    signal?.removeEventListener('abort', abort)
    await destroy()
    assertNotAborted(signal)
    throw classifyPdfError(error)
  }
}

/** At most one raster canvas lives at a time; viewport includes PDF page rotation. */
async function withRenderedPage<T>(pdf: PDFDocumentProxy, pageNumber: number, scale: number,
  signal: AbortSignal | undefined, consume: (canvas: HTMLCanvasElement, width: number, height: number, page: PDFPageProxy) => Promise<T>, budget?: PdfRasterBudget) {
  assertNotAborted(signal)
  let page: PDFPageProxy | undefined
  let canvas: HTMLCanvasElement | undefined
  let render: RenderTask | undefined
  const abort = () => render?.cancel()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    page = await pdf.getPage(pageNumber)
    assertNotAborted(signal)
    const size = page.getViewport({ scale: 1 })
    assertSafeImageDimensions(size.width, size.height)
    const safeScale = Math.min(scale, 8192 / size.width, 8192 / size.height, Math.sqrt(16_000_000 / (size.width * size.height)))
    const viewport = page.getViewport({ scale: safeScale })
    const width = Math.max(1, Math.floor(viewport.width))
    const height = Math.max(1, Math.floor(viewport.height))
    assertSafeImageDimensions(width, height)
    if (budget) {
      budget.pixels += width * height
      if (budget.pixels > PDF_COMPATIBILITY_MAX_PIXELS) throw new FileCompatibilityError('PDF_RASTER_LIMIT')
    }
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new FileCompatibilityError('PDF_OUTPUT_INVALID')
    render = page.render({ canvas, canvasContext: context, viewport, background: 'white' })
    await render.promise
    assertNotAborted(signal)
    return await consume(canvas, size.width, size.height, page)
  } finally {
    signal?.removeEventListener('abort', abort)
    render?.cancel()
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    page?.cleanup()
  }
}

export interface EditablePdf {
  preflight: FilePreflightResult
  pageCount: number
  appendTo: (output: PDFDocument, indices: number[], budget: PdfRasterBudget) => Promise<void>
  dispose: () => Promise<void>
}

/** Normal PDFs stay vector/text PDFs. Only actual encryption uses raster compatibility. */
export async function openPdfForEditing(buffer: ArrayBuffer, signal?: AbortSignal, maxPages = 1000): Promise<EditablePdf> {
  assertNotAborted(signal)
  if (!hasPdfSignature(buffer)) throw new FileCompatibilityError('FILE_TYPE_MISMATCH')
  let source: PDFDocument | undefined
  try {
    source = await PDFDocument.load(buffer)
  } catch (error) {
    if (!(error instanceof Error) || error.message !== encryptedPdfMessage) throw classifyPdfError(error)
  }
  assertNotAborted(signal)
  const readable = source ? undefined : await openReadablePdf(new Uint8Array(buffer), signal)
  let pageCount: number
  try {
    pageCount = source?.getPageCount() ?? readable!.pdf.numPages
  } catch (error) {
    await readable?.dispose()
    throw classifyPdfError(error)
  }
  if (pageCount < 1 || pageCount > maxPages) {
    await readable?.dispose()
    throw new FileCompatibilityError(pageCount < 1 ? 'FILE_CORRUPT' : 'PDF_TOO_MANY_PAGES')
  }
  return {
    preflight: {
      detectedType: 'pdf', status: source ? 'normal' : 'compatibility-required', encrypted: !source,
      canProcessDirectly: !!source, canNormalize: !source, warnings: source ? [] : ['PDF_RASTERIZED'],
    },
    pageCount,
    dispose: async () => { await readable?.dispose() },
    appendTo: async (output, indices, budget) => {
      assertNotAborted(signal)
      if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= pageCount)) throw new FileCompatibilityError('FILE_CORRUPT')
      if (source) {
        const copied = await output.copyPages(source, indices)
        assertNotAborted(signal)
        copied.forEach((page) => output.addPage(page))
        return
      }
      for (const index of indices) {
        await withRenderedPage(readable!.pdf, index + 1, 2, signal, async (canvas, width, height, page) => {
          const links = await collectPdfPageLinks(page, canvas.getContext('2d')!, signal)
          assertNotAborted(signal)
          budget.links = (budget.links ?? 0) + links.length
          if (budget.links > PDF_LINKS_PER_OUTPUT) throw new FileCompatibilityError('PDF_LINK_LIMIT')
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
          assertNotAborted(signal)
          if (!blob) throw new FileCompatibilityError('PDF_OUTPUT_INVALID')
          budget.bytes += blob.size
          if (budget.bytes > PDF_COMPATIBILITY_MAX_BYTES) throw new FileCompatibilityError('PDF_RASTER_LIMIT')
          const image = await output.embedJpg(await blob.arrayBuffer())
          assertNotAborted(signal)
          const outputPage = output.addPage([width, height])
          outputPage.drawImage(image, { x: 0, y: 0, width, height })
          addPdfPageLinks(outputPage, links)
          // Embed now so pdf-lib can release its JPEG embedder before the next page.
          await image.embed()
        }, budget)
      }
    },
  }
}

/** Open the output and render bounded samples, including a normalized page. */
export async function validatePdfOutput(bytes: Uint8Array, expectedPages: number, compatibilityPages: number[], signal?: AbortSignal) {
  const readable = await openReadablePdf(bytes.slice(), signal)
  try {
    if (readable.pdf.numPages !== expectedPages) throw new FileCompatibilityError('PDF_OUTPUT_INVALID')
    const samples = new Set([1, Math.ceil(expectedPages / 2), expectedPages, compatibilityPages[0], compatibilityPages.at(-1)])
    for (const page of samples) {
      if (page) await withRenderedPage(readable.pdf, page, 0.25, signal, async () => undefined)
    }
  } finally {
    await readable.dispose()
  }
}
