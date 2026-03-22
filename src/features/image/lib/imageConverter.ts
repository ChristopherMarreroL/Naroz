import type { ConvertedImageResult, ImageOutputFormat } from '../types'

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function getMimeType(format: ImageOutputFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp'
}

export function isSupportedImageType(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type)
}

export function getImageExtensionLabel(file: File): string {
  if (file.type === 'image/png') {
    return 'PNG'
  }

  if (file.type === 'image/webp') {
    return 'WEBP'
  }

  return 'JPG / JPEG'
}

function createOutputName(fileName: string, format: ImageOutputFormat): string {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'imagen'
  const extension = format === 'jpeg' ? 'jpg' : format
  return `${baseName}-convertida.${extension}`
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen para convertirla.'))
    }
    image.src = url
  })
}

export async function convertImageFile(file: File, format: ImageOutputFormat): Promise<ConvertedImageResult> {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Tu navegador no permite convertir imagenes con canvas en este momento.')
  }

  if (format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  context.drawImage(image, 0, 0)

  const mimeType = getMimeType(format)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, format === 'png' ? undefined : 0.92)
  })

  if (!blob) {
    throw new Error('No se pudo generar la imagen convertida.')
  }

  return {
    blob,
    url: URL.createObjectURL(blob),
    fileName: createOutputName(file.name, format),
    size: blob.size,
    format,
  }
}
