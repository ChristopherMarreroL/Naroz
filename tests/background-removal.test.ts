import { describe, expect, test } from 'bun:test'

import { removeUniformBackgroundPixels } from '../src/features/image/lib/uniformBackgroundRemoval'

function createPixels(width: number, height: number, color: readonly [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    pixels.set(color, index * 4)
  }
  return pixels
}

function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
) {
  pixels.set(color, (y * width + x) * 4)
}

function alphaAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  return pixels[(y * width + x) * 4 + 3]
}

describe('uniform background removal', () => {
  test('removes an edge-connected black background without deleting enclosed black artwork', () => {
    const width = 9
    const height = 9
    const pixels = createPixels(width, height, [0, 0, 0, 255])

    for (let y = 2; y <= 6; y += 1) {
      for (let x = 2; x <= 6; x += 1) {
        setPixel(pixels, width, x, y, [245, 245, 245, 255])
      }
    }
    setPixel(pixels, width, 4, 4, [0, 0, 0, 255])

    const result = removeUniformBackgroundPixels(pixels, width, height, 55)

    expect(result?.accepted).toBe(true)
    expect(alphaAt(result!.pixels, width, 0, 0)).toBe(0)
    expect(alphaAt(result!.pixels, width, 2, 2)).toBe(255)
    expect(alphaAt(result!.pixels, width, 4, 4)).toBe(255)
  })

  test('optionally removes enclosed areas that match the detected background', () => {
    const width = 9
    const height = 9
    const pixels = createPixels(width, height, [255, 255, 255, 255])

    for (let y = 2; y <= 6; y += 1) {
      for (let x = 2; x <= 6; x += 1) {
        setPixel(pixels, width, x, y, [15, 15, 15, 255])
      }
    }
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) {
        setPixel(pixels, width, x, y, [255, 255, 255, 255])
      }
    }

    const preserved = removeUniformBackgroundPixels(pixels, width, height, 55, true)
    const removed = removeUniformBackgroundPixels(pixels, width, height, 55, true, true)

    expect(alphaAt(preserved!.pixels, width, 4, 4)).toBe(255)
    expect(alphaAt(removed!.pixels, width, 4, 4)).toBe(0)
    expect(alphaAt(removed!.pixels, width, 2, 2)).toBe(255)
  })

  test('rejects a complex border so automatic mode can fall back to AI', () => {
    const width = 10
    const height = 10
    const pixels = createPixels(width, height, [120, 120, 120, 255])

    for (let x = 0; x < width; x += 1) {
      setPixel(pixels, width, x, 0, x % 2 === 0 ? [220, 20, 20, 255] : [20, 20, 220, 255])
      setPixel(pixels, width, x, height - 1, x % 2 === 0 ? [20, 220, 20, 255] : [220, 220, 20, 255])
    }
    for (let y = 1; y < height - 1; y += 1) {
      setPixel(pixels, width, 0, y, y % 2 === 0 ? [220, 20, 220, 255] : [20, 220, 220, 255])
      setPixel(pixels, width, width - 1, y, y % 2 === 0 ? [240, 120, 20, 255] : [20, 120, 240, 255])
    }

    const result = removeUniformBackgroundPixels(pixels, width, height, 55)

    expect(result?.accepted).toBe(false)
    expect(result?.borderUniformity).toBeLessThan(0.78)
  })

  test('uses sensitivity to include or preserve background color variation', () => {
    const width = 9
    const height = 9
    const pixels = createPixels(width, height, [0, 0, 0, 255])

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        setPixel(pixels, width, x, y, [20, 20, 20, 255])
      }
    }
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) {
        setPixel(pixels, width, x, y, [240, 240, 240, 255])
      }
    }

    const conservative = removeUniformBackgroundPixels(pixels, width, height, 0, true)
    const aggressive = removeUniformBackgroundPixels(pixels, width, height, 100, true)

    expect(alphaAt(conservative!.pixels, width, 1, 1)).toBeGreaterThan(64)
    expect(alphaAt(aggressive!.pixels, width, 1, 1)).toBe(0)
    expect(alphaAt(aggressive!.pixels, width, 4, 4)).toBe(255)
  })

  test('does not let feathered edge pixels propagate into a dark subject gradient', () => {
    const width = 10
    const height = 8
    const pixels = createPixels(width, height, [0, 0, 0, 255])

    for (let y = 2; y <= 5; y += 1) {
      setPixel(pixels, width, 3, y, [35, 35, 35, 255])
      setPixel(pixels, width, 4, y, [45, 45, 45, 255])
      setPixel(pixels, width, 5, y, [90, 90, 90, 255])
      setPixel(pixels, width, 6, y, [180, 180, 180, 255])
    }

    const result = removeUniformBackgroundPixels(pixels, width, height, 100, true)

    expect(alphaAt(result!.pixels, width, 3, 3)).toBeLessThan(255)
    expect(alphaAt(result!.pixels, width, 4, 3)).toBe(255)
    expect(alphaAt(result!.pixels, width, 5, 3)).toBe(255)
  })
})
