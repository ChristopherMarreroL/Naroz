import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress, VideoOutputFormat } from '../../../types/video'
import { getVideoExtension, getVideoMimeType, shouldUseFastStart } from '../lib/media'

const FFMPEG_CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

interface ConvertResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  outputFormat: VideoOutputFormat
}

function createOutputName(fileName: string, outputFormat: VideoOutputFormat): string {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'video'
  return `${baseName}-converted.${outputFormat}`
}

export function useVideoConverter() {
  const { locale } = useLocale()
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para convertir tu video.' : 'Ready to convert your video.',
    detail: locale === 'es' ? 'Elige un archivo y el formato final.' : 'Choose a file and the target format.',
  })
  const [isLoadingEngine, setIsLoadingEngine] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<ConvertResult | null>(null)
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
            message: locale === 'es' ? 'Listo para convertir tu video.' : 'Ready to convert your video.',
            detail: locale === 'es' ? 'Elige un archivo y el formato final.' : 'Choose a file and the target format.',
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
        detail: locale === 'es' ? 'Ya puedes empezar a convertir.' : 'You can start converting now.',
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

  const convertVideo = useCallback(async (file: File, outputFormat: VideoOutputFormat) => {
    setError(null)
    resetResult()
    setIsProcessing(true)
    let ffmpeg: FFmpeg | null = null
    let inputName: string | null = null
    let outputName: string | null = null

    try {
      ffmpeg = await ensureLoaded()
      const inputExtension = getVideoExtension(file)
      inputName = `input.${inputExtension}`
      outputName = `output.${outputFormat}`

      setProgress({
        stage: 'preparing',
        percent: 12,
        message: locale === 'es' ? 'Preparando archivo...' : 'Preparing file...',
        detail: locale === 'es' ? 'Leyendo el video seleccionado antes de la conversion.' : 'Reading the selected video before conversion.',
      })

      await ffmpeg.writeFile(inputName, await fetchFile(file))

      const copyOnly = inputExtension === outputFormat
      setProgress({
        stage: copyOnly ? 'merging' : 'converting',
        percent: 18,
        message: copyOnly ? (locale === 'es' ? 'Reempaquetando video...' : 'Repackaging video...') : (locale === 'es' ? 'Convirtiendo formato de video...' : 'Converting video format...'),
        detail: copyOnly
          ? locale === 'es'
            ? `El archivo ya coincide con ${outputFormat.toUpperCase()}, asi que Naroz mantendra un flujo rapido.`
            : `The file already matches ${outputFormat.toUpperCase()}, so Naroz will keep it fast.`
          : locale === 'es'
            ? `Creando un archivo ${outputFormat.toUpperCase()} real.`
            : `Creating a real ${outputFormat.toUpperCase()} output file.`,
      })

      await ffmpeg.exec(
        copyOnly
          ? ['-i', inputName, '-c', 'copy', ...(shouldUseFastStart(outputFormat) ? ['-movflags', '+faststart'] : []), outputName]
          : [
              '-i',
              inputName,
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
              ...(shouldUseFastStart(outputFormat) ? ['-movflags', '+faststart'] : []),
              outputName,
            ],
      )

      const outputData = await ffmpeg.readFile(outputName)
      if (typeof outputData === 'string') {
        throw new Error('INVALID_OUTPUT')
      }

      const bytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData)
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const blob = new Blob([copy.buffer], { type: getVideoMimeType(outputFormat) })
      const convertedResult: ConvertResult = {
        blob,
        url: URL.createObjectURL(blob),
        fileName: createOutputName(file.name, outputFormat),
        size: blob.size,
        outputFormat,
      }

      setResult(convertedResult)
      setProgress({
        stage: 'finished',
        percent: 100,
        message: locale === 'es' ? 'Video convertido correctamente.' : 'Video converted successfully.',
        detail: locale === 'es' ? `Tu archivo ${outputFormat.toUpperCase()} ya esta listo para descargar.` : `Your ${outputFormat.toUpperCase()} file is ready to download.`,
      })

      return convertedResult
    } catch (conversionError) {
      setError(locale === 'es' ? 'No se pudo convertir el video con el motor actual del navegador.' : 'The selected video could not be converted with the current browser engine.')
      setProgress({
        stage: 'error',
        percent: 0,
        message: locale === 'es' ? 'La conversion fallo.' : 'Conversion failed.',
        detail: locale === 'es' ? 'Prueba otro archivo o un formato final distinto.' : 'Try another source file or a different output format.',
      })
      console.error(conversionError)
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
    convertVideo,
  }
}
