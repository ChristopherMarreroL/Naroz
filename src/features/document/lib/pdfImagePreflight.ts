import { createPdfLoadingTask } from '../../../lib/fileCompatibility/pdfRuntime'
import { PDF_EDITOR_LOADING_LIMITS, PdfInputLimitError } from './pdfEditor'

/** Use the native content parser to inspect inline images, forms and image masks without raster decoding. */
export async function preflightPdfEditorImages(bytes: Uint8Array, signal: AbortSignal) {
  signal.throwIfAborted()
  const task = createPdfLoadingTask(bytes.slice(), {
    ...PDF_EDITOR_LOADING_LIMITS,
    imageResourcePreflight: true,
    maxTotalImagePixels: 250_000_000,
  })
  const cancel = () => { void task.destroy().catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const pdf = await task.promise
    signal.throwIfAborted()
    if (pdf.numPages < 1 || pdf.numPages > 500) throw new PdfInputLimitError('page budget')
    for (let index = 1; index <= pdf.numPages; index++) {
      signal.throwIfAborted()
      const page = await pdf.getPage(index)
      try { await page.getOperatorList({ intent: 'any' }); signal.throwIfAborted() }
      finally { page.cleanup() }
    }
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof Error && error.message.includes('Image resource budget exceeded.')) throw new PdfInputLimitError('image budget')
    throw error
  } finally {
    signal.removeEventListener('abort', cancel)
    await task.destroy().catch(() => undefined)
  }
}
