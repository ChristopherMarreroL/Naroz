import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { getVideoExtension } from '../lib/media'
import type { MergeProgress, MergeResult, VideoItem } from '../types/video'

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

function getOutputSettings(videos: VideoItem[]): {
  extension: 'mp4' | 'mkv'
  mimeType: string
  fileName: string
} {
  const hasMkv = videos.some((video) => video.extension === 'mkv')
  const extension = hasMkv ? 'mkv' : 'mp4'

  return {
    extension,
    mimeType: extension === 'mkv' ? 'video/x-matroska' : 'video/mp4',
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

  const mergeVideos = useCallback(async (videos: VideoItem[]) => {
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
      const outputSettings = getOutputSettings(videos)
      const outputFileName = `output.${outputSettings.extension}`

      setProgress({ stage: 'processing', percent: 12, message: 'Preparando archivos...' })

      for (let index = 0; index < videos.length; index += 1) {
        const extension = getVideoExtension(videos[index].file)
        const inputName = `input-${index}.${extension}`
        inputFileNames.push(inputName)
        await ffmpeg.writeFile(inputName, await fetchFile(videos[index].file))
      }

      const concatList = inputFileNames.map((fileName) => `file '${fileName}'`).join('\n')
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
        ...(outputSettings.extension === 'mp4' ? ['-movflags', '+faststart'] : []),
        outputFileName,
      ])

      const outputData = await ffmpeg.readFile(outputFileName)
      if (typeof outputData === 'string') {
        throw new Error('FFmpeg devolvio una salida invalida.')
      }

      const buffer = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData)
      const blobBuffer = new Uint8Array(buffer.byteLength)
      blobBuffer.set(buffer)
      const blob = new Blob([blobBuffer.buffer], { type: outputSettings.mimeType })
      const url = URL.createObjectURL(blob)
      const mergedResult: MergeResult = {
        blob,
        url,
        fileName: outputSettings.fileName,
        size: blob.size,
        mimeType: outputSettings.mimeType,
      }

      setResult(mergedResult)
      setProgress({ stage: 'finished', percent: 100, message: 'Video unido correctamente.' })

      await Promise.allSettled([
        ffmpeg.deleteFile('inputs.txt'),
        ffmpeg.deleteFile(outputFileName),
        ...inputFileNames.map((fileName) => ffmpeg.deleteFile(fileName)),
      ])

      return mergedResult
    } catch (mergeError) {
      const fallbackMessage =
        lastLogRef.current.includes('Impossible to open') || lastLogRef.current.includes('Invalid data')
          ? 'No se pudieron unir los videos. Asegurate de que sean MP4 o MKV compatibles y compartan codec, resolucion y orientacion.'
          : 'Fallo el procesamiento en el navegador. Prueba con videos MP4 o MKV mas cortos o compatibles.'

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
