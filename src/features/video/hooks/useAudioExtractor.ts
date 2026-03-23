import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress } from '../../../types/video'

const FFMPEG_CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

export type AudioOutputFormat = 'mp3' | 'wav'

interface AudioExtractResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  outputFormat: AudioOutputFormat
}

function createOutputName(fileName: string, outputFormat: AudioOutputFormat): string {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'audio'
  return `${baseName}-audio.${outputFormat}`
}

function getAudioMimeType(outputFormat: AudioOutputFormat) {
  return outputFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav'
}

export function useAudioExtractor() {
  const { locale } = useLocale()
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para extraer audio.' : 'Ready to extract audio.',
    detail: locale === 'es' ? 'Elige un video y el formato de salida.' : 'Choose a video and the output format.',
  })
  const [isLoadingEngine, setIsLoadingEngine] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<AudioExtractResult | null>(null)
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
            message: locale === 'es' ? 'Listo para extraer audio.' : 'Ready to extract audio.',
            detail: locale === 'es' ? 'Elige un video y el formato de salida.' : 'Choose a video and the output format.',
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
      message: locale === 'es' ? 'Cargando motor de audio...' : 'Loading audio engine...',
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
      detail: locale === 'es' ? 'Ya puedes extraer audio.' : 'You can extract audio now.',
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

  const extractAudio = useCallback(async (file: File, outputFormat: AudioOutputFormat) => {
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
        detail: locale === 'es' ? 'Leyendo el video antes de extraer el audio.' : 'Reading the selected video before extracting audio.',
      })

      await ffmpeg.writeFile(inputName, await fetchFile(file))

      setProgress({
        stage: 'converting',
        percent: 18,
        message: locale === 'es' ? 'Extrayendo audio...' : 'Extracting audio...',
        detail:
          outputFormat === 'mp3'
            ? locale === 'es'
              ? 'Creando un archivo MP3 listo para descargar.'
              : 'Creating an MP3 file ready to download.'
            : locale === 'es'
              ? 'Creando un archivo WAV listo para descargar.'
              : 'Creating a WAV file ready to download.',
      })

      await ffmpeg.exec(
        outputFormat === 'mp3'
          ? ['-i', inputName, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', outputName]
          : ['-i', inputName, '-vn', '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2', outputName],
      )

      const outputData = await ffmpeg.readFile(outputName)
      if (typeof outputData === 'string') {
        throw new Error('INVALID_OUTPUT')
      }

      const bytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData)
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const blob = new Blob([copy.buffer], { type: getAudioMimeType(outputFormat) })
      const extractedResult: AudioExtractResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: createOutputName(file.name, outputFormat),
        size: blob.size,
        outputFormat,
      }

      setResult(extractedResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: locale === 'es' ? 'Audio extraido correctamente.' : 'Audio extracted successfully.',
        detail:
          locale === 'es'
            ? `Tu archivo ${outputFormat.toUpperCase()} ya esta listo para descargar.`
            : `Your ${outputFormat.toUpperCase()} file is ready to download.`,
      })

      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)])
      return extractedResult
    } catch (extractError) {
      setError(locale === 'es' ? 'No se pudo extraer el audio con el motor actual del navegador.' : 'The selected audio could not be extracted with the current browser engine.')
      setProgress({
        stage: 'error',
        percent: 0,
        message: locale === 'es' ? 'La extraccion fallo.' : 'Extraction failed.',
        detail: locale === 'es' ? 'Prueba otro archivo o un formato de salida distinto.' : 'Try another source file or a different output format.',
      })
      console.error(extractError)
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
    extractAudio,
  }
}
