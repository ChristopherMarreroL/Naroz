import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { useLocale } from '../i18n/LocaleProvider'
import type { MergeProgress, MergeResult, MergeStrategy, VideoItem, VideoOutputFormat } from '../types/video'

const FFMPEG_CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

function createOutputFileName(extension: VideoOutputFormat): string {
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

function getOutputSettings(outputFormat: VideoOutputFormat) {
  return {
    extension: outputFormat,
    mimeType: outputFormat === 'mkv' ? 'video/x-matroska' : 'video/mp4',
    fileName: createOutputFileName(outputFormat),
  }
}

function validateFastMode(videos: VideoItem[], outputFormat: VideoOutputFormat) {
  const sameFormat = videos.every((video) => video.extension === outputFormat)
  if (!sameFormat) {
    throw new Error('FAST_MODE_REQUIRES_SAME_FORMAT')
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

type ProgressStage = MergeProgress['stage']

interface ProgressPhase {
  stage: ProgressStage
  start: number
  end: number
  message: string
  detail?: string
}

export function useVideoMerger() {
  const { locale } = useLocale()
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: locale === 'es' ? 'Listo para unir tus videos.' : 'Ready to merge your videos.',
    detail: locale === 'es' ? 'Elige tus archivos y el formato de salida.' : 'Choose your files and the output format.',
  })
  const [isLoadingEngine, setIsLoadingEngine] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<MergeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastLogRef = useRef('')
  const progressPhaseRef = useRef<ProgressPhase>({
      stage: 'idle',
      start: 0,
      end: 0,
      message: locale === 'es' ? 'Listo para unir tus videos.' : 'Ready to merge your videos.',
      detail: locale === 'es' ? 'Elige tus archivos y el formato de salida.' : 'Choose your files and the output format.',
    })

  useEffect(() => {
    setProgress((current) =>
      current.stage === 'idle'
        ? {
            stage: 'idle',
            percent: 0,
            message: locale === 'es' ? 'Listo para unir tus videos.' : 'Ready to merge your videos.',
            detail: locale === 'es' ? 'Elige tus archivos y el formato de salida.' : 'Choose your files and the output format.',
          }
        : current,
    )
  }, [locale])

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url)
      }
    }
  }, [result])

  const setProgressPhase = useCallback((phase: ProgressPhase) => {
    progressPhaseRef.current = phase
    setProgress({
      stage: phase.stage,
      percent: phase.start,
      message: phase.message,
      detail: phase.detail,
    })
  }, [])

  const ensureLoaded = useCallback(async () => {
    if (ffmpegRef.current) {
      return ffmpegRef.current
    }

    setIsLoadingEngine(true)
      setProgress({
        stage: 'loading',
        percent: 10,
        message: locale === 'es' ? 'Cargando motor de video en el navegador...' : 'Loading video engine in the browser...',
        detail: locale === 'es' ? 'La primera carga puede tardar un poco.' : 'The first load can take a moment.',
      })

    const ffmpeg = new FFmpeg()
    ffmpeg.on('log', ({ message }) => {
      lastLogRef.current = message
    })
    ffmpeg.on('progress', ({ progress: ratio }) => {
      const currentPhase = progressPhaseRef.current
      const mappedPercent = Math.round(currentPhase.start + (currentPhase.end - currentPhase.start) * ratio)

      setProgress({
        stage: currentPhase.stage,
        percent: Math.min(99, Math.max(currentPhase.start, mappedPercent)),
        message: currentPhase.message,
        detail: currentPhase.detail,
      })
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
      message: locale === 'es' ? 'Motor listo. Puedes iniciar la union.' : 'Engine ready. You can start merging.',
      detail: locale === 'es' ? 'La barra avanzara segun preparacion, conversion y union.' : 'The progress bar will reflect preparation, conversion, and merge stages.',
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

  const mergeVideos = useCallback(
    async (videos: VideoItem[], strategy: MergeStrategy, outputFormat: VideoOutputFormat) => {
      if (videos.length === 0) {
        setError(locale === 'es' ? 'Selecciona al menos un video MP4 o MKV antes de unir.' : 'Select at least one MP4 or MKV video before merging.')
        setProgress({
          stage: 'error',
          percent: 0,
          message: locale === 'es' ? 'No hay videos para procesar.' : 'There are no videos to process.',
          detail: locale === 'es' ? 'Agrega al menos un archivo.' : 'Add at least one file.',
        })
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
        const outputSettings = getOutputSettings(outputFormat)
        const outputFileName = `output.${outputSettings.extension}`

        setProgressPhase({
          stage: 'preparing',
          start: 8,
          end: 12,
          message: locale === 'es' ? 'Preparando archivos...' : 'Preparing files...',
          detail: locale === 'es' ? 'Leyendo los videos locales antes del procesamiento.' : 'Reading local videos before processing.',
        })

        for (let index = 0; index < videos.length; index += 1) {
          const inputName = `input-${index}.${videos[index].extension}`
          inputFileNames.push(inputName)
          await ffmpeg.writeFile(inputName, await fetchFile(videos[index].file))
        }

        if (strategy === 'fast') {
          validateFastMode(videos, outputFormat)

          if (outputFormat === 'mp4') {
            for (let index = 0; index < inputFileNames.length; index += 1) {
              const normalizedName = `fast-normalized-${index}.mp4`
              const transportName = `fast-${index}.ts`

              normalizedFileNames.push(normalizedName)
              transportStreamFileNames.push(transportName)

              setProgressPhase({
                stage: 'preparing',
                start: 12 + Math.round((index / inputFileNames.length) * 28),
                end: 22 + Math.round(((index + 1) / inputFileNames.length) * 28),
                 message: locale === 'es' ? `Preparando video ${index + 1} de ${inputFileNames.length}...` : `Preparing video ${index + 1} of ${inputFileNames.length}...`,
                 detail: locale === 'es' ? 'Ajustando el audio para mantener compatibilidad en la salida MP4.' : 'Adjusting audio to keep MP4 output compatible.',
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
                normalizedName,
              ])

              setProgressPhase({
                stage: 'preparing',
                start: 22 + Math.round((index / inputFileNames.length) * 22),
                end: 32 + Math.round(((index + 1) / inputFileNames.length) * 22),
                 message: locale === 'es' ? `Optimizando video ${index + 1} de ${inputFileNames.length}...` : `Optimizing video ${index + 1} of ${inputFileNames.length}...`,
                 detail: locale === 'es' ? 'Convirtiendo a flujo intermedio rapido antes de unir.' : 'Converting to a fast intermediate stream before merging.',
               })

              await ffmpeg.exec([
                '-i',
                normalizedName,
                '-c',
                'copy',
                '-bsf:v',
                'h264_mp4toannexb',
                '-f',
                'mpegts',
                transportName,
              ])
            }

            setProgressPhase({
              stage: 'merging',
              start: 68,
              end: 96,
               message: locale === 'es' ? 'Uniendo videos...' : 'Merging videos...',
               detail: locale === 'es' ? 'Empaquetando la salida final en MP4.' : 'Packaging the final output as MP4.',
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
            const concatList = inputFileNames.map((fileName) => `file '${fileName}'`).join('\n')
            await ffmpeg.writeFile('inputs.txt', new TextEncoder().encode(concatList))

            setProgressPhase({
              stage: 'merging',
              start: 16,
              end: 96,
               message: locale === 'es' ? 'Uniendo videos...' : 'Merging videos...',
               detail: locale === 'es' ? 'Todos ya son MKV compatibles, asi que se uniran sin conversion pesada.' : 'All files are already compatible MKV files, so they will merge without heavy conversion.',
            })

            await ffmpeg.exec([
              '-f',
              'concat',
              '-safe',
              '0',
              '-i',
              'inputs.txt',
              '-c',
              'copy',
              outputFileName,
            ])
          }
        } else {
          const targetResolution = getTargetResolution(videos)

          for (let index = 0; index < videos.length; index += 1) {
            const normalizedName = `normalized-${index}.${outputFormat}`
            normalizedFileNames.push(normalizedName)

            setProgressPhase({
              stage: 'converting',
              start: 14 + Math.round((index / videos.length) * 54),
              end: 22 + Math.round(((index + 1) / videos.length) * 54),
               message: locale === 'es' ? `Cambiando formato ${index + 1} de ${videos.length}...` : `Converting format ${index + 1} of ${videos.length}...`,
               detail: locale === 'es' ? `Convirtiendo a ${outputFormat.toUpperCase()} compatible antes de la union final.` : `Converting into a compatible ${outputFormat.toUpperCase()} file before the final merge.`,
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
              ...(outputFormat === 'mp4' ? ['-movflags', '+faststart'] : []),
              normalizedName,
            ])
          }

          const concatList = normalizedFileNames.map((fileName) => `file '${fileName}'`).join('\n')
          await ffmpeg.writeFile('inputs.txt', new TextEncoder().encode(concatList))

          setProgressPhase({
            stage: 'merging',
            start: 74,
            end: 96,
             message: locale === 'es' ? 'Uniendo videos...' : 'Merging videos...',
             detail: locale === 'es' ? `Todos los videos convertidos se estan uniendo en ${outputFormat.toUpperCase()}.` : `All converted videos are being merged into ${outputFormat.toUpperCase()}.`,
           })

          await ffmpeg.exec([
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            'inputs.txt',
            '-c',
            'copy',
            ...(outputFormat === 'mp4' ? ['-movflags', '+faststart'] : []),
            outputFileName,
          ])
        }

        const outputData = await ffmpeg.readFile(outputFileName)
        if (typeof outputData === 'string') {
          throw new Error('INVALID_OUTPUT')
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
          outputFormat,
        }

        setResult(mergedResult)
        setProgress({
          stage: 'finished',
          percent: 100,
          message: locale === 'es' ? 'Video unido correctamente.' : 'Video merged successfully.',
          detail: locale === 'es' ? `La descarga final ya esta lista en ${outputFormat.toUpperCase()}.` : `Your final ${outputFormat.toUpperCase()} download is ready.`,
        })

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
            : mergeError instanceof Error && mergeError.message === 'FAST_MODE_REQUIRES_SAME_FORMAT'
              ? 'La ruta rapida solo funciona cuando todos los videos ya estan en el formato de salida elegido.'
              : mergeError instanceof Error && mergeError.message === 'FAST_MODE_REQUIRES_SAME_RESOLUTION'
                ? 'La ruta rapida requiere que todos los videos tengan la misma resolucion.'
                : hasMixedFormats
                  ? `No se pudieron convertir y unir correctamente los videos a ${outputFormat.toUpperCase()} porque los formatos o codecs son demasiado distintos.`
                  : lastLogRef.current.includes('Impossible to open') || lastLogRef.current.includes('Invalid data')
                    ? `No se pudieron unir los videos. La app intento normalizarlos a ${outputFormat.toUpperCase()}, pero siguen siendo incompatibles entre si.`
                    : locale === 'es'
                      ? 'Fallo el procesamiento en el navegador. No se genero ninguna descarga para evitar un resultado incompleto.'
                      : 'Browser processing failed. No download was generated to avoid an incomplete result.'

        setError(fallbackMessage)
        setProgress({
          stage: 'error',
          percent: 0,
          message: fallbackMessage,
          detail: locale === 'es' ? 'Prueba otro formato final o usa archivos mas compatibles.' : 'Try another output format or use more compatible files.',
        })
        console.error(mergeError)
        return null
      } finally {
        setIsProcessing(false)
      }
    },
    [ensureLoaded, locale, resetResult, setProgressPhase],
  )

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
