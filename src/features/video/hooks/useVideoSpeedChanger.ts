import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeProgress } from '../../../types/video'

const FFMPEG_CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
const SPEED_CHANGE_VIDEO_PRESET = 'ultrafast'
const SPEED_CHANGE_VIDEO_CRF = '28'
const SPEED_CHANGE_AUDIO_BITRATE = '128k'

type VideoOutputFormat = 'mp4' | 'mkv'

interface SpeedChangeResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  outputFormat: VideoOutputFormat
  playbackRate: number
}

interface AudioAwareVideoElement extends HTMLVideoElement {
  mozHasAudio?: boolean
  webkitAudioDecodedByteCount?: number
  audioTracks?: { length: number }
}

function createOutputName(fileName: string, playbackRate: number, outputFormat: VideoOutputFormat): string {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'video'
  const speedLabel = playbackRate.toString().replace('.', '_')
  return `${baseName}-speed-${speedLabel}x.${outputFormat}`
}

function getVideoMimeType(outputFormat: VideoOutputFormat) {
  return outputFormat === 'mkv' ? 'video/x-matroska' : 'video/mp4'
}

function getOutputFormat(file: File): VideoOutputFormat {
  return file.name.toLowerCase().endsWith('.mkv') ? 'mkv' : 'mp4'
}

function getSetPtsMultiplier(playbackRate: number) {
  return (1 / playbackRate).toFixed(4)
}

function mayBeMissingAudio(logs: string) {
  return /audio|stream specifier|matches no streams|stream map|atempo/i.test(logs)
}

async function detectHasAudioTrack(file: File): Promise<boolean | null> {
  const previewUrl = URL.createObjectURL(file)

  try {
    const hasAudio = await new Promise<boolean | null>((resolve) => {
      const video = document.createElement('video') as AudioAwareVideoElement
      video.preload = 'auto'
      video.muted = true
      video.src = previewUrl

      const cleanup = () => {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }

      const resolveFromElement = () => {
        const audioTracksLength = typeof video.audioTracks?.length === 'number' ? video.audioTracks.length : null
        const webkitAudioDecodedByteCount =
          typeof video.webkitAudioDecodedByteCount === 'number' ? video.webkitAudioDecodedByteCount : null

        if (typeof video.mozHasAudio === 'boolean') {
          resolve(video.mozHasAudio)
          cleanup()
          return
        }

        if (audioTracksLength !== null) {
          resolve(audioTracksLength > 0)
          cleanup()
          return
        }

        if (webkitAudioDecodedByteCount !== null && webkitAudioDecodedByteCount > 0) {
          resolve(true)
          cleanup()
          return
        }

        resolve(null)
        cleanup()
      }

      video.onloadeddata = resolveFromElement
      video.onerror = () => {
        resolve(null)
        cleanup()
      }
    })

    return hasAudio
  } finally {
    URL.revokeObjectURL(previewUrl)
  }
}

