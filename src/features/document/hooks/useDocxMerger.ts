import { useCallback, useEffect, useRef, useState } from 'react'

import { useLocale } from '../../../i18n/LocaleProvider'
import { preflightOffice } from '../../../lib/fileCompatibility/office'
import { compatibilityErrorKey } from '../../../lib/fileCompatibility/core'
import type { MergeProgress } from '../../../types/video'

interface DocxMergeResult {
  blob: Blob
  url: string
  fileName: string
  size: number
}

const DOCX_MERGE_MAX_UNCOMPRESSED_SIZE = 200 * 1024 * 1024
const DOCX_MERGE_TIMEOUT_MS = 60_000
const DOCX_MERGE_CANCELLED = 'DOCX_MERGE_CANCELLED'

interface WorkerRef {
  current: Worker | null
}

interface TimeoutRef {
  current: number | null
}

function mergeDocxBuffersInWorker(
  buffers: ArrayBuffer[],
  signal: AbortSignal,
  workerRef: WorkerRef,
  timeoutRef: TimeoutRef,
) {
  return new Promise<Blob>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('../workers/docxMerge.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      reject(error)
      return
    }

    let settled = false
    let timeoutId: number | null = null

    const finish = () => {
      signal.removeEventListener('abort', onAbort)
      if (timeoutId !== null && timeoutRef.current === timeoutId) {
        window.clearTimeout(timeoutId)
        timeoutRef.current = null
      }
      if (workerRef.current === worker) {
        workerRef.current = null
      }
      worker.terminate()
    }

    const settle = (callback: () => void) => {
      if (settled) {
        return
      }

      settled = true
      finish()
      callback()
    }

    const onAbort = () => {
      settle(() => reject(new Error(DOCX_MERGE_CANCELLED)))
    }

    workerRef.current = worker
    if (signal.aborted) {
      onAbort()
      return
    }

    signal.addEventListener('abort', onAbort, { once: true })
    timeoutId = window.setTimeout(() => {
      settle(() => reject(new Error('DOCX_MERGE_TIMEOUT')))
    }, DOCX_MERGE_TIMEOUT_MS)
    timeoutRef.current = timeoutId

    worker.onerror = () => {
      settle(() => reject(new Error('DOCX_MERGE_WORKER_FAILED')))
    }
    worker.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; error?: string }>) => {
      settle(() => {
        if (event.data.error || !event.data.buffer) {
          reject(new Error(event.data.error || 'DOCX_MERGE_WORKER_FAILED'))
          return
        }

        resolve(new Blob([event.data.buffer], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }))
      })
    }

    try {
      worker.postMessage({ buffers }, buffers)
    } catch (error) {
      settle(() => reject(error))
    }
  })
}

