export const MAX_IMAGE_PIXELS = 40_000_000
export const MAX_IMAGE_DIMENSION = 32_767

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
