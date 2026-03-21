import type { VideoItem } from '../types/video'

const SUPPORTED_TYPES = new Set(['video/mp4', 'video/x-matroska'])
const SUPPORTED_EXTENSIONS = ['.mp4', '.mkv']

export function getVideoExtension(file: File): 'mp4' | 'mkv' {
  const lowerName = file.name.toLowerCase()
  return lowerName.endsWith('.mkv') || file.type === 'video/x-matroska' ? 'mkv' : 'mp4'
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
    type: file.type || 'video/mp4',
    extension,
    warnings,
  }
}

export function getCompatibilityWarnings(videos: VideoItem[]): string[] {
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
    warnings.add('Los videos tienen resoluciones distintas. La union directa puede fallar.')
  }

  const extensions = new Set(videos.map((video) => video.extension))
  if (extensions.size > 1) {
    warnings.add('Estas mezclando MP4 y MKV. Solo funcionara bien si los streams internos son compatibles.')
  }

  const filesWithoutMetadata = videos.filter((video) => !video.duration || !video.width || !video.height)
  if (filesWithoutMetadata.length > 0) {
    warnings.add('No se pudo leer toda la metadata. Verifica que los videos sean compatibles entre si.')
  }

  warnings.add('Para mejores resultados usa MP4 o MKV con los mismos codecs de video y audio, y la misma resolucion.')

  return Array.from(warnings)
}
