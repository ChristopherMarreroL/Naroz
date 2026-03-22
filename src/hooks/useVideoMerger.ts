import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { getVideoExtension } from '../lib/media'
import type { MergeProgress, MergeResult, MergeStrategy, VideoItem } from '../types/video'

const FFMPEG_CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

const INITIAL_PROGRESS: MergeProgress = {
  stage: 'idle',
  percent: 0,
  message: 'Listo para unir tus videos.',
}

function createOutputFileName(extension: 'mp4' | 'mkv'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `video-unido-${timestamp}.${extension}`
}

function toEven(value: number): number {
  const safeValue = Math.max(2, Math.round(value))
  return safeValue % 2 === 0 ? safeValue : safeValue + 1
}

function getTargetResolution(videos: VideoItem[]): { width: number; height: number } {
  const widths = videos.map((video) => video.width ?? 0).filter((value) => value > 0)
  const heights = videos.map((video) => video.height ?? 0).filter((value) => value > 0)

  return {
    width: toEven(widths.length > 0 ? Math.max(...widths) : 1280),
    height: toEven(heights.length > 0 ? Math.max(...heights) : 720),
  }
}

function loadBlobDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url

    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
    }

    video.onloadedmetadata = () => {
      resolve(Number.isFinite(video.duration) ? video.duration : null)
      cleanup()
    }

    video.onerror = () => {
      resolve(null)
      cleanup()
    }
  })
}

function getExpectedDuration(videos: VideoItem[]): number {
  return videos.reduce((sum, video) => sum + (video.duration ?? 0), 0)
}

function validateFastMode(videos: VideoItem[]) {
  const nonMp4 = videos.some((video) => video.extension !== 'mp4')
  if (nonMp4) {
    throw new Error('FAST_MODE_REQUIRES_MP4')
  }

  const resolutions = new Set(
    videos
      .filter((video) => video.width && video.height)
      .map((video) => `${video.width}x${video.height}`),
  )

  if (resolutions.size > 1) {
    throw new Error('FAST_MODE_REQUIRES_SAME_RESOLUTION')
  }
}

async function verifyOutputDuration(url: string, videos: VideoItem[]) {
  const expectedDuration = getExpectedDuration(videos)
  const outputDuration = await loadBlobDuration(url)

  if (
    videos.length > 1 &&
    expectedDuration > 0 &&
    outputDuration !== null &&
    outputDuration < expectedDuration * 0.85
  ) {
    URL.revokeObjectURL(url)
    throw new Error('INCOMPLETE_OUTPUT')
  }
}

function getOutputSettings(): {
  extension: 'mp4' | 'mkv'
  mimeType: string
  fileName: string
} {
  const extension = 'mp4'

  return {
    extension,
    mimeType: 'video/mp4',
    fileName: createOutputFileName(extension),
  }
}

