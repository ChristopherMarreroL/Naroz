import type { ImageUploadState } from '../types'
import { assertSafeImageDimensions } from './imageLimits'

export function loadImagePreview(file: File): Promise<ImageUploadState> {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        assertSafeImageDimensions(image.naturalWidth, image.naturalHeight)
        resolve({ file, previewUrl, width: image.naturalWidth, height: image.naturalHeight })
      } catch (error) {
        URL.revokeObjectURL(previewUrl)
        reject(error)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl)
      reject(new Error('IMAGE_LOAD_FAILED'))
    }
    image.src = previewUrl
  })
}

export function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      try {
        assertSafeImageDimensions(image.naturalWidth, image.naturalHeight)
        resolve(image)
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen.'))
    }
    image.src = url
  })
}

export function getImageMimeType(file: File) {
  return file.type || 'image/png'
}

export function getImageExtension(file: File) {
  if (file.type === 'image/jpeg') {
    return 'jpg'
  }

  if (file.type === 'image/webp') {
    return 'webp'
  }

  return 'png'
}

export function createEditedImageName(fileName: string, suffix: string, extension: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'imagen'
  return `${baseName}-${suffix}.${extension}`
}

export async function canvasToImageBlob(canvas: HTMLCanvasElement, mimeType: string) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, mimeType === 'image/png' ? undefined : 0.92)
  })

  if (!blob) {
    throw new Error('No se pudo generar la imagen final.')
  }

  return blob
}
