import { useCallback, useEffect, useMemo, useState } from 'react'
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument } from 'pdf-lib'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress } from '../../../types/video'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

interface PdfPagePreview {
  pageNumber: number
  thumbnailUrl: string
}

interface PdfDeleteResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  removedPages: number[]
  totalPages: number
}

interface LoadResult {
  totalPages: number
  previews: PdfPagePreview[]
}

function createOutputName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'documento'
  return `${baseName}-sin-paginas.pdf`
}

async function canvasToObjectUrl(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })

  if (!blob) {
    throw new Error('No se pudo generar la vista previa de la pagina.')
  }

  return URL.createObjectURL(blob)
}

async function renderPageThumbnail(pdf: PDFDocumentProxy, pageNumber: number) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 0.22 })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('No se pudo generar la vista previa de la pagina.')
  }

  const outputScale = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
  canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
  canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`
  canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`

  context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
  await page.render({ canvasContext: context, viewport, canvas }).promise

  const thumbnailUrl = await canvasToObjectUrl(canvas)
  page.cleanup?.()
  return { pageNumber, thumbnailUrl }
}

export async function renderPdfPagePreview(file: File, pageNumber: number, scale = 1.4) {
  const buffer = await file.arrayBuffer()
  const loadingTask = getDocument({
    data: buffer,
    useWorkerFetch: true,
    disableStream: true,
    disableAutoFetch: true,
    isEvalSupported: false,
    stopAtErrors: true,
  })
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('No se pudo generar la vista previa de la pagina.')
  }

  const outputScale = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
  canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
  canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`
  canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`

  context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
  await page.render({ canvasContext: context, viewport, canvas }).promise
  const previewUrl = await canvasToObjectUrl(canvas)
  page.cleanup?.()
  await loadingTask.destroy()
  return previewUrl
}

