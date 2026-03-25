import { useCallback, useEffect, useState } from 'react'
import { PDFDocument } from 'pdf-lib'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress } from '../../../types/video'

interface PdfDeleteResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  removedPages: number[]
  totalPages: number
}

function createOutputName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'documento'
  return `${baseName}-sin-paginas.pdf`
}

function parsePagesToDelete(input: string, totalPages: number): number[] {
  const normalized = input.trim()
  if (!normalized) {
    throw new Error('EMPTY_SELECTION')
  }

  const selected = new Set<number>()
  const parts = normalized.split(/[\s,]+/).filter(Boolean)

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      const start = Number(rangeMatch[1])
      const end = Number(rangeMatch[2])
      if (start <= 0 || end <= 0 || start > end) {
        throw new Error('INVALID_SELECTION')
      }

      for (let page = start; page <= end; page += 1) {
        selected.add(page)
      }
      continue
    }

    const page = Number(part)
    if (!Number.isInteger(page) || page <= 0) {
      throw new Error('INVALID_SELECTION')
    }

    selected.add(page)
  }

  const pages = Array.from(selected).sort((a, b) => a - b)
  if (pages.some((page) => page > totalPages)) {
    throw new Error('OUT_OF_RANGE')
  }

  if (pages.length === totalPages) {
    throw new Error('DELETE_ALL')
  }

  return pages
}

export function usePdfPageRemover() {
  const { locale, t } = useLocale()
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para eliminar paginas.' : 'Ready to delete pages.',
    detail: locale === 'es' ? 'Agrega un PDF y elige las paginas a borrar.' : 'Add a PDF and choose the pages to delete.',
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<PdfDeleteResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)

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
            message: locale === 'es' ? 'Listo para eliminar paginas.' : 'Ready to delete pages.',
            detail: locale === 'es' ? 'Agrega un PDF y elige las paginas a borrar.' : 'Add a PDF and choose the pages to delete.',
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

  const inspectPdf = useCallback(async (file: File) => {
    setError(null)
    resetResult()
    setProgress({
      stage: 'preparing',
      percent: 12,
      message: locale === 'es' ? 'Leyendo PDF...' : 'Reading PDF...',
      detail: locale === 'es' ? 'Contando cuantas paginas tiene el archivo.' : 'Counting how many pages the file contains.',
    })

    const buffer = await file.arrayBuffer()
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
    const total = pdf.getPageCount()
    setPageCount(total)
    setProgress({
      stage: 'idle',
      percent: 0,
      message: locale === 'es' ? 'PDF cargado.' : 'PDF loaded.',
      detail: locale === 'es' ? `Este archivo tiene ${total} paginas.` : `This file has ${total} pages.`,
    })

    return total
  }, [locale, resetResult])

  const deletePages = useCallback(async (file: File, pagesToDeleteInput: string) => {
    setError(null)
    resetResult()
    setIsProcessing(true)

    try {
      const buffer = await file.arrayBuffer()
      const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
      const total = sourcePdf.getPageCount()
      setPageCount(total)

      const pagesToDelete = parsePagesToDelete(pagesToDeleteInput, total)
      setProgress({
        stage: 'preparing',
        percent: 18,
        message: locale === 'es' ? 'Preparando PDF...' : 'Preparing PDF...',
        detail: locale === 'es' ? 'Calculando las paginas que se conservaran.' : 'Calculating which pages will be kept.',
      })

      const remainingPageIndices = sourcePdf.getPageIndices().filter((pageIndex) => !pagesToDelete.includes(pageIndex + 1))
      if (remainingPageIndices.length === 0) {
        throw new Error('DELETE_ALL')
      }

      const outputPdf = await PDFDocument.create()
      const copiedPages = await outputPdf.copyPages(sourcePdf, remainingPageIndices)
      copiedPages.forEach((page) => outputPdf.addPage(page))

      setProgress({
        stage: 'merging',
        percent: 80,
        message: locale === 'es' ? 'Eliminando paginas...' : 'Deleting pages...',
        detail: locale === 'es' ? `Quitando ${pagesToDelete.length} paginas del PDF.` : `Removing ${pagesToDelete.length} pages from the PDF.`,
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
        removedPages: pagesToDelete,
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
        } else if (deleteError.message === 'INVALID_SELECTION') {
          message = t('deletePdfPagesInvalidRange')
        } else if (deleteError.message === 'OUT_OF_RANGE') {
          message = t('deletePdfPagesOutOfRange')
        } else if (deleteError.message === 'DELETE_ALL') {
          message = t('deletePdfPagesAllSelected')
        }
      }

      setError(message)
      setProgress({
        stage: 'error',
        percent: 0,
        message: t('deletePdfPagesError'),
        detail: locale === 'es' ? 'Revisa la lista de paginas e intenta de nuevo.' : 'Check the page list and try again.',
      })
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [locale, resetResult, t])

  return { progress, isProcessing, result, error, inspectPdf, deletePages, pageCount }
}
