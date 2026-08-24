export interface UniformBackgroundResult {
  accepted: boolean
  borderColor: readonly [number, number, number]
  borderUniformity: number
  pixels: Uint8ClampedArray
  removedRatio: number
}

const MIN_AUTO_BORDER_UNIFORMITY = 0.78
const MIN_AUTO_REMOVED_RATIO = 0.04
const MAX_AUTO_REMOVED_RATIO = 0.96

function colorDistance(
  pixels: Uint8ClampedArray,
  pixelOffset: number,
  background: readonly [number, number, number],
) {
  const red = pixels[pixelOffset] - background[0]
  const green = pixels[pixelOffset + 1] - background[1]
  const blue = pixels[pixelOffset + 2] - background[2]
  return Math.sqrt(red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11)
}

function collectBorderOffsets(width: number, height: number) {
  const offsets: number[] = []
  const step = Math.max(1, Math.floor((width * 2 + height * 2) / 4096))

  for (let x = 0; x < width; x += step) {
    offsets.push(x * 4, ((height - 1) * width + x) * 4)
  }
  for (let y = step; y < height - 1; y += step) {
    offsets.push(y * width * 4, (y * width + width - 1) * 4)
  }

  return offsets
}

function estimateBorderColor(pixels: Uint8ClampedArray, offsets: readonly number[]) {
  const bins = new Map<number, { count: number; red: number; green: number; blue: number }>()

  for (const offset of offsets) {
    if (pixels[offset + 3] < 128) continue
    const key = (pixels[offset] >> 4) << 8 | (pixels[offset + 1] >> 4) << 4 | (pixels[offset + 2] >> 4)
    const bin = bins.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 }
    bin.count += 1
    bin.red += pixels[offset]
    bin.green += pixels[offset + 1]
    bin.blue += pixels[offset + 2]
    bins.set(key, bin)
  }

  const dominant = [...bins.values()].sort((left, right) => right.count - left.count)[0]
  if (!dominant) return null

  return [
    Math.round(dominant.red / dominant.count),
    Math.round(dominant.green / dominant.count),
    Math.round(dominant.blue / dominant.count),
  ] as const
}

function smoothstep(start: number, end: number, value: number) {
  const normalized = Math.min(1, Math.max(0, (value - start) / Math.max(1, end - start)))
  return normalized * normalized * (3 - 2 * normalized)
}

function restoreEdgeColor(
  pixels: Uint8ClampedArray,
  offset: number,
  background: readonly [number, number, number],
  coverage: number,
) {
  if (coverage <= 0.15 || coverage >= 0.98) return

  for (let channel = 0; channel < 3; channel += 1) {
    const foreground = (pixels[offset + channel] - background[channel] * (1 - coverage)) / coverage
    pixels[offset + channel] = Math.min(255, Math.max(0, Math.round(foreground)))
  }
}

