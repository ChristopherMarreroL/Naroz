import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { FileCompatibilityError, hasPdfSignature } from './core'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

/** Data belongs to the loading task: PDF.js can transfer/detach it. */
export function createPdfLoadingTask(data: ArrayBuffer | Uint8Array, limits?: { maxImageSize: number; canvasMaxAreaInBytes: number; imageResourcePreflight?: boolean; maxTotalImagePixels?: number }) {
  if (!hasPdfSignature(data)) throw new FileCompatibilityError('FILE_TYPE_MISMATCH')
  const options = {
    data,
    useWorkerFetch: false,
    disableStream: true,
    disableAutoFetch: true,
    stopAtErrors: true,
    maxImageSize: limits?.maxImageSize ?? -1,
    canvasMaxAreaInBytes: limits?.canvasMaxAreaInBytes ?? -1,
    imageResourcePreflight: limits?.imageResourcePreflight ?? false,
    maxTotalImagePixels: limits?.maxTotalImagePixels ?? -1,
    verbosity: 0,
  }
  return getDocument(options)
}