export function useDocxMerger() {
  const { locale, t } = useLocale()
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para unir documentos Word.' : 'Ready to merge Word documents.',
    detail: locale === 'es' ? 'Agrega dos o mas archivos DOCX.' : 'Add two or more DOCX files.',
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<DocxMergeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const mergeGenerationRef = useRef(0)
  const activeMergeControllerRef = useRef<AbortController | null>(null)
  const resultRef = useRef<DocxMergeResult | null>(null)
  const isMountedRef = useRef(true)

  const cancelActiveMerge = useCallback(() => {
    mergeGenerationRef.current += 1
    activeMergeControllerRef.current?.abort()
    activeMergeControllerRef.current = null

    const worker = workerRef.current
    workerRef.current = null
    worker?.terminate()

    const timeoutId = timeoutRef.current
    timeoutRef.current = null
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      cancelActiveMerge()
      if (resultRef.current?.url) {
        URL.revokeObjectURL(resultRef.current.url)
      }
    }
  }, [cancelActiveMerge])

  useEffect(() => {
    setProgress((current) =>
      current.stage === 'idle'
        ? {
            stage: 'idle',
            percent: 0,
            message: locale === 'es' ? 'Listo para unir documentos Word.' : 'Ready to merge Word documents.',
            detail: locale === 'es' ? 'Agrega dos o mas archivos DOCX.' : 'Add two or more DOCX files.',
          }
        : current,
    )
  }, [locale])

  const resetResult = useCallback(() => {
    if (resultRef.current?.url) {
      URL.revokeObjectURL(resultRef.current.url)
    }
    resultRef.current = null
    setResult(null)
  }, [])

  const resetMergeState = useCallback(() => {
    cancelActiveMerge()
    resetResult()
    setError(null)
    setIsProcessing(false)
    setProgress({
      stage: 'idle',
      percent: 0,
      message: locale === 'es' ? 'Listo para unir documentos Word.' : 'Ready to merge Word documents.',
      detail: locale === 'es' ? 'Agrega dos o mas archivos DOCX.' : 'Add two or more DOCX files.',
    })
  }, [cancelActiveMerge, locale, resetResult])

  const mergeDocxFiles = useCallback(async (files: File[]) => {
    cancelActiveMerge()
    const mergeGeneration = mergeGenerationRef.current
    const controller = new AbortController()
    activeMergeControllerRef.current = controller
    const isCurrentMerge = () => (
      isMountedRef.current
      && mergeGeneration === mergeGenerationRef.current
      && activeMergeControllerRef.current === controller
      && !controller.signal.aborted
    )
    const ensureCurrentMerge = () => {
      if (!isCurrentMerge()) {
        throw new Error(DOCX_MERGE_CANCELLED)
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
        detail: locale === 'es' ? 'Leyendo los DOCX seleccionados.' : 'Reading the selected DOCX files.',
      })

      const buffers: ArrayBuffer[] = []
      let totalUncompressedSize = 0
      for (const [index, file] of files.entries()) {
        ensureCurrentMerge()
        const buffer = await file.arrayBuffer()
        ensureCurrentMerge()
        const archive = await preflightOffice(buffer, 'docx', controller.signal)
        ensureCurrentMerge()
        totalUncompressedSize += archive.totalUncompressed
        if (totalUncompressedSize > DOCX_MERGE_MAX_UNCOMPRESSED_SIZE) {
          throw new Error('DOCX_BATCH_EXPANSION_TOO_LARGE')
        }
        buffers.push(buffer)

        setProgress({
          stage: 'merging',
          percent: Math.min(85, Math.round(((index + 1) / files.length) * 60) + 15),
          message: locale === 'es' ? 'Uniendo documentos Word...' : 'Merging Word documents...',
          detail: locale === 'es' ? `Procesando ${file.name}.` : `Processing ${file.name}.`,
        })
      }

      const blob = await mergeDocxBuffersInWorker(buffers, controller.signal, workerRef, timeoutRef)
      ensureCurrentMerge()
      await preflightOffice(await blob.arrayBuffer(), 'docx', controller.signal)
      ensureCurrentMerge()
      const url = URL.createObjectURL(blob)
      if (!isCurrentMerge()) {
        URL.revokeObjectURL(url)
        throw new Error(DOCX_MERGE_CANCELLED)
      }

      const mergeResult: DocxMergeResult = {
        blob,
        url,
        fileName: 'naroz-documentos-unidos.docx',
        size: blob.size,
      }

      resultRef.current = mergeResult
      setResult(mergeResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: t('docxMergeCompleted'),
        detail: t('docxReadyToDownload'),
      })

      return mergeResult
    } catch (mergeError) {
      const exceededExpansionLimit = mergeError instanceof Error && mergeError.message === 'DOCX_BATCH_EXPANSION_TOO_LARGE'
      const cancelled = mergeError instanceof Error && mergeError.message === DOCX_MERGE_CANCELLED
      if (cancelled || !isCurrentMerge()) {
        return null
      }

      const errorKey = compatibilityErrorKey(mergeError)
      setError(errorKey ? t(errorKey) : exceededExpansionLimit
        ? t('docxBatchExpansionTooLarge')
        : locale === 'es' ? 'No se pudieron unir los DOCX seleccionados.' : 'The selected DOCX files could not be merged.')
      setProgress({
        stage: 'error',
        percent: 0,
        message: t('docxMergeError'),
        detail: exceededExpansionLimit
          ? t('docxBatchExpansionTooLarge')
          : locale === 'es' ? 'Algunos DOCX complejos pueden necesitar ajustes adicionales.' : 'Some complex DOCX files may need extra handling.',
      })
      return null
    } finally {
      const shouldResetProcessing = isCurrentMerge()
      if (activeMergeControllerRef.current === controller) {
        activeMergeControllerRef.current = null
      }
      if (shouldResetProcessing) {
        setIsProcessing(false)
      }
    }
  }, [cancelActiveMerge, locale, resetResult, t])

  return { progress, isProcessing, result, error, mergeDocxFiles, resetMergeState }
}
