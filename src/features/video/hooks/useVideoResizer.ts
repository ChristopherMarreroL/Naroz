import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress } from '../../../types/video'

const FFMPEG_CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

interface ResizeResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  outputFormat: 'mp4' | 'mkv'
  width: number
  height: number
}

function createOutputName(fileName: string, outputFormat: 'mp4' | 'mkv') {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'video'
  return `${baseName}-resized.${outputFormat}`
}

function getVideoMimeType(outputFormat: 'mp4' | 'mkv') {
  return outputFormat === 'mkv' ? 'video/x-matroska' : 'video/mp4'
}

export function useVideoResizer() {
  const { locale } = useLocale()
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para cambiar la resolucion.' : 'Ready to resize your video.',
    detail: locale === 'es' ? 'Selecciona un video y define el nuevo tamano.' : 'Select a video and define the new size.',
  })
  const [isLoadingEngine, setIsLoadingEngine] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<ResizeResult | null>(null)
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
            message: locale === 'es' ? 'Listo para cambiar la resolucion.' : 'Ready to resize your video.',
            detail: locale === 'es' ? 'Selecciona un video y define el nuevo tamano.' : 'Select a video and define the new size.',
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

    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
      })

      ffmpegRef.current = ffmpeg
      setProgress({
        stage: 'idle',
        percent: 0,
        message: locale === 'es' ? 'Motor listo.' : 'Engine ready.',
        detail: locale === 'es' ? 'Ya puedes redimensionar el video.' : 'You can resize the video now.',
      })

      return ffmpeg
    } finally {
      setIsLoadingEngine(false)
    }
  }, [locale])

  const resetResult = useCallback(() => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return null
    })
  }, [])

  const resizeVideo = useCallback(async (file: File, width: number, height: number) => {
    setError(null)
    resetResult()
    setIsProcessing(true)
    let ffmpeg: FFmpeg | null = null
    let inputName: string | null = null
    let outputName: string | null = null

    try {
      ffmpeg = await ensureLoaded()
      const outputFormat = file.name.toLowerCase().endsWith('.mkv') ? 'mkv' : 'mp4'
      const inputExtension = outputFormat
      inputName = `input.${inputExtension}`
      outputName = `output.${outputFormat}`

      setProgress({
        stage: 'preparing',
        percent: 12,
        message: locale === 'es' ? 'Preparando archivo...' : 'Preparing file...',
        detail: locale === 'es' ? 'Leyendo el video antes del cambio de resolucion.' : 'Reading the video before resizing.',
      })

      await ffmpeg.writeFile(inputName, await fetchFile(file))

      setProgress({
        stage: 'converting',
        percent: 18,
        message: locale === 'es' ? 'Redimensionando video...' : 'Resizing video...',
        detail: locale === 'es' ? `Creando una salida ${width}x${height}.` : `Creating a ${width}x${height} output.`,
      })

      await ffmpeg.exec([
        '-i',
        inputName,
        '-vf',
        `scale=${width}:${height}`,
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
      const blob = new Blob([copy.buffer], { type: getVideoMimeType(outputFormat) })
      const resizedResult: ResizeResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: createOutputName(file.name, outputFormat),
        size: blob.size,
        outputFormat,
        width,
        height,
      }

      setResult(resizedResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: locale === 'es' ? 'Resolucion cambiada correctamente.' : 'Resolution changed successfully.',
        detail: locale === 'es' ? `Tu video ${width}x${height} ya esta listo para descargar.` : `Your ${width}x${height} video is ready to download.`,
      })

      return resizedResult
    } catch (resizeError) {
      setError(locale === 'es' ? 'No se pudo cambiar la resolucion con el motor actual del navegador.' : 'The video resolution could not be changed with the current browser engine.')
      setProgress({
        stage: 'error',
        percent: 0,
        message: locale === 'es' ? 'El cambio de resolucion fallo.' : 'Resize failed.',
        detail: locale === 'es' ? 'Prueba otra resolucion o un video distinto.' : 'Try another resolution or a different video.',
      })
      console.error(resizeError)
      return null
    } finally {
      if (ffmpeg) {
        const ffmpegInstance = ffmpeg
        await Promise.allSettled(
          [inputName, outputName]
            .filter((fileName): fileName is string => Boolean(fileName))
            .map((fileName) => ffmpegInstance.deleteFile(fileName)),
        )
      }
      setIsProcessing(false)
    }
  }, [ensureLoaded, locale, resetResult])

  return {
    progress,
    isLoadingEngine,
    isProcessing,
    result,
    error,
    ensureLoaded,
    resizeVideo,
  }
}
