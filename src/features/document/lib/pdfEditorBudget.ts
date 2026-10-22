/** Shared by edit admission and export; compressed PNG length does not bound decoded memory. */
export const PDF_EDITOR_IMAGE_PIXELS = 32_000_000

export function pngPixelCount(src: string) {
  const prefix = 'data:image/png;base64,'
  if (!src.startsWith(prefix) || src.length < prefix.length + 32) throw new Error('image header')
  const header = atob(src.slice(prefix.length, prefix.length + 32))
  const bytes = Uint8Array.from(header, (character) => character.charCodeAt(0))
  if (bytes.length !== 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) || header.slice(12, 16) !== 'IHDR') throw new Error('image header')
  const view = new DataView(bytes.buffer)
  const width = view.getUint32(16), height = view.getUint32(20)
  if (!width || !height || width > 16_384 || height > 16_384) throw new Error('image dimensions')
  return width * height
}
