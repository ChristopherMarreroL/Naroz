import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress, VideoOutputFormat } from '../../../types/video'

const FFMPEG_CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

interface TrimResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  outputFormat: VideoOutputFormat
}

function createOutputName(fileName: string, outputFormat: VideoOutputFormat) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'video'
  return `${baseName}-trimmed.${outputFormat}`
}

function formatSeconds(value: number) {
  return `${value}`
}

export function useVideoTrimmer() {
  const { locale } = useLocale()
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para recortar tu video.' : 'Ready to trim your video.',
    detail: locale === 'es' ? 'Elige un archivo y define el rango de tiempo.' : 'Choose a file and define the time range.',
  })
  const [isLoadingEngine, setIsLoadingEngine] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<TrimResult | null>(null)
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
            message: locale === 'es' ? 'Listo para recortar tu video.' : 'Ready to trim your video.',
            detail: locale === 'es' ? 'Elige un archivo y define el rango de tiempo.' : 'Choose a file and define the time range.',
          }
        : current,
    )
  }, [locale])

  const ensureLoaded = useCallback(async () => {
    if (ffmpegRef.current) {
      return ffmpegRef.current
    }

    setIsLoadingEngine(true)
    setProgress({
      stage: 'loading',
      percent: 10,
      message: locale === 'es' ? 'Cargando motor de video...' : 'Loading video engine...',
      detail: locale === 'es' ? 'La primera carga tarda un poco mas.' : 'This only takes longer the first time.',
    })

    const ffmpeg = new FFmpeg()
    ffmpeg.on('progress', ({ progress: ratio }) => {
      setProgress((current) => ({
        ...current,
        percent: Math.min(96, Math.max(current.percent, Math.round(18 + ratio * 74))),
      }))
    })

    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
    })

    ffmpegRef.current = ffmpeg
    setIsLoadingEngine(false)
    setProgress({
      stage: 'idle',
      percent: 0,
      message: locale === 'es' ? 'Motor listo.' : 'Engine ready.',
      detail: locale === 'es' ? 'Ya puedes empezar a recortar.' : 'You can start trimming now.',
    })
    return ffmpeg
  }, [locale])

  const resetResult = useCallback(() => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return null
    })
  }, [])

  const trimVideo = useCallback(async (file: File, startTime: number, endTime: number, outputFormat: VideoOutputFormat) => {
    setError(null)
    resetResult()
    setIsProcessing(true)

    try {
      const ffmpeg = await ensureLoaded()
      const inputExtension = file.name.toLowerCase().endsWith('.mkv') ? 'mkv' : 'mp4'
      const inputName = `input.${inputExtension}`
      const outputName = `output.${outputFormat}`

      setProgress({
        stage: 'preparing',
        percent: 12,
        message: locale === 'es' ? 'Preparando archivo...' : 'Preparing file...',
        detail: locale === 'es' ? 'Leyendo el video antes del recorte.' : 'Reading the selected video before trimming.',
      })

      await ffmpeg.writeFile(inputName, await fetchFile(file))

      setProgress({
        stage: 'converting',
        percent: 18,
        message: locale === 'es' ? 'Recortando video...' : 'Trimming video...',
        detail: locale === 'es' ? `Recortando desde ${formatSeconds(startTime)} hasta ${formatSeconds(endTime)} segundos.` : `Trimming from ${formatSeconds(startTime)} to ${formatSeconds(endTime)} seconds.`,
      })

      const duration = endTime - startTime

      await ffmpeg.exec([
        '-ss',
        formatSeconds(startTime),
        '-i',
        inputName,
        '-t',
        formatSeconds(duration),
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        ...(outputFormat === 'mp4' ? ['-movflags', '+faststart'] : []),
        outputName,
      ])

      const outputData = await ffmpeg.readFile(outputName)
      if (typeof outputData === 'string') {
        throw new Error('INVALID_OUTPUT')
      }

      const bytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData)
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const blob = new Blob([copy.buffer], { type: outputFormat === 'mkv' ? 'video/x-matroska' : 'video/mp4' })
      const trimResult: TrimResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: createOutputName(file.name, outputFormat),
        size: blob.size,
        outputFormat,
      }

      setResult(trimResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: locale === 'es' ? 'Recorte completado.' : 'Trim completed.',
        detail: locale === 'es' ? 'Tu clip final ya esta listo para descargar.' : 'Your final clip is ready to download.',
      })

      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)])
      return trimResult
    } catch (trimError) {
      setError(locale === 'es' ? 'No se pudo recortar el video con el motor actual del navegador.' : 'The selected video could not be trimmed with the current browser engine.')
      setProgress({
        stage: 'error',
        percent: 0,
        message: locale === 'es' ? 'La operacion de recorte fallo.' : 'The trim operation failed.',
        detail: locale === 'es' ? 'Prueba otro archivo o un rango de tiempo distinto.' : 'Try another file or a different time range.',
      })
      console.error(trimError)
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [ensureLoaded, locale, resetResult])

  return { progress, isLoadingEngine, isProcessing, result, error, ensureLoaded, trimVideo }
}
