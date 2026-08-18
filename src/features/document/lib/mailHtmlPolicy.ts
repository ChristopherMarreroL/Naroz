export const MAIL_HTML_FORBIDDEN_TAGS = [
  'audio', 'base', 'embed', 'form', 'iframe', 'input', 'link', 'math', 'meta',
  'object', 'script', 'source', 'style', 'svg', 'track', 'video',
]

export const MAIL_HTML_FORBIDDEN_ATTRIBUTES = [
  'background', 'formaction', 'href', 'poster', 'srcdoc', 'srcset', 'style', 'target',
]

export function isAllowedMailImageSource(value: string | null) {
  return /^data:image\/(?:gif|jpe?g|png);base64,/i.test(value?.trim() ?? '')
}

const MAIL_IMAGE_MAX_DIMENSION = 8_192
const MAIL_IMAGE_MAX_PIXELS = 25_000_000
const MAIL_IMAGE_MAX_BYTES = 2 * 1024 * 1024

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = bytes[offset + 1]
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
    if (length < 2) return null
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker ?? -1)) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
      }
    }
    offset += length + 2
  }

  return null
}

function readImageDimensions(bytes: Uint8Array) {
  const isPng = bytes.length >= 24
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (isPng) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }

  const isGif = bytes.length >= 10
    && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
  if (isGif) {
    return {
      width: (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8),
      height: (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8),
    }
  }

  return readJpegDimensions(bytes)
}

export function isSafeMailImageSource(value: string | null) {
  const source = value?.trim() ?? ''
  if (!isAllowedMailImageSource(source)) return false

  const base64 = source.slice(source.indexOf(',') + 1)
  if (base64.length > Math.ceil((MAIL_IMAGE_MAX_BYTES * 4) / 3)) return false

  try {
    const binary = atob(base64)
    if (binary.length > MAIL_IMAGE_MAX_BYTES) return false
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const dimensions = readImageDimensions(bytes)
    return Boolean(
      dimensions
      && dimensions.width > 0
      && dimensions.height > 0
      && dimensions.width <= MAIL_IMAGE_MAX_DIMENSION
      && dimensions.height <= MAIL_IMAGE_MAX_DIMENSION
      && dimensions.width * dimensions.height <= MAIL_IMAGE_MAX_PIXELS,
    )
  } catch {
    return false
  }
}