export function useVideoMerger() {
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [progress, setProgress] = useState<MergeProgress>(INITIAL_PROGRESS)
  const [isLoadingEngine, setIsLoadingEngine] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<MergeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastLogRef = useRef('')

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url)
      }
    }
  }, [result])

  const ensureLoaded = useCallback(async () => {
    if (ffmpegRef.current) {
      return ffmpegRef.current
    }

    setIsLoadingEngine(true)
    setProgress({ stage: 'loading', percent: 10, message: 'Cargando motor de video en el navegador...' })

    const ffmpeg = new FFmpeg()
    ffmpeg.on('log', ({ message }) => {
      lastLogRef.current = message
    })
    ffmpeg.on('progress', ({ progress: ratio }) => {
      setProgress({
        stage: 'processing',
        percent: Math.min(99, Math.max(12, Math.round(ratio * 100))),
        message: 'Uniendo videos. Este paso puede tardar unos minutos.',
      })
    })

    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
    })

    ffmpegRef.current = ffmpeg
    setIsLoadingEngine(false)
    setProgress({ stage: 'idle', percent: 0, message: 'Motor listo. Puedes iniciar la union.' })
    return ffmpeg
  }, [])

  const resetResult = useCallback(() => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return null
    })
  }, [])

  const mergeVideos = useCallback(async (videos: VideoItem[], strategy: MergeStrategy) => {
    if (videos.length === 0) {
      setError('Selecciona al menos un video MP4 o MKV antes de unir.')
      setProgress({ stage: 'error', percent: 0, message: 'No hay videos para procesar.' })
      return null
    }

    setError(null)
    resetResult()
    setIsProcessing(true)

    try {
      const ffmpeg = await ensureLoaded()
      const inputFileNames: string[] = []
      const normalizedFileNames: string[] = []
      const transportStreamFileNames: string[] = []
      const outputSettings = getOutputSettings()
      const outputFileName = `output.${outputSettings.extension}`

      setProgress({ stage: 'processing', percent: 12, message: 'Preparando archivos...' })

      for (let index = 0; index < videos.length; index += 1) {
        const extension = getVideoExtension(videos[index].file)
        const inputName = `input-${index}.${extension}`
        inputFileNames.push(inputName)
        await ffmpeg.writeFile(inputName, await fetchFile(videos[index].file))
      }

      if (strategy === 'fast') {
        validateFastMode(videos)
        for (let index = 0; index < inputFileNames.length; index += 1) {
          const transportName = `fast-${index}.ts`
          const normalizedAudioName = `fast-normalized-${index}.mp4`
          normalizedFileNames.push(normalizedAudioName)
          transportStreamFileNames.push(transportName)

          setProgress({
            stage: 'processing',
            percent: Math.min(60, 20 + Math.round((index / Math.max(inputFileNames.length, 1)) * 35)),
            message: `Preparando video ${index + 1} de ${inputFileNames.length} para union automatica rapida...`,
          })

          await ffmpeg.exec([
            '-i',
            inputFileNames[index],
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-ar',
            '48000',
            '-ac',
            '2',
            '-movflags',
            '+faststart',
            normalizedAudioName,
          ])

          await ffmpeg.exec([
            '-i',
            normalizedAudioName,
            '-c',
            'copy',
            '-bsf:v',
            'h264_mp4toannexb',
            '-f',
            'mpegts',
            transportName,
          ])
        }

        setProgress({
          stage: 'processing',
          percent: 72,
          message: 'Uniendo videos con la ruta rapida automatica...',
        })

        await ffmpeg.exec([
          '-fflags',
          '+genpts',
          '-f',
          'mpegts',
          '-i',
          `concat:${transportStreamFileNames.join('|')}`,
          '-c',
          'copy',
          '-bsf:a',
          'aac_adtstoasc',
          '-movflags',
          '+faststart',
          outputFileName,
        ])
      } else {
        const targetResolution = getTargetResolution(videos)

        for (let index = 0; index < videos.length; index += 1) {
          const normalizedName = `normalized-${index}.mp4`
          normalizedFileNames.push(normalizedName)

          setProgress({
            stage: 'processing',
            percent: Math.min(70, 15 + Math.round((index / Math.max(videos.length, 1)) * 50)),
            message: `Convirtiendo video ${index + 1} de ${videos.length} a MP4 compatible...`,
          })

          await ffmpeg.exec([
            '-i',
            inputFileNames[index],
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            '-vf',
            `scale=${targetResolution.width}:${targetResolution.height}:force_original_aspect_ratio=decrease,pad=${targetResolution.width}:${targetResolution.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p`,
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
            '-ar',
            '48000',
            '-ac',
            '2',
            '-movflags',
            '+faststart',
            normalizedName,
          ])
        }

        setProgress({ stage: 'processing', percent: 75, message: 'Uniendo los videos normalizados...' })

        const concatList = normalizedFileNames.map((fileName) => `file '${fileName}'`).join('\n')
        await ffmpeg.writeFile('inputs.txt', new TextEncoder().encode(concatList))

        await ffmpeg.exec([
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          'inputs.txt',
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          outputFileName,
        ])
      }

      const outputData = await ffmpeg.readFile(outputFileName)
      if (typeof outputData === 'string') {
        throw new Error('FFmpeg devolvio una salida invalida.')
      }

      const buffer = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData)
      const blobBuffer = new Uint8Array(buffer.byteLength)
      blobBuffer.set(buffer)
      const blob = new Blob([blobBuffer.buffer], { type: outputSettings.mimeType })
      const url = URL.createObjectURL(blob)
      await verifyOutputDuration(url, videos)

      const mergedResult: MergeResult = {
        blob,
        url,
        fileName: outputSettings.fileName,
        size: blob.size,
        mimeType: outputSettings.mimeType,
        strategy,
      }

      setResult(mergedResult)
      setProgress({ stage: 'finished', percent: 100, message: 'Video unido correctamente.' })

      await Promise.allSettled([
        ffmpeg.deleteFile('inputs.txt'),
        ffmpeg.deleteFile(outputFileName),
        ...inputFileNames.map((fileName) => ffmpeg.deleteFile(fileName)),
        ...normalizedFileNames.map((fileName) => ffmpeg.deleteFile(fileName)),
        ...transportStreamFileNames.map((fileName) => ffmpeg.deleteFile(fileName)),
      ])

      return mergedResult
    } catch (mergeError) {
      const hasMixedFormats = new Set(videos.map((video) => video.extension)).size > 1
      const fallbackMessage =
        mergeError instanceof Error && mergeError.message === 'INCOMPLETE_OUTPUT'
          ? 'No se genero un archivo valido porque la union quedo incompleta. Revisa formatos, duraciones y codecs antes de intentarlo otra vez.'
          : mergeError instanceof Error && mergeError.message === 'FAST_MODE_REQUIRES_MP4'
            ? 'El modo rapido solo funciona con videos MP4. Usa modo compatible para mezclar MKV o convertir archivos.'
            : mergeError instanceof Error && mergeError.message === 'FAST_MODE_REQUIRES_SAME_RESOLUTION'
              ? 'El modo rapido requiere que todos los MP4 tengan la misma resolucion. Usa modo compatible para normalizarlos a MP4.'
          : hasMixedFormats
            ? 'No se pudieron convertir y unir correctamente los videos porque los formatos o codecs son demasiado distintos. No se genero ninguna descarga.'
            : lastLogRef.current.includes('Impossible to open') || lastLogRef.current.includes('Invalid data')
              ? 'No se pudieron unir los videos. La app intento normalizarlos a MP4, pero siguen siendo incompatibles entre si.'
              : 'Fallo el procesamiento en el navegador. No se genero ninguna descarga para evitar un resultado incompleto.'

      setError(fallbackMessage)
      setProgress({ stage: 'error', percent: 0, message: fallbackMessage })
      console.error(mergeError)
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [ensureLoaded, resetResult])

  return {
    progress,
    isLoadingEngine,
    isProcessing,
    result,
    error,
    ensureLoaded,
    mergeVideos,
    resetResult,
  }
}