export function removeUniformBackgroundPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  sensitivity = 55,
  force = false,
  removeEnclosedAreas = false,
  copyPixels = true,
): UniformBackgroundResult | null {
  if (width <= 0 || height <= 0 || source.length !== width * height * 4) return null

  const pixels = copyPixels ? new Uint8ClampedArray(source) : source
  const borderOffsets = collectBorderOffsets(width, height)
  const borderColor = estimateBorderColor(pixels, borderOffsets)
  if (!borderColor) return null

  const normalizedSensitivity = Math.min(100, Math.max(0, sensitivity))
  const coreTolerance = 16 + normalizedSensitivity * 0.12
  const featherTolerance = coreTolerance + 10 + normalizedSensitivity * 0.12
  const borderMatches = borderOffsets.filter((offset) => (
    pixels[offset + 3] >= 128 && colorDistance(pixels, offset, borderColor) <= Math.min(coreTolerance + 6, 30)
  )).length
  const opaqueBorderPixels = borderOffsets.filter((offset) => pixels[offset + 3] >= 128).length
  const borderUniformity = opaqueBorderPixels > 0 ? borderMatches / opaqueBorderPixels : 0

  if (!force && borderUniformity < MIN_AUTO_BORDER_UNIFORMITY) {
    return { accepted: false, borderColor, borderUniformity, pixels, removedRatio: 0 }
  }

  const backgroundMask = new Uint8Array(width * height)
  const stack: number[] = []
  const pushSeed = (x: number, y: number) => {
    const index = y * width + x
    if (backgroundMask[index]) return
    const offset = index * 4
    if (pixels[offset + 3] === 0 || colorDistance(pixels, offset, borderColor) <= coreTolerance) {
      stack.push(index)
    }
  }

  for (let x = 0; x < width; x += 1) {
    pushSeed(x, 0)
    if (height > 1) pushSeed(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushSeed(0, y)
    if (width > 1) pushSeed(width - 1, y)
  }

  let removedPixels = 0
  let opaquePixels = 0
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] > 0) opaquePixels += 1
  }

  const isCoreBackground = (index: number) => {
    if (backgroundMask[index]) return false
    const offset = index * 4
    return pixels[offset + 3] === 0 || colorDistance(pixels, offset, borderColor) <= coreTolerance
  }

  const removeConnectedBackground = () => {
    while (stack.length > 0) {
      const seed = stack.pop()
      if (seed === undefined || !isCoreBackground(seed)) continue

      const y = Math.floor(seed / width)
      let left = seed % width
      while (left > 0 && isCoreBackground(y * width + left - 1)) left -= 1

      let spansUp = false
      let spansDown = false
      for (let x = left; x < width; x += 1) {
        const index = y * width + x
        if (!isCoreBackground(index)) break

        backgroundMask[index] = 1
        const offset = index * 4
        if (pixels[offset + 3] > 0) {
          pixels[offset + 3] = 0
          removedPixels += 1
        }

        if (y > 0) {
          const up = index - width
          if (isCoreBackground(up)) {
            if (!spansUp) stack.push(up)
            spansUp = true
          } else {
            spansUp = false
          }
        }

        if (y + 1 < height) {
          const down = index + width
          if (isCoreBackground(down)) {
            if (!spansDown) stack.push(down)
            spansDown = true
          } else {
            spansDown = false
          }
        }
      }
    }
  }

  removeConnectedBackground()

  if (removeEnclosedAreas) {
    for (let index = 0; index < width * height; index += 1) {
      if (!isCoreBackground(index)) continue
      stack.push(index)
      removeConnectedBackground()
    }
  }

  const touchesBackground = (index: number) => {
    const x = index % width
    const y = Math.floor(index / width)
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const nextY = y + offsetY
      if (nextY < 0 || nextY >= height) continue
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const nextX = x + offsetX
        if (nextX < 0 || nextX >= width || (offsetX === 0 && offsetY === 0)) continue
        if (backgroundMask[nextY * width + nextX]) return true
      }
    }
    return false
  }

  for (let index = 0; index < width * height; index += 1) {
    if (backgroundMask[index] || !touchesBackground(index)) continue
    const offset = index * 4
    const previousAlpha = pixels[offset + 3]
    if (previousAlpha === 0) continue
    const distance = colorDistance(pixels, offset, borderColor)
    if (distance > featherTolerance) continue

    const coverage = smoothstep(coreTolerance, featherTolerance, distance)
    restoreEdgeColor(pixels, offset, borderColor, coverage)
    pixels[offset + 3] = Math.round(previousAlpha * coverage)
    if (pixels[offset + 3] < previousAlpha / 2) removedPixels += 1
  }

  const removedRatio = opaquePixels > 0 ? removedPixels / opaquePixels : 0
  const accepted = force || (
    borderUniformity >= MIN_AUTO_BORDER_UNIFORMITY
    && removedRatio >= MIN_AUTO_REMOVED_RATIO
    && removedRatio <= MAX_AUTO_REMOVED_RATIO
  )

  return { accepted, borderColor, borderUniformity, pixels, removedRatio }
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('BACKGROUND_CANVAS_EXPORT_FAILED'))
    }, 'image/png')
  })
}

export async function removeUniformBackground(
  file: File,
  sensitivity: number,
  force = false,
  removeEnclosedAreas = false,
) {
  const objectUrl = typeof createImageBitmap === 'function' ? null : URL.createObjectURL(file)
  const image = typeof createImageBitmap === 'function'
    ? await createImageBitmap(file)
    : await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element)
        element.onerror = () => reject(new Error('BACKGROUND_IMAGE_DECODE_FAILED'))
        element.src = objectUrl!
      })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 'naturalWidth' in image ? image.naturalWidth : image.width
    canvas.height = 'naturalHeight' in image ? image.naturalHeight : image.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('BACKGROUND_CANVAS_UNAVAILABLE')

    context.drawImage(image, 0, 0)
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const result = removeUniformBackgroundPixels(
      imageData.data,
      canvas.width,
      canvas.height,
      sensitivity,
      force,
      removeEnclosedAreas,
      false,
    )
    if (!result?.accepted) return null

    imageData.data.set(result.pixels)
    context.putImageData(imageData, 0, 0)
    return {
      blob: await canvasToPng(canvas),
      borderUniformity: result.borderUniformity,
      removedRatio: result.removedRatio,
    }
  } finally {
    if ('close' in image) image.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
