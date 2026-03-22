import { GIFEncoder, applyPalette, quantize } from 'gifenc'

import type { ConvertedImageResult, ImageOutputFormat } from '../types'

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function getMimeType(format: ImageOutputFormat): string {
  if (format === 'jpeg') {
    return 'image/jpeg'
  }

  if (format === 'png' || format === 'ico') {
    return 'image/png'
  }

  if (format === 'webp') {
    return 'image/webp'
  }

  if (format === 'avif') {
    return 'image/avif'
  }

  return 'image/gif'
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

function getOutputExtension(format: ImageOutputFormat): string {
  if (format === 'jpeg') {
    return 'jpg'
  }

  return format
}

function createOutputName(fileName: string, format: ImageOutputFormat): string {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'imagen'
  return `${baseName}-convertida.${getOutputExtension(format)}`
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

function drawImageOnCanvas(image: HTMLImageElement, format: ImageOutputFormat): HTMLCanvasElement {
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
  return canvas
}

async function canvasToBlob(canvas: HTMLCanvasElement, format: ImageOutputFormat): Promise<Blob> {
  const mimeType = getMimeType(format)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, format === 'png' || format === 'ico' ? undefined : 0.92)
  })

  if (!blob) {
    if (format === 'avif') {
      throw new Error('Tu navegador no soporta conversion a AVIF en este momento.')
    }

    throw new Error(`No se pudo generar la imagen convertida en ${format.toUpperCase()}.`)
  }

  return blob
}

async function createGifBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('No se pudo preparar la imagen para GIF.')
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const gifInput = new Uint8Array(imageData.data.length)
  gifInput.set(imageData.data)
  const palette = quantize(gifInput, 256)
  const index = applyPalette(gifInput, palette)
  const gif = GIFEncoder()
  gif.writeFrame(index, canvas.width, canvas.height, { palette })
  gif.finish()

  const gifBytes = gif.bytesView()
  const gifBuffer = new Uint8Array(gifBytes.byteLength)
  gifBuffer.set(gifBytes)

  return new Blob([gifBuffer.buffer], { type: 'image/gif' })
}

async function createIcoBlob(image: HTMLImageElement): Promise<Blob> {
  const iconSize = Math.min(256, Math.max(image.naturalWidth, image.naturalHeight, 64))
  const canvas = document.createElement('canvas')
  canvas.width = iconSize
  canvas.height = iconSize

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('No se pudo preparar la imagen para ICO.')
  }

  const scale = Math.min(iconSize / image.naturalWidth, iconSize / image.naturalHeight)
  const drawWidth = Math.round(image.naturalWidth * scale)
  const drawHeight = Math.round(image.naturalHeight * scale)
  const offsetX = Math.round((iconSize - drawWidth) / 2)
  const offsetY = Math.round((iconSize - drawHeight) / 2)

  context.clearRect(0, 0, iconSize, iconSize)
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)

  const pngBlob = await canvasToBlob(canvas, 'png')
  const pngBuffer = new Uint8Array(await pngBlob.arrayBuffer())
  const icoHeader = new ArrayBuffer(22)
  const view = new DataView(icoHeader)
  const widthByte = iconSize >= 256 ? 0 : iconSize
  const heightByte = iconSize >= 256 ? 0 : iconSize

  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, 1, true)
  view.setUint8(6, widthByte)
  view.setUint8(7, heightByte)
  view.setUint8(8, 0)
  view.setUint8(9, 0)
  view.setUint16(10, 1, true)
  view.setUint16(12, 32, true)
  view.setUint32(14, pngBuffer.byteLength, true)
  view.setUint32(18, 22, true)

  return new Blob([icoHeader, pngBuffer], { type: 'image/x-icon' })
}

export async function convertImageFile(file: File, format: ImageOutputFormat): Promise<ConvertedImageResult> {
  const image = await loadImage(file)
  const canvas = drawImageOnCanvas(image, format)

  let blob: Blob
  if (format === 'gif') {
    blob = await createGifBlob(canvas)
  } else if (format === 'ico') {
    blob = await createIcoBlob(image)
  } else {
    blob = await canvasToBlob(canvas, format)
  }

  return {
    blob,
    url: URL.createObjectURL(blob),
    fileName: createOutputName(file.name, format),
    size: blob.size,
    format,
  }
}
