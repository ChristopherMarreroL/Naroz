import type { MergeStrategy, VideoItem, VideoOutputFormat } from '../types/video'

const SUPPORTED_TYPES = new Set(['video/mp4', 'video/x-matroska', 'video/quicktime'])
const SUPPORTED_EXTENSIONS = ['.mp4', '.mkv', '.mov']

export function getVideoExtension(file: File): VideoOutputFormat {
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.mov') || file.type === 'video/quicktime') {
    return 'mov'
  }

  return lowerName.endsWith('.mkv') || file.type === 'video/x-matroska' ? 'mkv' : 'mp4'
}

export function getVideoMimeType(format: VideoOutputFormat) {
  if (format === 'mkv') {
    return 'video/x-matroska'
  }

  return format === 'mov' ? 'video/quicktime' : 'video/mp4'
}

export function shouldUseFastStart(format: VideoOutputFormat) {
  return format === 'mp4' || format === 'mov'
}

export function isSupportedVideo(file: File): boolean {
  if (SUPPORTED_TYPES.has(file.type)) {
    return true
  }

  const lowerName = file.name.toLowerCase()
  return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

function createVideoId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`
}

function loadVideoMetadata(objectUrl: string): Promise<{
  duration: number | null
  width: number | null
  height: number | null
}> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = objectUrl

    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
    }

    video.onloadedmetadata = () => {
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      })
      cleanup()
    }

    video.onerror = () => {
      resolve({ duration: null, width: null, height: null })
      cleanup()
    }
  })
}

export async function createVideoItem(file: File): Promise<VideoItem> {
  const previewUrl = URL.createObjectURL(file)
  const metadata = await loadVideoMetadata(previewUrl)
  const warnings: string[] = []
  const extension = getVideoExtension(file)

  if (!metadata.duration) {
    warnings.push('No se pudo leer la duracion del archivo.')
  }

  if (!metadata.width || !metadata.height) {
    warnings.push('No se pudo detectar la resolucion del video.')
  }

  return {
    id: createVideoId(file),
    file,
    name: file.name,
    size: file.size,
    duration: metadata.duration,
    width: metadata.width,
    height: metadata.height,
    previewUrl,
    type: file.type || getVideoMimeType(extension),
    extension,
    warnings,
  }
}

export function getCompatibilityWarnings(videos: VideoItem[], outputFormat: VideoOutputFormat = 'mp4'): string[] {
  if (videos.length < 2) {
    return []
  }

  const warnings = new Set<string>()
  const resolutions = new Set(
    videos
      .filter((video) => video.width && video.height)
      .map((video) => `${video.width}x${video.height}`),
  )

  if (resolutions.size > 1) {
    warnings.add('Los videos tienen resoluciones distintas. La app intentara normalizarlos antes de unirlos.')
  }

  const extensions = new Set(videos.map((video) => video.extension))
  if (extensions.size > 1) {
    warnings.add(`Estas mezclando formatos de video. La app intentara convertirlos a un ${outputFormat.toUpperCase()} comun antes de unirlos.`)
  }

  const filesWithoutMetadata = videos.filter((video) => !video.duration || !video.width || !video.height)
  if (filesWithoutMetadata.length > 0) {
    warnings.add('No se pudo leer toda la metadata. Verifica que los videos sean compatibles entre si.')
  }

  warnings.add(`La conversion puede tardar mas si los codecs, el audio o la resolucion son diferentes entre archivos. La salida final sera ${outputFormat.toUpperCase()}.`)

  return Array.from(warnings)
}

function allSameResolution(videos: VideoItem[]): boolean {
  const hasCompleteMetadata = videos.every((video) => Boolean(video.duration && video.width && video.height))
  if (!hasCompleteMetadata) {
    return false
  }

  const resolutions = new Set(
    videos
      .filter((video) => video.width && video.height)
      .map((video) => `${video.width}x${video.height}`),
  )

  return resolutions.size <= 1
}

function allSameExtension(videos: VideoItem[]): boolean {
  return new Set(videos.map((video) => video.extension)).size <= 1
}

export function canUseFastMode(videos: VideoItem[], outputFormat: VideoOutputFormat): boolean {
  if (videos.length === 0) {
    return false
  }

  return allSameExtension(videos) && allSameResolution(videos) && videos[0].extension === outputFormat
}

export function resolveMergeStrategy(videos: VideoItem[], outputFormat: VideoOutputFormat): MergeStrategy {
  return canUseFastMode(videos, outputFormat) ? 'fast' : 'compatible'
}
