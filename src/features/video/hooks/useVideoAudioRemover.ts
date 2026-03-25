import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress } from '../../../types/video'

const FFMPEG_CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

interface RemoveAudioResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  outputFormat: 'mp4' | 'mkv'
}

function createOutputName(fileName: string, outputFormat: 'mp4' | 'mkv'): string {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'video'
  return `${baseName}-silent.${outputFormat}`
}

function getVideoMimeType(outputFormat: 'mp4' | 'mkv') {
  return outputFormat === 'mkv' ? 'video/x-matroska' : 'video/mp4'
}

export function useVideoAudioRemover() {
  const { locale } = useLocale()
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para eliminar audio.' : 'Ready to remove audio.',
    detail: locale === 'es' ? 'Elige un video MP4 o MKV para crear una copia silenciosa.' : 'Choose an MP4 or MKV video to create a silent copy.',
  })
  const [isLoadingEngine, setIsLoadingEngine] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<RemoveAudioResult | null>(null)
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
            message: locale === 'es' ? 'Listo para eliminar audio.' : 'Ready to remove audio.',
            detail: locale === 'es' ? 'Elige un video MP4 o MKV para crear una copia silenciosa.' : 'Choose an MP4 or MKV video to create a silent copy.',
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
      detail: locale === 'es' ? 'Ya puedes crear una copia sin audio.' : 'You can now create a copy without audio.',
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

  const removeAudio = useCallback(async (file: File) => {
    setError(null)
    resetResult()
    setIsProcessing(true)

    try {
      const ffmpeg = await ensureLoaded()
      const outputFormat = file.name.toLowerCase().endsWith('.mkv') ? 'mkv' : 'mp4'
      const inputName = `input.${outputFormat}`
      const outputName = `output.${outputFormat}`

      setProgress({
        stage: 'preparing',
        percent: 12,
        message: locale === 'es' ? 'Preparando archivo...' : 'Preparing file...',
        detail: locale === 'es' ? 'Leyendo el video antes de eliminar la pista de audio.' : 'Reading the selected video before removing the audio track.',
      })

      await ffmpeg.writeFile(inputName, await fetchFile(file))

      setProgress({
        stage: 'converting',
        percent: 18,
        message: locale === 'es' ? 'Eliminando audio...' : 'Removing audio...',
        detail: locale === 'es' ? `Creando una copia silenciosa en ${outputFormat.toUpperCase()}.` : `Creating a silent ${outputFormat.toUpperCase()} copy.`,
      })

      await ffmpeg.exec([
        '-i',
        inputName,
        '-map',
        '0:v:0',
        '-c:v',
        'copy',
        '-an',
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
      const removeAudioResult: RemoveAudioResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: createOutputName(file.name, outputFormat),
        size: blob.size,
        outputFormat,
      }

      setResult(removeAudioResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: locale === 'es' ? 'Audio eliminado correctamente.' : 'Audio removed successfully.',
        detail: locale === 'es' ? `Tu video ${outputFormat.toUpperCase()} sin audio ya esta listo para descargar.` : `Your silent ${outputFormat.toUpperCase()} video is ready to download.`,
      })

      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)])
      return removeAudioResult
    } catch (removeAudioError) {
      setError(locale === 'es' ? 'No se pudo eliminar el audio con el motor actual del navegador.' : 'The selected audio could not be removed with the current browser engine.')
      setProgress({
        stage: 'error',
        percent: 0,
        message: locale === 'es' ? 'La eliminacion de audio fallo.' : 'Audio removal failed.',
        detail: locale === 'es' ? 'Prueba otro archivo MP4 o MKV.' : 'Try a different MP4 or MKV file.',
      })
      console.error(removeAudioError)
      return null
    } finally {
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
    removeAudio,
  }
}
