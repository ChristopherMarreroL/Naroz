import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist'
import { createPdfLoadingTask } from '../../../lib/fileCompatibility/pdfRuntime'
import { PDFDocument } from 'pdf-lib'
import { openPdfForEditing, validatePdfOutput } from '../../../lib/fileCompatibility/pdf'
import { compatibilityErrorKey } from '../../../lib/fileCompatibility/core'

import { useLocale } from '../../../i18n/LocaleProvider'
import { assertSafeImageDimensions } from '../../image/lib/imageLimits'
import type { MergeProgress } from '../../../types/video'

const PDF_PREVIEW_MAX_PAGES = 200
const PDF_LOAD_CANCELLED = 'PDF_LOAD_CANCELLED'
const PDF_PREVIEW_CANCELLED = 'PDF_PREVIEW_CANCELLED'
const PDF_DELETE_CANCELLED = 'PDF_DELETE_CANCELLED'


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

function throwIfPreviewAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error(PDF_PREVIEW_CANCELLED)
  }
}

async function renderPageThumbnail(pdf: PDFDocumentProxy, pageNumber: number, signal?: AbortSignal) {
  throwIfPreviewAborted(signal)
  const page = await pdf.getPage(pageNumber)
  let renderTask: RenderTask | null = null
  let canvas: HTMLCanvasElement | null = null
  const cancelRender = () => {
    renderTask?.cancel()
  }
  signal?.addEventListener('abort', cancelRender, { once: true })

  try {
    throwIfPreviewAborted(signal)
    const viewport = page.getViewport({ scale: 0.22 })
    canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    if (!context) {
      throw new Error('No se pudo generar la vista previa de la pagina.')
    }

    const outputScale = window.devicePixelRatio || 1
    const canvasWidth = Math.max(1, Math.floor(viewport.width * outputScale))
    const canvasHeight = Math.max(1, Math.floor(viewport.height * outputScale))
    assertSafeImageDimensions(canvasWidth, canvasHeight)
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`
    canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`

    context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
    renderTask = page.render({ canvasContext: context, viewport, canvas })
    if (signal?.aborted) {
      renderTask.cancel()
    }
    try {
      await renderTask.promise
    } finally {
      renderTask = null
    }

    const thumbnailUrl = await canvasToObjectUrl(canvas)
    if (signal?.aborted) {
      URL.revokeObjectURL(thumbnailUrl)
      throw new Error(PDF_PREVIEW_CANCELLED)
    }

    return { pageNumber, thumbnailUrl }
  } finally {
    signal?.removeEventListener('abort', cancelRender)
    renderTask?.cancel()
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    page.cleanup?.()
  }
}

