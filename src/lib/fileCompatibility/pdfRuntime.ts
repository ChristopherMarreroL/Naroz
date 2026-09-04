import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { FileCompatibilityError, hasPdfSignature } from './core'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

/** Data belongs to the loading task: PDF.js can transfer/detach it. */
export function createPdfLoadingTask(data: ArrayBuffer | Uint8Array) {
  if (!hasPdfSignature(data)) throw new FileCompatibilityError('FILE_TYPE_MISMATCH')
  return getDocument({
    data,
    useWorkerFetch: false,
    disableStream: true,
    disableAutoFetch: true,
    stopAtErrors: true,
    verbosity: 0,
  })
}
