import QRCode from 'qrcode'

export interface QrLogoOptions {
  dataUrl: string
  sizePercent: number
  backgroundEnabled: boolean
}

export interface QrRenderOptions {
  foregroundColor: string
  backgroundColor: string
  size: number
  logo?: QrLogoOptions
}

const QR_MARGIN = 2
const MIN_LOGO_PERCENT = 10
const MAX_LOGO_PERCENT = 25

function getLogoPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 20
  }

  return Math.min(MAX_LOGO_PERCENT, Math.max(MIN_LOGO_PERCENT, Math.round(value)))
}

function getRenderOptions(options: QrRenderOptions) {
  return {
    errorCorrectionLevel: options.logo ? ('H' as const) : ('M' as const),
    margin: QR_MARGIN,
    width: options.size,
    color: {
      dark: options.foregroundColor,
      light: options.backgroundColor,
    },
  }
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    image.src = source
  })
}

function drawRoundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function drawLogo(context: CanvasRenderingContext2D, image: HTMLImageElement, options: QrRenderOptions) {
  if (!options.logo) {
    return
  }

  const logoSize = options.size * (getLogoPercent(options.logo.sizePercent) / 100)
  const logoX = (options.size - logoSize) / 2
  const logoY = (options.size - logoSize) / 2
  const padding = logoSize * 0.16

  if (options.logo.backgroundEnabled) {
    const backgroundX = logoX - padding
    const backgroundY = logoY - padding
    const backgroundSize = logoSize + padding * 2

    context.save()
    context.fillStyle = options.backgroundColor || '#ffffff'
    drawRoundRect(context, backgroundX, backgroundY, backgroundSize, backgroundSize, backgroundSize * 0.18)
    context.fill()
    context.restore()
  }

  const naturalWidth = image.naturalWidth || image.width || 1
  const naturalHeight = image.naturalHeight || image.height || 1
  const imageRatio = naturalWidth / naturalHeight
  const targetRatio = 1
  const drawWidth = imageRatio > targetRatio ? logoSize : logoSize * imageRatio
  const drawHeight = imageRatio > targetRatio ? logoSize / imageRatio : logoSize
  const drawX = logoX + (logoSize - drawWidth) / 2
  const drawY = logoY + (logoSize - drawHeight) / 2

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
}

function injectLogoIntoSvg(svg: string, options: QrRenderOptions) {
  if (!options.logo) {
    return svg
  }

  const logoSize = options.size * (getLogoPercent(options.logo.sizePercent) / 100)
  const logoX = (options.size - logoSize) / 2
  const logoY = (options.size - logoSize) / 2
  const padding = logoSize * 0.16
  const backgroundSize = logoSize + padding * 2
  const backgroundX = logoX - padding
  const backgroundY = logoY - padding
  const backgroundRadius = backgroundSize * 0.18
  const background = options.logo.backgroundEnabled
    ? `<rect x="${backgroundX}" y="${backgroundY}" width="${backgroundSize}" height="${backgroundSize}" rx="${backgroundRadius}" fill="${options.backgroundColor}"/>`
    : ''
  const image = `<image href="${options.logo.dataUrl}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`

  return svg.replace('</svg>', `${background}${image}</svg>`)
}

export function normalizeQrSize(value: number) {
  if (!Number.isFinite(value)) {
    return 512
  }

  return Math.min(1024, Math.max(128, Math.round(value)))
}

export function normalizeLogoSizePercent(value: number) {
  return getLogoPercent(value)
}

export async function generateQrPngDataUrl(content: string, options: QrRenderOptions) {
  const baseQr = await QRCode.toDataURL(content, getRenderOptions(options))

  if (!options.logo) {
    return baseQr
  }

  const canvas = document.createElement('canvas')
  canvas.width = options.size
  canvas.height = options.size

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('CANVAS_NOT_SUPPORTED')
  }

  const [qrImage, logoImage] = await Promise.all([loadImage(baseQr), loadImage(options.logo.dataUrl)])
  context.drawImage(qrImage, 0, 0, options.size, options.size)
  drawLogo(context, logoImage, options)

  return canvas.toDataURL('image/png')
}

export async function generateQrSvg(content: string, options: QrRenderOptions) {
  const svg = await QRCode.toString(content, {
    ...getRenderOptions(options),
    type: 'svg',
  })

  return injectLogoIntoSvg(svg, options)
}

export function downloadSvg(svg: string, fileName: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