export async function renderPdfPagePreview(file: File, pageNumber: number, scale = 1.4, signal?: AbortSignal) {
  throwIfPreviewAborted(signal)
  const buffer = await file.arrayBuffer()
  throwIfPreviewAborted(signal)
  const loadingTask = createPdfLoadingTask(buffer)
  let destroyPromise: Promise<void> | null = null
  let pdf: PDFDocumentProxy | null = null
  let page: PDFPageProxy | null = null
  let renderTask: RenderTask | null = null
  let canvas: HTMLCanvasElement | null = null
  const destroyActiveLoadingTask = () => {
    if (!destroyPromise) {
      destroyPromise = loadingTask.destroy().catch(() => undefined).then(() => undefined)
    }

    return destroyPromise
  }
  const cancelPreview = () => {
    renderTask?.cancel()
    void destroyActiveLoadingTask()
  }
  signal?.addEventListener('abort', cancelPreview, { once: true })

  try {
    pdf = await loadingTask.promise
    throwIfPreviewAborted(signal)
    page = await pdf.getPage(pageNumber)
    throwIfPreviewAborted(signal)
    try {
      const viewport = page.getViewport({ scale })
      canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })

      if (!context) {
        throw new Error('No se pudo generar la vista previa de la pagina.')
      }

      const outputScale = window.devicePixelRatio || 1
      const canvasWidth = Math.max(1, Math.floor(viewport.width * outputScale))
      const canvasHeight = Math.max(1, Math.floor(viewport.height * outputScale))
      assertSafeImageDimensions(canvasWidth, canvasHeight)
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`
      canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`

      context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
      renderTask = page.render({ canvasContext: context, viewport, canvas })
      if (signal?.aborted) {
        renderTask.cancel()
      }
      try {
        await renderTask.promise
      } finally {
        renderTask = null
      }

      const previewUrl = await canvasToObjectUrl(canvas)
      if (signal?.aborted) {
        URL.revokeObjectURL(previewUrl)
        throw new Error(PDF_PREVIEW_CANCELLED)
      }

      return previewUrl
    } finally {
      if (canvas) { canvas.width = 0; canvas.height = 0 }
      page.cleanup?.()
    }
  } finally {
    signal?.removeEventListener('abort', cancelPreview)
    renderTask?.cancel()
    await destroyActiveLoadingTask()
  }
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
  const loadGenerationRef = useRef(0)
  const deleteGenerationRef = useRef(0)
  const mountedRef = useRef(true)
  const pagePreviewsRef = useRef<PdfPagePreview[]>([])
  const resultRef = useRef<PdfDeleteResult | null>(null)
  const activeLoadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const activeLoadControllerRef = useRef<AbortController | null>(null)
  const activeDeleteControllerRef = useRef<AbortController | null>(null)
  const loadingTaskDestroyPromisesRef = useRef<WeakMap<PDFDocumentLoadingTask, Promise<void>>>(new WeakMap())

  useEffect(() => {
    pagePreviewsRef.current = pagePreviews
  }, [pagePreviews])

  useEffect(() => {
    resultRef.current = result
  }, [result])

  const destroyLoadingTask = useCallback((loadingTask: PDFDocumentLoadingTask) => {
    const existingPromise = loadingTaskDestroyPromisesRef.current.get(loadingTask)
    if (existingPromise) {
      return existingPromise
    }

    const destroyPromise = loadingTask.destroy().catch(() => undefined).then(() => undefined)
    loadingTaskDestroyPromisesRef.current.set(loadingTask, destroyPromise)
    return destroyPromise
  }, [])

  const cancelActivePdfLoad = useCallback(() => {
    activeLoadControllerRef.current?.abort()
    activeLoadControllerRef.current = null

    const loadingTask = activeLoadingTaskRef.current
    activeLoadingTaskRef.current = null
    if (loadingTask) {
      void destroyLoadingTask(loadingTask)
    }
  }, [destroyLoadingTask])

  const cancelActiveDelete = useCallback(() => {
    deleteGenerationRef.current += 1
    activeDeleteControllerRef.current?.abort()
    activeDeleteControllerRef.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      loadGenerationRef.current += 1
      cancelActivePdfLoad()
      cancelActiveDelete()
      if (resultRef.current?.url) {
        URL.revokeObjectURL(resultRef.current.url)
      }
      pagePreviewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.thumbnailUrl))
    }
  }, [cancelActiveDelete, cancelActivePdfLoad])

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
    const loadGeneration = loadGenerationRef.current + 1
    loadGenerationRef.current = loadGeneration
    cancelActivePdfLoad()
    const controller = new AbortController()
    activeLoadControllerRef.current = controller
    const ensureCurrentLoad = () => {
      if (loadGeneration !== loadGenerationRef.current || controller.signal.aborted) {
        throw new Error(PDF_LOAD_CANCELLED)
      }
    }

    setError(null)
    resetResult()
    const previousPreviews = pagePreviewsRef.current
    pagePreviewsRef.current = []
    previousPreviews.forEach((preview) => URL.revokeObjectURL(preview.thumbnailUrl))
    setPagePreviews([])
    setPageCount(null)
    setSelectedPages([])
    setProgress({
      stage: 'preparing',
      percent: 8,
      message: locale === 'es' ? 'Leyendo PDF...' : 'Reading PDF...',
      detail: locale === 'es' ? 'Generando vistas previas de cada pagina.' : 'Generating page previews.',
    })

    const previews: PdfPagePreview[] = []
    let loadingTask: PDFDocumentLoadingTask | null = null
    let pdf: PDFDocumentProxy | null = null
    try {
      const buffer = await file.arrayBuffer()
      ensureCurrentLoad()
      loadingTask = createPdfLoadingTask(buffer)
      activeLoadingTaskRef.current = loadingTask
      pdf = await loadingTask.promise
      ensureCurrentLoad()

      const totalPages = pdf.numPages
      if (totalPages > PDF_PREVIEW_MAX_PAGES) {
        throw new Error('PDF_TOO_MANY_PAGES')
      }

      ensureCurrentLoad()
      setPageCount(totalPages)

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        ensureCurrentLoad()
        setProgress({
          stage: 'preparing',
          percent: Math.max(8, Math.min(96, Math.round((pageNumber / totalPages) * 78) + 8)),
          message: locale === 'es' ? 'Cargando paginas...' : 'Loading pages...',
          detail: locale === 'es' ? `Generando vista ${pageNumber} de ${totalPages}.` : `Rendering preview ${pageNumber} of ${totalPages}.`,
        })

        const preview = await renderPageThumbnail(pdf, pageNumber, controller.signal)
        if (loadGeneration !== loadGenerationRef.current) {
          URL.revokeObjectURL(preview.thumbnailUrl)
          throw new Error(PDF_LOAD_CANCELLED)
        }
        previews.push(preview)
      }

      ensureCurrentLoad()
      pagePreviewsRef.current = previews
      setPagePreviews(previews)
      setProgress({
        stage: 'idle',
        percent: 0,
        message: locale === 'es' ? 'PDF cargado.' : 'PDF loaded.',
        detail: locale === 'es' ? `Este archivo tiene ${totalPages} paginas.` : `This file has ${totalPages} pages.`,
      })

      return { totalPages, previews }
    } catch (error) {
      previews.forEach((preview) => URL.revokeObjectURL(preview.thumbnailUrl))
      if (controller.signal.aborted || loadGeneration !== loadGenerationRef.current) {
        throw new Error(PDF_LOAD_CANCELLED)
      }
      throw error
    } finally {
      if (loadingTask) {
        await destroyLoadingTask(loadingTask)
        if (activeLoadingTaskRef.current === loadingTask) {
          activeLoadingTaskRef.current = null
        }
      }
      if (activeLoadControllerRef.current === controller) {
        activeLoadControllerRef.current = null
      }
    }
  }, [cancelActivePdfLoad, destroyLoadingTask, locale, resetResult])

  const cancelPdfLoad = useCallback(() => {
    loadGenerationRef.current += 1
    cancelActivePdfLoad()
    const currentPreviews = pagePreviewsRef.current
    pagePreviewsRef.current = []
    currentPreviews.forEach((preview) => URL.revokeObjectURL(preview.thumbnailUrl))
    setPagePreviews([])
    setPageCount(null)
    setSelectedPages([])
  }, [cancelActivePdfLoad])

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
    cancelActiveDelete()
    const deleteGeneration = deleteGenerationRef.current + 1
    deleteGenerationRef.current = deleteGeneration
    const controller = new AbortController()
    activeDeleteControllerRef.current = controller
    const isCurrentDelete = () => mountedRef.current
      && deleteGenerationRef.current === deleteGeneration
      && activeDeleteControllerRef.current === controller
      && !controller.signal.aborted
    const ensureCurrentDelete = () => {
      if (!isCurrentDelete()) {
        throw new Error(PDF_DELETE_CANCELLED)
      }
    }

    setError(null)
    resetResult()
    setIsProcessing(true)

    try {
      ensureCurrentDelete()
      if (pagesToDelete.length === 0) {
        throw new Error('EMPTY_SELECTION')
      }

      const buffer = await file.arrayBuffer()
      ensureCurrentDelete()
      const source = await openPdfForEditing(buffer, controller.signal, PDF_PREVIEW_MAX_PAGES)
      try {
        ensureCurrentDelete()
        const total = source.pageCount
        setPageCount(total)

        const validPages = Array.from(new Set(pagesToDelete)).filter((page) => page > 0 && page <= total).sort((a, b) => a - b)
        if (validPages.length === 0) {
          throw new Error('EMPTY_SELECTION')
        }

        if (validPages.length === total) {
          throw new Error('DELETE_ALL')
        }

        const remainingPageIndices = Array.from({ length: total }, (_, page) => page).filter((pageIndex) => !validPages.includes(pageIndex + 1))
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
        await source.appendTo(outputPdf, remainingPageIndices, { pixels: 0, bytes: 0 })
        ensureCurrentDelete()

        setProgress({
          stage: 'merging',
          percent: 80,
          message: locale === 'es' ? 'Eliminando paginas...' : 'Deleting pages...',
          detail: locale === 'es' ? `Quitando ${validPages.length} paginas del PDF.` : `Removing ${validPages.length} pages from the PDF.`,
        })

        const bytes = await outputPdf.save()
        if (source.preflight.canNormalize) await validatePdfOutput(bytes, remainingPageIndices.length, [1], controller.signal)
        ensureCurrentDelete()
        const copy = new Uint8Array(bytes.byteLength)
        copy.set(bytes)
        const blob = new Blob([copy.buffer], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        if (!isCurrentDelete()) {
          URL.revokeObjectURL(url)
          throw new Error(PDF_DELETE_CANCELLED)
        }
        const deleteResult: PdfDeleteResult = {
          blob,
          url,
          fileName: createOutputName(file.name),
          size: blob.size,
          removedPages: validPages,
          totalPages: total,
        }

        ensureCurrentDelete()
        resultRef.current = deleteResult
        setResult(deleteResult)
        setProgress({
          stage: 'finished',
          percent: 100,
          message: locale === 'es' ? 'Paginas eliminadas correctamente.' : 'Pages deleted successfully.',
          detail: source.preflight.canNormalize ? t('compatibilityPdfNormalized') : t('pdfReadyToDownload'),
        })

        return deleteResult
      } finally {
        await source.dispose()
      }
    } catch (deleteError) {
      if (!isCurrentDelete() || (deleteError instanceof Error && deleteError.message === PDF_DELETE_CANCELLED)) {
        return null
      }
      let message = locale === 'es' ? 'No se pudieron eliminar las paginas seleccionadas.' : 'The selected pages could not be removed.'

      if (deleteError instanceof Error) {
        if (deleteError.message === 'EMPTY_SELECTION') {
          message = t('deletePdfPagesMissingPages')
        } else if (deleteError.message === 'DELETE_ALL') {
          message = t('deletePdfPagesAllSelected')
        }
      }

      const errorKey = compatibilityErrorKey(deleteError)
      setError(errorKey ? t(errorKey) : message)
      setProgress({
        stage: 'error',
        percent: 0,
        message: t('deletePdfPagesError'),
        detail: locale === 'es' ? 'Revisa la seleccion e intenta de nuevo.' : 'Review the selection and try again.',
      })
      return null
    } finally {
      if (activeDeleteControllerRef.current === controller) {
        activeDeleteControllerRef.current = null
        if (mountedRef.current) {
          setIsProcessing(false)
        }
      }
    }
  }, [cancelActiveDelete, locale, resetResult, t])

  const selectedCount = useMemo(() => selectedPages.length, [selectedPages])

  return {
    progress,
    isProcessing,
    result,
    error,
    loadPdf,
    cancelPdfLoad,
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
