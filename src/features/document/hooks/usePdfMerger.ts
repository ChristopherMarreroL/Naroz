import { useCallback, useEffect, useRef, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { openPdfForEditing, validatePdfOutput } from '../../../lib/fileCompatibility/pdf'
import { compatibilityErrorKey } from '../../../lib/fileCompatibility/core'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress } from '../../../types/video'

interface PdfMergeResult {
  blob: Blob
  url: string
  fileName: string
  size: number
}

export const PDF_MERGE_MAX_PAGES = 1_000
const PDF_MERGE_CANCELLED = 'PDF_MERGE_CANCELLED'

export function assertPdfMergePageBudget(currentPages: number, incomingPages: number) {
  if (currentPages + incomingPages > PDF_MERGE_MAX_PAGES) {
    throw new Error('PDF_TOO_MANY_PAGES')
  }
}

export function usePdfMerger() {
  const { locale, t } = useLocale()
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para unir PDFs.' : 'Ready to merge PDFs.',
    detail: locale === 'es' ? 'Agrega dos o mas archivos PDF.' : 'Add two or more PDF files.',
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<PdfMergeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const resultRef = useRef<PdfMergeResult | null>(null)
  const activeMergeControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    resultRef.current = result
  }, [result])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      activeMergeControllerRef.current?.abort()
      activeMergeControllerRef.current = null
      if (resultRef.current?.url) {
        URL.revokeObjectURL(resultRef.current.url)
      }
    }
  }, [])

  useEffect(() => {
    setProgress((current) =>
      current.stage === 'idle'
        ? {
            stage: 'idle',
            percent: 0,
            message: locale === 'es' ? 'Listo para unir PDFs.' : 'Ready to merge PDFs.',
            detail: locale === 'es' ? 'Agrega dos o mas archivos PDF.' : 'Add two or more PDF files.',
          }
        : current,
    )
  }, [locale])

  const resetResult = useCallback(() => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      resultRef.current = null
      return null
    })
  }, [])

  const resetMergeState = useCallback(() => {
    activeMergeControllerRef.current?.abort()
    activeMergeControllerRef.current = null
    setIsProcessing(false)
    resetResult()
    setError(null)
    setProgress({
      stage: 'idle',
      percent: 0,
      message: locale === 'es' ? 'Listo para unir PDFs.' : 'Ready to merge PDFs.',
      detail: locale === 'es' ? 'Agrega dos o mas archivos PDF.' : 'Add two or more PDF files.',
    })
  }, [locale, resetResult])

  const mergePdfFiles = useCallback(async (files: File[]) => {
    activeMergeControllerRef.current?.abort()
    const controller = new AbortController()
    activeMergeControllerRef.current = controller
    const isCurrentMerge = () => mountedRef.current && activeMergeControllerRef.current === controller && !controller.signal.aborted
    const ensureCurrentMerge = () => {
      if (!isCurrentMerge()) {
        throw new Error(PDF_MERGE_CANCELLED)
      }
    }

    setError(null)
    resetResult()
    setIsProcessing(true)

    try {
      ensureCurrentMerge()
      setProgress({
        stage: 'preparing',
        percent: 10,
        message: t('stagePreparing'),
        detail: locale === 'es' ? 'Leyendo los PDFs seleccionados.' : 'Reading the selected PDFs.',
      })

      const mergedPdf = await PDFDocument.create()
      let totalPages = 0
      const compatibilityPages: number[] = []
      const budget = { pixels: 0, bytes: 0 }

      for (const [index, file] of files.entries()) {
        ensureCurrentMerge()
        const buffer = await file.arrayBuffer()
        ensureCurrentMerge()
        const source = await openPdfForEditing(buffer, controller.signal, PDF_MERGE_MAX_PAGES - totalPages)
        try {
          ensureCurrentMerge()
          assertPdfMergePageBudget(totalPages, source.pageCount)
          if (source.preflight.canNormalize) compatibilityPages.push(totalPages + 1)
          await source.appendTo(mergedPdf, Array.from({ length: source.pageCount }, (_, page) => page), budget)
          totalPages += source.pageCount
        } finally {
          await source.dispose()
        }
        ensureCurrentMerge()

        setProgress({
          stage: 'merging',
          percent: Math.min(95, Math.round(((index + 1) / files.length) * 84) + 10),
          message: locale === 'es' ? 'Uniendo PDFs...' : 'Merging PDFs...',
          detail: locale === 'es' ? `Procesando ${file.name}.` : `Processing ${file.name}.`,
        })
      }

      const bytes = await mergedPdf.save()
      if (compatibilityPages.length) await validatePdfOutput(bytes, totalPages, compatibilityPages, controller.signal)
      ensureCurrentMerge()
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const blob = new Blob([copy.buffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      if (!isCurrentMerge()) {
        URL.revokeObjectURL(url)
        throw new Error(PDF_MERGE_CANCELLED)
      }
      const mergeResult: PdfMergeResult = {
        blob,
        url,
        fileName: 'naroz-documentos-unidos.pdf',
        size: blob.size,
      }

      ensureCurrentMerge()
      resultRef.current = mergeResult
      setResult(mergeResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: t('pdfMergeCompleted'),
        detail: t(compatibilityPages.length ? 'compatibilityPdfNormalized' : 'pdfReadyToDownload'),
      })

      return mergeResult
    } catch (mergeError) {
      if (!isCurrentMerge() || (mergeError instanceof Error && mergeError.message === PDF_MERGE_CANCELLED)) {
        return null
      }
      const exceededPageLimit = mergeError instanceof Error && mergeError.message === 'PDF_TOO_MANY_PAGES'
      const errorKey = compatibilityErrorKey(mergeError)
      setError(errorKey ? t(errorKey) : exceededPageLimit
        ? t('pdfMergeTooManyPages')
        : locale === 'es' ? 'No se pudieron unir los PDFs seleccionados.' : 'The selected PDFs could not be merged.')
      setProgress({
        stage: 'error',
        percent: 0,
        message: t('pdfMergeError'),
        detail: exceededPageLimit
          ? t('pdfMergeTooManyPages')
          : locale === 'es' ? 'Verifica que todos los archivos sean PDFs validos.' : 'Make sure all files are valid PDFs.',
      })
      return null
    } finally {
      if (activeMergeControllerRef.current === controller) {
        activeMergeControllerRef.current = null
        if (mountedRef.current) {
          setIsProcessing(false)
        }
      }
    }
  }, [locale, resetResult, t])

  return { progress, isProcessing, result, error, mergePdfFiles, resetMergeState }
}
