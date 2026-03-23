import { useCallback, useEffect, useState } from 'react'
import { PDFDocument } from 'pdf-lib'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress } from '../../../types/video'

interface PdfMergeResult {
  blob: Blob
  url: string
  fileName: string
  size: number
}

export function usePdfMerger() {
  const { locale } = useLocale()
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para unir PDFs.' : 'Ready to merge PDFs.',
    detail: locale === 'es' ? 'Agrega dos o mas archivos PDF.' : 'Add two or more PDF files.',
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<PdfMergeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url)
      }
    }
  }, [result])

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

      return null
    })
  }, [])

  const mergePdfFiles = useCallback(async (files: File[]) => {
    setError(null)
    resetResult()
    setIsProcessing(true)

    try {
      setProgress({
        stage: 'preparing',
        percent: 10,
        message: locale === 'es' ? 'Preparando documentos...' : 'Preparing documents...',
        detail: locale === 'es' ? 'Leyendo los PDFs seleccionados.' : 'Reading the selected PDFs.',
      })

      const mergedPdf = await PDFDocument.create()

      for (const [index, file] of files.entries()) {
        const buffer = await file.arrayBuffer()
        const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
        const pageIndices = sourcePdf.getPageIndices()
        const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices)

        copiedPages.forEach((page) => mergedPdf.addPage(page))

        setProgress({
          stage: 'merging',
          percent: Math.min(95, Math.round(((index + 1) / files.length) * 84) + 10),
          message: locale === 'es' ? 'Uniendo PDFs...' : 'Merging PDFs...',
          detail: locale === 'es' ? `Procesando ${file.name}.` : `Processing ${file.name}.`,
        })
      }

      const bytes = await mergedPdf.save()
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const blob = new Blob([copy.buffer], { type: 'application/pdf' })
      const mergeResult: PdfMergeResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: 'naroz-documentos-unidos.pdf',
        size: blob.size,
      }

      setResult(mergeResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: locale === 'es' ? 'PDF unido correctamente.' : 'PDF merged successfully.',
        detail: locale === 'es' ? 'Tu PDF final ya esta listo para descargar.' : 'Your merged PDF is ready to download.',
      })

      return mergeResult
    } catch (mergeError) {
      setError(locale === 'es' ? 'No se pudieron unir los PDFs seleccionados.' : 'The selected PDFs could not be merged.')
      setProgress({
        stage: 'error',
        percent: 0,
        message: locale === 'es' ? 'La union fallo.' : 'Merge failed.',
        detail: locale === 'es' ? 'Verifica que todos los archivos sean PDFs validos.' : 'Make sure all files are valid PDFs.',
      })
      console.error(mergeError)
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [locale, resetResult])

  return { progress, isProcessing, result, error, mergePdfFiles }
}