export function usePdfPageRemover() {
  const { locale, t } = useLocale()
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para eliminar paginas.' : 'Ready to delete pages.',
    detail: locale === 'es' ? 'Agrega un PDF y selecciona las paginas que quieres quitar.' : 'Add a PDF and select the pages you want to remove.',
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<PdfDeleteResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [pagePreviews, setPagePreviews] = useState<PdfPagePreview[]>([])
  const [selectedPages, setSelectedPages] = useState<number[]>([])

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url)
      }
      pagePreviews.forEach((preview) => URL.revokeObjectURL(preview.thumbnailUrl))
    }
  }, [pagePreviews, result])

  useEffect(() => {
    setProgress((current) =>
      current.stage === 'idle'
        ? {
            stage: 'idle',
            percent: 0,
            message: locale === 'es' ? 'Listo para eliminar paginas.' : 'Ready to delete pages.',
            detail: locale === 'es' ? 'Agrega un PDF y selecciona las paginas que quieres quitar.' : 'Add a PDF and select the pages you want to remove.',
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

  const loadPdf = useCallback(async (file: File): Promise<LoadResult> => {
    setError(null)
    resetResult()
    setProgress({
      stage: 'preparing',
      percent: 8,
      message: locale === 'es' ? 'Leyendo PDF...' : 'Reading PDF...',
      detail: locale === 'es' ? 'Generando vistas previas de cada pagina.' : 'Generating page previews.',
    })

    const buffer = await file.arrayBuffer()
    const loadingTask = getDocument({
      data: buffer,
      useWorkerFetch: true,
      disableStream: true,
      disableAutoFetch: true,
      isEvalSupported: false,
      stopAtErrors: true,
    })
    const pdf = await loadingTask.promise

    try {
      const totalPages = pdf.numPages

      setPageCount(totalPages)
      setSelectedPages([])

      pagePreviews.forEach((preview) => URL.revokeObjectURL(preview.thumbnailUrl))
      setPagePreviews([])

      const previews: PdfPagePreview[] = []
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        setProgress({
          stage: 'preparing',
          percent: Math.max(8, Math.min(96, Math.round((pageNumber / totalPages) * 78) + 8)),
          message: locale === 'es' ? 'Cargando paginas...' : 'Loading pages...',
          detail: locale === 'es' ? `Generando vista ${pageNumber} de ${totalPages}.` : `Rendering preview ${pageNumber} of ${totalPages}.`,
        })

        previews.push(await renderPageThumbnail(pdf, pageNumber))
      }

      setPagePreviews(previews)
      setProgress({
        stage: 'idle',
        percent: 0,
        message: locale === 'es' ? 'PDF cargado.' : 'PDF loaded.',
        detail: locale === 'es' ? `Este archivo tiene ${totalPages} paginas.` : `This file has ${totalPages} pages.`,
      })

      return { totalPages, previews }
    } finally {
      pdf.cleanup()
      await loadingTask.destroy()
    }
  }, [locale, pagePreviews, resetResult])

  const togglePageSelection = useCallback((pageNumber: number) => {
    setSelectedPages((current) =>
      current.includes(pageNumber)
        ? current.filter((page) => page !== pageNumber)
        : [...current, pageNumber].sort((a, b) => a - b),
    )
  }, [])

  const selectAllPages = useCallback(() => {
    if (!pageCount) {
      return
    }

    setSelectedPages(Array.from({ length: pageCount }, (_, index) => index + 1))
  }, [pageCount])

  const clearSelection = useCallback(() => {
    setSelectedPages([])
  }, [])

  const deletePages = useCallback(async (file: File, pagesToDelete: number[]) => {
    setError(null)
    resetResult()
    setIsProcessing(true)

    try {
      if (pagesToDelete.length === 0) {
        throw new Error('EMPTY_SELECTION')
      }

      const buffer = await file.arrayBuffer()
      const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
      const total = sourcePdf.getPageCount()
      setPageCount(total)

      const validPages = Array.from(new Set(pagesToDelete)).filter((page) => page > 0 && page <= total).sort((a, b) => a - b)
      if (validPages.length === 0) {
        throw new Error('EMPTY_SELECTION')
      }

      if (validPages.length === total) {
        throw new Error('DELETE_ALL')
      }

      const remainingPageIndices = sourcePdf.getPageIndices().filter((pageIndex) => !validPages.includes(pageIndex + 1))
      if (remainingPageIndices.length === 0) {
        throw new Error('DELETE_ALL')
      }

      setProgress({
        stage: 'preparing',
        percent: 18,
        message: locale === 'es' ? 'Preparando PDF...' : 'Preparing PDF...',
        detail: locale === 'es' ? 'Calculando las paginas que se conservaran.' : 'Calculating which pages will be kept.',
      })

      const outputPdf = await PDFDocument.create()
      const copiedPages = await outputPdf.copyPages(sourcePdf, remainingPageIndices)
      copiedPages.forEach((page) => outputPdf.addPage(page))

      setProgress({
        stage: 'merging',
        percent: 80,
        message: locale === 'es' ? 'Eliminando paginas...' : 'Deleting pages...',
        detail: locale === 'es' ? `Quitando ${validPages.length} paginas del PDF.` : `Removing ${validPages.length} pages from the PDF.`,
      })

      const bytes = await outputPdf.save()
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const blob = new Blob([copy.buffer], { type: 'application/pdf' })
      const deleteResult: PdfDeleteResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: createOutputName(file.name),
        size: blob.size,
        removedPages: validPages,
        totalPages: total,
      }

      setResult(deleteResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: locale === 'es' ? 'Paginas eliminadas correctamente.' : 'Pages deleted successfully.',
        detail: locale === 'es' ? 'Tu nuevo PDF ya esta listo para descargar.' : 'Your new PDF is ready to download.',
      })

      return deleteResult
    } catch (deleteError) {
      let message = locale === 'es' ? 'No se pudieron eliminar las paginas seleccionadas.' : 'The selected pages could not be removed.'

      if (deleteError instanceof Error) {
        if (deleteError.message === 'EMPTY_SELECTION') {
          message = t('deletePdfPagesMissingPages')
        } else if (deleteError.message === 'DELETE_ALL') {
          message = t('deletePdfPagesAllSelected')
        }
      }

      setError(message)
      setProgress({
        stage: 'error',
        percent: 0,
        message: t('deletePdfPagesError'),
        detail: locale === 'es' ? 'Revisa la seleccion e intenta de nuevo.' : 'Review the selection and try again.',
      })
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [locale, resetResult, t])

  const selectedCount = useMemo(() => selectedPages.length, [selectedPages])

  return {
    progress,
    isProcessing,
    result,
    error,
    loadPdf,
    deletePages,
    pageCount,
    pagePreviews,
    selectedPages,
    selectedCount,
    togglePageSelection,
    selectAllPages,
    clearSelection,
  }
}
