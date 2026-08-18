export const MAX_IMAGE_PIXELS = 40_000_000
export const MAX_IMAGE_DIMENSION = 32_767
const IMAGE_HEADER_MAX_BYTES = 1024 * 1024

const JPEG_SIZE_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

interface ImageDimensions {
  width: number
  height: number
}

export function validateImageDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'INVALID_IMAGE_DIMENSIONS' as const
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    return 'IMAGE_DIMENSIONS_TOO_LARGE' as const
  }

  return null
}

export function assertSafeImageDimensions(width: number, height: number) {
  const error = validateImageDimensions(width, height)
  if (error) {
    throw new Error(error)
  }
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  if (offset + 2 > bytes.length) return null
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  if (offset + 2 > bytes.length) return null
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  if (offset + 3 > bytes.length) return null
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.length) return null
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false)
}

function readUint32LE(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.length) return null
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true)
}

function hasAscii(bytes: Uint8Array, offset: number, value: string) {
  return Array.from(value, (character) => character.charCodeAt(0)).every(
    (character, index) => bytes[offset + index] === character,
  )
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value) || !hasAscii(bytes, 12, 'IHDR')) return null

  const width = readUint32BE(bytes, 16)
  const height = readUint32BE(bytes, 20)
  return width === null || height === null ? null : { width, height }
}

function readGifDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10 || !hasAscii(bytes, 0, 'GIF')) return null
  const width = readUint16LE(bytes, 6)
  const height = readUint16LE(bytes, 8)
  return width === null || height === null ? null : { width, height }
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let offset = 2
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === undefined) return null
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (marker === 0xda) return null

    const segmentLength = readUint16BE(bytes, offset)
    if (segmentLength === null || segmentLength < 2 || offset + segmentLength > bytes.length) return null
    if (JPEG_SIZE_MARKERS.has(marker)) {
      if (segmentLength < 7) return null
      const height = readUint16BE(bytes, offset + 3)
      const width = readUint16BE(bytes, offset + 5)
      return width === null || height === null ? null : { width, height }
    }
    offset += segmentLength
  }

  return null
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30 || !hasAscii(bytes, 0, 'RIFF') || !hasAscii(bytes, 8, 'WEBP')) return null

  if (hasAscii(bytes, 12, 'VP8X')) {
    const width = readUint24LE(bytes, 24)
    const height = readUint24LE(bytes, 27)
    return width === null || height === null ? null : { width: width + 1, height: height + 1 }
  }

  if (hasAscii(bytes, 12, 'VP8L') && bytes[20] === 0x2f) {
    const bits = readUint32LE(bytes, 21)
    if (bits === null) return null
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    }
  }

  if (hasAscii(bytes, 12, 'VP8 ')) {
    const syncCodeMatches = bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a
    if (!syncCodeMatches) return null
    const width = readUint16LE(bytes, 26)
    const height = readUint16LE(bytes, 28)
    return width === null || height === null
      ? null
      : { width: width & 0x3fff, height: height & 0x3fff }
  }

  return null
}

function readBmpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 26 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null
  const width = readUint32LE(bytes, 18)
  const rawHeight = readUint32LE(bytes, 22)
  if (width === null || rawHeight === null) return null
  return { width, height: rawHeight > 0x7fffffff ? 0x100000000 - rawHeight : rawHeight }
}

function readIcoDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 6 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) return null
  const count = readUint16LE(bytes, 4)
  if (count === null || count === 0 || bytes.length < 6 + count * 16) return null

  let width = 0
  let height = 0
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16
    width = Math.max(width, bytes[offset] || 256)
    height = Math.max(height, bytes[offset + 1] || 256)
  }
  return { width, height }
}

interface BmffBox {
  end: number
  payloadStart: number
  type: string
}

function readBmffBox(bytes: Uint8Array, offset: number, limit: number): BmffBox | null {
  if (offset + 8 > limit) return null
  const size = readUint32BE(bytes, offset)
  if (size === null) return null

  let headerSize = 8
  let boxSize = size
  if (size === 1) {
    if (offset + 16 > limit) return null
    const high = readUint32BE(bytes, offset + 8)
    const low = readUint32BE(bytes, offset + 12)
    if (high === null || low === null) return null
    boxSize = high * 0x1_0000_0000 + low
    headerSize = 16
  } else if (size === 0) {
    boxSize = limit - offset
  }

  if (!Number.isSafeInteger(boxSize) || boxSize < headerSize || boxSize > limit - offset) return null
  const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8))
  return {
    end: offset + boxSize,
    payloadStart: offset + headerSize,
    type,
  }
}