export function useVideoSpeedChanger() {
  const { locale } = useLocale()
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const logBufferRef = useRef<string[]>([])
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para cambiar la velocidad.' : 'Ready to change playback speed.',
    detail: locale === 'es' ? 'Elige un video y una velocidad de salida.' : 'Choose a video and an output speed.',
  })
  const [isLoadingEngine, setIsLoadingEngine] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<SpeedChangeResult | null>(null)
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
            message: locale === 'es' ? 'Listo para cambiar la velocidad.' : 'Ready to change playback speed.',
            detail: locale === 'es' ? 'Elige un video y una velocidad de salida.' : 'Choose a video and an output speed.',
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
    logBufferRef.current = []
    ffmpeg.on('progress', ({ progress: ratio }) => {
      setProgress((current) => ({
        ...current,
        percent: Math.min(96, Math.max(current.percent, Math.round(18 + ratio * 74))),
      }))
    })
    ffmpeg.on('log', ({ message }) => {
      logBufferRef.current = [...logBufferRef.current.slice(-39), message]
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
        detail: locale === 'es' ? 'Ya puedes cambiar la velocidad del video.' : 'You can change the video speed now.',
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

  const runSpeedCommand = useCallback(
    async (ffmpeg: FFmpeg, inputName: string, outputName: string, outputFormat: VideoOutputFormat, playbackRate: number, includeAudio: boolean) => {
      const command =
        playbackRate === 1
          ? ['-i', inputName, '-c', 'copy', ...(outputFormat === 'mp4' ? ['-movflags', '+faststart'] : []), outputName]
          : [
              '-i',
              inputName,
              '-map',
              '0:v:0',
              ...(includeAudio ? ['-map', '0:a:0'] : []),
              '-filter:v',
              `setpts=${getSetPtsMultiplier(playbackRate)}*PTS`,
              '-c:v',
              'libx264',
              '-preset',
              SPEED_CHANGE_VIDEO_PRESET,
              '-crf',
              SPEED_CHANGE_VIDEO_CRF,
              ...(includeAudio ? ['-filter:a', `atempo=${playbackRate.toFixed(2)}`, '-c:a', 'aac', '-b:a', SPEED_CHANGE_AUDIO_BITRATE] : ['-an']),
              ...(outputFormat === 'mp4' ? ['-movflags', '+faststart'] : []),
              outputName,
            ]

      logBufferRef.current = []
      await ffmpeg.exec(command)
    },
    [],
  )

  const changeSpeed = useCallback(
    async (file: File, playbackRate: number) => {
      setError(null)
      resetResult()
      setIsProcessing(true)
      let ffmpeg: FFmpeg | null = null
      let inputName: string | null = null
      let outputName: string | null = null

      try {
        ffmpeg = await ensureLoaded()
        const outputFormat = getOutputFormat(file)
        inputName = `input.${outputFormat}`
        outputName = `output.${outputFormat}`

        setProgress({
          stage: 'preparing',
          percent: 12,
          message: locale === 'es' ? 'Preparando archivo...' : 'Preparing file...',
          detail:
            locale === 'es'
              ? 'Leyendo el video antes de cambiar la velocidad.'
              : 'Reading the selected video before changing its speed.',
        })

        await ffmpeg.writeFile(inputName, await fetchFile(file))

        const hasAudio = playbackRate === 1 ? null : await detectHasAudioTrack(file)
        const includeAudio = hasAudio !== false

        setProgress({
          stage: playbackRate === 1 ? 'merging' : 'converting',
          percent: 18,
          message:
            playbackRate === 1
              ? locale === 'es'
                ? 'Reempaquetando video...'
                : 'Repackaging video...'
              : locale === 'es'
                ? 'Cambiando velocidad del video...'
                : 'Changing video speed...',
          detail:
            playbackRate === 1
              ? locale === 'es'
                ? 'La velocidad 1x conserva la reproduccion original.'
                : 'The 1x option keeps the original playback speed.'
              : locale === 'es'
                ? `Creando una nueva copia a ${playbackRate}x.`
                : `Creating a new ${playbackRate}x version.`,
        })

        try {
          await runSpeedCommand(ffmpeg, inputName, outputName, outputFormat, playbackRate, includeAudio)
        } catch (firstError) {
          const logs = logBufferRef.current.join('\n')
          if (!includeAudio || playbackRate === 1 || !mayBeMissingAudio(logs)) {
            throw firstError
          }

          await Promise.allSettled([ffmpeg.deleteFile(outputName)])
          await runSpeedCommand(ffmpeg, inputName, outputName, outputFormat, playbackRate, false)
        }

        const outputData = await ffmpeg.readFile(outputName)
        if (typeof outputData === 'string') {
          throw new Error('INVALID_OUTPUT')
        }

        const bytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData)
        const copy = new Uint8Array(bytes.byteLength)
        copy.set(bytes)
        const blob = new Blob([copy.buffer], { type: getVideoMimeType(outputFormat) })
        const speedChangeResult: SpeedChangeResult = {
          blob,
          url: URL.createObjectURL(blob),
          fileName: createOutputName(file.name, playbackRate, outputFormat),
          size: blob.size,
          outputFormat,
          playbackRate,
        }

        setResult(speedChangeResult)
        setProgress({
          stage: 'finished',
          percent: 100,
          message: locale === 'es' ? 'Velocidad cambiada correctamente.' : 'Speed changed successfully.',
          detail:
            locale === 'es'
              ? `Tu video a ${playbackRate}x ya esta listo para descargar.`
              : `Your ${playbackRate}x video is ready to download.`,
        })

        return speedChangeResult
      } catch (speedError) {
        setError(
          locale === 'es'
            ? 'No se pudo cambiar la velocidad con el motor actual del navegador.'
            : 'The video speed could not be changed with the current browser engine.',
        )
        setProgress({
          stage: 'error',
          percent: 0,
          message: locale === 'es' ? 'El cambio de velocidad fallo.' : 'Speed change failed.',
          detail:
            locale === 'es'
              ? 'Prueba otra velocidad o un video distinto.'
              : 'Try another speed or a different video file.',
        })
        console.error(speedError)
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
    },
    [ensureLoaded, locale, resetResult, runSpeedCommand],
  )

  return {
    progress,
    isLoadingEngine,
    isProcessing,
    result,
    error,
    ensureLoaded,
    changeSpeed,
  }
}
