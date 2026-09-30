import { PDFDocument, PDFName, PDFNumber, PDFRawStream, StandardFonts, concatTransformationMatrix, pushGraphicsState, popGraphicsState, rgb } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { preflightImage } from '../../image/lib/imageLimits'
import { pdfFontFamily } from './pdfFonts'

export interface PdfOverlay {
  id: string
  page: number
  src: string
  x: number
  y: number
  width: number
  height: number
  text?: string
  textColor?: string
  textFont?: string
  textBold?: boolean
  textItalic?: boolean
  textAlign?: 'left' | 'center' | 'right'
  rotation?: number
  opacity?: number
}

export class PdfExportLimitError extends Error {}
export class PdfInputLimitError extends Error {}

export const PDF_EDITOR_LOADING_LIMITS = { maxImageSize: 16_000_000, canvasMaxAreaInBytes: 64_000_000 }

/** Inspect declared image sizes without decoding compressed image payloads. */
export function assertPdfEditorResources(document: PDFDocument) {
  if (document.getPageCount() < 1) throw new Error('empty PDF')
  if (document.getPageCount() > 500) throw new PdfInputLimitError('page budget')
  let pixels = 0
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || object.dict.lookupMaybe(PDFName.of('Subtype'), PDFName) !== PDFName.of('Image')) continue
    const width = object.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber()
    const height = object.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber()
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 16_384 || height > 16_384 || width * height > PDF_EDITOR_LOADING_LIMITS.maxImageSize) throw new PdfInputLimitError('image budget')
    pixels += width * height
    if (pixels > 250_000_000) throw new PdfInputLimitError('document image budget')
  }
}

export function constrainOverlay(item: PdfOverlay): PdfOverlay {
  const width = Math.min(1, Math.max(0.01, item.width))
  const height = Math.min(1, Math.max(0.01, item.height))
  return { ...item, width, height, x: Math.max(0, Math.min(1 - width, item.x)), y: Math.max(0, Math.min(1 - height, item.y)) }
}

/** Coordinates are relative to the displayed crop box, including page rotation. */
export async function exportEditedPdf(bytes: Uint8Array, preview: PDFDocumentProxy, items: PdfOverlay[]) {
  const output = await PDFDocument.load(bytes)
  const images = new Map<string, Awaited<ReturnType<typeof output.embedPng>>>()
  const fonts = new Map<StandardFonts, Awaited<ReturnType<typeof output.embedFont>>>()
  let decodedPixels = 0
  for (const item of items) {
    const page = output.getPage(item.page - 1)
    const source = await preview.getPage(item.page)
    const viewport = source.getViewport({ scale: 1 })
    const width = item.width * viewport.width, height = item.height * viewport.height
    const centerX = (item.x + item.width / 2) * viewport.width, centerY = (item.y + item.height / 2) * viewport.height
    const angle = (item.rotation ?? 0) * Math.PI / 180
    const point = (x: number, y: number) => viewport.convertToPdfPoint(centerX + Math.cos(angle) * x - Math.sin(angle) * y, centerY + Math.sin(angle) * x + Math.cos(angle) * y)
    const origin = point(-width / 2, height / 2), right = point(width / 2, height / 2), top = point(-width / 2, -height / 2)
    const matrix = [right[0] - origin[0], right[1] - origin[1], top[0] - origin[0], top[1] - origin[1], origin[0], origin[1]] as const
    if (item.text !== undefined) {
      const family = item.textFont ?? 'sans-serif'
      const serif = ['serif', 'Times New Roman', 'Times Roman'].includes(family)
      const mono = ['monospace', 'Courier New', 'Courier'].includes(family)
      const standard = serif || mono || ['sans-serif', 'Arial', 'Helvetica'].includes(family)
      const fontName = serif ? (item.textBold ? (item.textItalic ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold) : item.textItalic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman)
        : mono ? (item.textBold ? (item.textItalic ? StandardFonts.CourierBoldOblique : StandardFonts.CourierBold) : item.textItalic ? StandardFonts.CourierOblique : StandardFonts.Courier)
          : (item.textBold ? (item.textItalic ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold) : item.textItalic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica)
      let font = standard ? fonts.get(fontName) : undefined
      if (standard && !font) { font = await output.embedFont(fontName); fonts.set(fontName, font) }
      // Unsupported glyphs and device fonts retain their exact browser appearance.
      let vector = !!font
      try { item.text.split('\n').forEach((line) => font?.encodeText(line)) } catch { vector = false }
      if (vector && font) {
        const layout = textLayout(item.text, family, item)
        const hex = item.textColor ?? '#111827'
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(matrix[0] / layout.width, matrix[1] / layout.width, matrix[2] / layout.height, matrix[3] / layout.height, matrix[4], matrix[5]))
        for (let index = 0; index < layout.lines.length; index++) {
          const line = layout.lines[index]
          if (!line) continue
          const lineWidth = layout.widths[index]
          const x = item.textAlign === 'center' ? (layout.width - lineWidth) / 2 : item.textAlign === 'right' ? layout.width - 8 - lineWidth : 8
          const scale = lineWidth / Math.max(1, font.widthOfTextAtSize(line, 96))
          page.pushOperators(pushGraphicsState(), concatTransformationMatrix(scale, 0, 0, 1, x, layout.height - 8 - 96 - index * 120))
          page.drawText(line, { x: 0, y: 0, size: 96, font, color: rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255), opacity: item.opacity ?? 1 })
          page.pushOperators(popGraphicsState())
        }
        page.pushOperators(popGraphicsState())
        continue
      }
    }
    const src = item.text !== undefined ? textToPng(item.text, item.textColor ?? '#111827', item.textFont, item, { width: Math.max(128, width * 2), height: Math.max(128, height * 2) }).src : item.src
    let image = images.get(src)
    if (!image) {
      const header = atob(src.slice(src.indexOf(',') + 1, src.indexOf(',') + 45))
      const bytes = Uint8Array.from(header, (character) => character.charCodeAt(0))
      const view = new DataView(bytes.buffer)
      decodedPixels += view.getUint32(16) * view.getUint32(20)
      if (decodedPixels > 32_000_000) throw new PdfExportLimitError('export budget')
      image = await output.embedPng(src)
      images.set(src, image)
    }
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrix))
    page.drawImage(image, { x: 0, y: 0, width: 1, height: 1, opacity: item.opacity ?? 1 })
    page.pushOperators(popGraphicsState())
  }
  return output.save()
}