function readBmffBoxes(bytes: Uint8Array, start: number, end: number) {
  const boxes: BmffBox[] = []
  let offset = start
  while (offset < end) {
    const box = readBmffBox(bytes, offset, end)
    if (!box) return null
    boxes.push(box)
    offset = box.end
  }
  return offset === end ? boxes : null
}

function readAvifDimensions(bytes: Uint8Array): ImageDimensions | null {
  const topLevelBoxes = readBmffBoxes(bytes, 0, bytes.length)
  if (!topLevelBoxes) return null

  const fileTypeBox = topLevelBoxes.find((box) => box.type === 'ftyp')
  if (!fileTypeBox || fileTypeBox.payloadStart + 8 > fileTypeBox.end) return null
  const brands = [String.fromCharCode(...bytes.slice(fileTypeBox.payloadStart, fileTypeBox.payloadStart + 4))]
  for (let offset = fileTypeBox.payloadStart + 8; offset + 4 <= fileTypeBox.end; offset += 4) {
    brands.push(String.fromCharCode(...bytes.slice(offset, offset + 4)))
  }
  if (!brands.some((brand) => brand === 'avif' || brand === 'avis')) return null

  const metaBox = topLevelBoxes.find((box) => box.type === 'meta')
  if (!metaBox || metaBox.payloadStart + 4 > metaBox.end) return null
  const metaChildren = readBmffBoxes(bytes, metaBox.payloadStart + 4, metaBox.end)
  const propertyContainer = metaChildren?.find((box) => box.type === 'ipco')
  if (!propertyContainer) return null

  const properties = readBmffBoxes(bytes, propertyContainer.payloadStart, propertyContainer.end)
  const imageSpatialExtents = properties?.find((box) => box.type === 'ispe')
  if (!imageSpatialExtents || imageSpatialExtents.payloadStart + 12 > imageSpatialExtents.end) return null

  const width = readUint32BE(bytes, imageSpatialExtents.payloadStart + 4)
  const height = readUint32BE(bytes, imageSpatialExtents.payloadStart + 8)
  return width === null || height === null ? null : { width, height }
}

function parseSvgLength(value: string | undefined) {
  if (!value || /%/.test(value)) return null
  const match = value.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))(px|in|cm|mm|pt|pc)?$/i)
  if (!match) return null
  const number = Number.parseFloat(match[1])
  const unit = match[2]?.toLowerCase()
  if (!Number.isFinite(number)) return null
  if (unit === 'in') return number * 96
  if (unit === 'cm') return number * 96 / 2.54
  if (unit === 'mm') return number * 96 / 25.4
  if (unit === 'pt') return number * 96 / 72
  if (unit === 'pc') return number * 16
  return number
}

function readSvgDimensions(bytes: Uint8Array): ImageDimensions | null {
  const text = new TextDecoder().decode(bytes)
  const tag = text.match(/<svg\b[^>]*>/i)?.[0]
  if (!tag) return null

  const width = parseSvgLength(tag.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1])
  const height = parseSvgLength(tag.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1])
  const viewBox = tag.match(/\bviewBox\s*=\s*["']\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:\s+|,)+([+-]?(?:\d+\.?\d*|\.\d+))(?:\s+|,)+([+-]?(?:\d+\.?\d*|\.\d+))(?:\s+|,)+([+-]?(?:\d+\.?\d*|\.\d+))\s*["']/i)
  const viewBoxWidth = viewBox ? Number.parseFloat(viewBox[3]) : null
  const viewBoxHeight = viewBox ? Number.parseFloat(viewBox[4]) : null

  return {
    width: width ?? (viewBoxWidth && viewBoxWidth > 0 ? viewBoxWidth : 300),
    height: height ?? (viewBoxHeight && viewBoxHeight > 0 ? viewBoxHeight : 150),
  }
}

function getImageExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function readImageHeaderDimensions(bytes: Uint8Array, file: File) {
  const extension = getImageExtension(file.name)
  const type = file.type.toLowerCase()

  return readPngDimensions(bytes)
    ?? readGifDimensions(bytes)
    ?? readJpegDimensions(bytes)
    ?? readWebpDimensions(bytes)
    ?? readBmpDimensions(bytes)
    ?? readIcoDimensions(bytes)
    ?? ((type === 'image/svg+xml' || extension === 'svg') ? readSvgDimensions(bytes) : null)
    ?? ((type === 'image/avif' || extension === 'avif') ? readAvifDimensions(bytes) : null)
}

export async function assertSafeImageFile(file: File) {
  const header = new Uint8Array(await file.slice(0, IMAGE_HEADER_MAX_BYTES).arrayBuffer())
  const dimensions = readImageHeaderDimensions(header, file)
  if (!dimensions) {
    throw new Error('IMAGE_DIMENSIONS_UNAVAILABLE')
  }
  assertSafeImageDimensions(dimensions.width, dimensions.height)
}
