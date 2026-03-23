import { useCallback, useEffect, useState } from 'react'
import DocxMerger from 'docx-merger'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress } from '../../../types/video'

interface DocxMergeResult {
  blob: Blob
  url: string
  fileName: string
  size: number
}

function arrayBufferToBinaryString(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return binary
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
            message: locale === 'es' ? 'Listo para unir documentos Word.' : 'Ready to merge Word documents.',
            detail: locale === 'es' ? 'Agrega dos o mas archivos DOCX.' : 'Add two or more DOCX files.',
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

  const mergeDocxFiles = useCallback(async (files: File[]) => {
    setError(null)
    resetResult()
    setIsProcessing(true)

    try {
      setProgress({
        stage: 'preparing',
        percent: 10,
        message: t('stagePreparing'),
        detail: locale === 'es' ? 'Leyendo los DOCX seleccionados.' : 'Reading the selected DOCX files.',
      })

      const binaries: string[] = []
      for (const [index, file] of files.entries()) {
        const buffer = await file.arrayBuffer()
        binaries.push(arrayBufferToBinaryString(buffer))

        setProgress({
          stage: 'merging',
          percent: Math.min(85, Math.round(((index + 1) / files.length) * 60) + 15),
          message: locale === 'es' ? 'Uniendo documentos Word...' : 'Merging Word documents...',
          detail: locale === 'es' ? `Procesando ${file.name}.` : `Processing ${file.name}.`,
        })
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        try {
          const merger = new DocxMerger({ pageBreak: true }, binaries)
          merger.save('blob', (data: Blob) => resolve(data))
        } catch (mergeError) {
          reject(mergeError)
        }
      })

      const mergeResult: DocxMergeResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: 'naroz-documentos-unidos.docx',
        size: blob.size,
      }

      setResult(mergeResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: t('docxMergeCompleted'),
        detail: t('docxReadyToDownload'),
      })

      return mergeResult
    } catch (mergeError) {
      setError(locale === 'es' ? 'No se pudieron unir los DOCX seleccionados.' : 'The selected DOCX files could not be merged.')
      setProgress({
        stage: 'error',
        percent: 0,
        message: t('docxMergeError'),
        detail: locale === 'es' ? 'Algunos DOCX complejos pueden necesitar ajustes adicionales.' : 'Some complex DOCX files may need extra handling.',
      })
      console.error(mergeError)
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [locale, resetResult, t])

  return { progress, isProcessing, result, error, mergeDocxFiles }
}