export async function imageToPng(file: Blob) {
  if (file.size > 15 * 1024 * 1024) throw new Error('image limit')
  const preflight = await preflightImage(file instanceof File ? file : new File([file], 'image', { type: file.type }))
  if (!['png', 'jpeg', 'webp'].includes(preflight.detectedType) || preflight.width * preflight.height > 16_000_000) throw new Error('image limit')
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  try {
    if (bitmap.width * bitmap.height > 16_000_000) throw new Error('image limit')
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return { src: canvas.toDataURL('image/png'), ratio: bitmap.width / bitmap.height }
  } finally {
    bitmap.close()
    canvas.width = canvas.height = 0
  }
}

export async function cropImage(src: string, crop: { x: number; y: number; width: number; height: number }) {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1 + 1e-8 || crop.y + crop.height > 1 + 1e-8) throw new Error('crop bounds')
  // Imported overlays are PNG data URLs. Decode locally without a CSP-blocked network request.
  const prefix = 'data:image/png;base64,'
  if (!src.startsWith(prefix) || src.length > 32_000_000) throw new Error('crop source')
  const bytes = Uint8Array.from(atob(src.slice(prefix.length)), (character) => character.charCodeAt(0))
  const image = new File([bytes], 'image.png', { type: 'image/png' })
  const header = await preflightImage(image)
  if (header.detectedType !== 'png' || header.width * header.height > 16_000_000) throw new Error('image limit')
  const bitmap = await createImageBitmap(image)
  const canvas = document.createElement('canvas')
  try {
    if (bitmap.width !== header.width || bitmap.height !== header.height) throw new Error('image dimensions')
    const x = Math.min(bitmap.width - 1, Math.floor(crop.x * bitmap.width)), y = Math.min(bitmap.height - 1, Math.floor(crop.y * bitmap.height))
    const width = Math.max(1, Math.min(bitmap.width - x, Math.round(crop.width * bitmap.width)))
    const height = Math.max(1, Math.min(bitmap.height - y, Math.round(crop.height * bitmap.height)))
    canvas.width = width; canvas.height = height
    canvas.getContext('2d')!.drawImage(bitmap, x, y, width, height, 0, 0, width, height)
    return { src: canvas.toDataURL('image/png'), ratio: width / height }
  } finally { bitmap.close(); canvas.width = canvas.height = 0 }
}

export function textLayout(text: string, font = 'sans-serif', style: Pick<PdfOverlay, 'textBold' | 'textItalic'> = {}) {
  const canvas = document.createElement('canvas')
  try {
    const context = canvas.getContext('2d')!
    context.font = `${style.textItalic ? 'italic ' : ''}${style.textBold ? 'bold ' : ''}96px ${pdfFontFamily(font)}`
    const lines = text.split('\n')
    const widths = lines.map((line) => { const m = context.measureText(line); return Math.max(m.width, Math.max(0, m.actualBoundingBoxLeft) + m.actualBoundingBoxRight) })
    const width = Math.ceil(Math.max(1, ...widths)) + 16, height = lines.length * 120 + 16
    if (width > 8192 || height > 8192 || width * height > 16_000_000) throw new Error('text dimensions')
    return { width, height, lines, widths, ratio: width / height }
  } finally { canvas.width = canvas.height = 0 }
}

export function textToPng(text: string, color: string, font = 'sans-serif', style: Pick<PdfOverlay, 'textBold' | 'textItalic' | 'textAlign'> = {}, outputSize?: { width: number; height: number }) {
  const canvas = document.createElement('canvas')
  try {
    const context = canvas.getContext('2d')!
    const layout = textLayout(text, font, style)
    const fontStyle = `${style.textItalic ? 'italic ' : ''}${style.textBold ? 'bold ' : ''}96px ${pdfFontFamily(font)}`
    const scale = outputSize ? Math.min(outputSize.width / layout.width, outputSize.height / layout.height, 2048 / layout.width, 2048 / layout.height, Math.sqrt(1_000_000 / (layout.width * layout.height))) : 1
    canvas.width = Math.max(1, Math.floor(layout.width * scale))
    canvas.height = Math.max(1, Math.floor(layout.height * scale))
    context.scale(canvas.width / layout.width, canvas.height / layout.height)
    context.font = fontStyle
    context.fillStyle = color
    layout.lines.forEach((line, index) => {
      const width = layout.widths[index]
      const x = style.textAlign === 'center' ? (layout.width - width) / 2 : style.textAlign === 'right' ? layout.width - 8 - width : 8
      context.fillText(line, x, 8 + 96 + index * 120)
    })
    return { src: canvas.toDataURL('image/png'), ratio: canvas.width / canvas.height }
  } finally { canvas.width = canvas.height = 0 }
}
