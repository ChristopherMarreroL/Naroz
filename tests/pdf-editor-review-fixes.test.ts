import { expect, test } from 'bun:test'
import { cropImage, textToPng } from '../src/features/document/lib/pdfEditor'

async function withGlobals(values: Record<string, unknown>, run: () => Promise<void> | void) {
  const previous = new Map(Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  try { await run() } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
}

function pngSource(width = 64, height = 32) {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  bytes.set([73, 72, 68, 82], 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width); view.setUint32(20, height)
  return { bytes, src: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}` }
}

const fullCrop = { x: 0, y: 0, width: 1, height: 1 }

test('review: local PNG cropping works when CSP blocks every fetch', async () => {
  const source = pngSource()
  const decoded: Blob[] = [], draws: number[][] = []
  let fetches = 0, closed = 0
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (_bitmap: unknown, ...args: number[]) => draws.push(args) }), toDataURL: () => 'synthetic output' }
  await withGlobals({
    fetch: () => { fetches++; throw new Error('CSP connect-src denies data:') },
    createImageBitmap: async (blob: Blob) => { decoded.push(blob); return { width: 64, height: 32, close: () => closed++ } },
    document: { createElement: () => canvas },
  }, async () => {
    const result = await cropImage(source.src, { x: .25, y: .25, width: .5, height: .5 })
    expect(result.ratio).toBe(2)
  })
  expect(fetches).toBe(0)
  expect(decoded).toHaveLength(1)
  expect(decoded[0]).toBeInstanceOf(Blob)
  expect(decoded[0].type).toBe('image/png')
  expect(new Uint8Array(await decoded[0].arrayBuffer())).toEqual(source.bytes)
  expect(draws).toEqual([[16, 8, 32, 16, 0, 0, 32, 16]])
  expect(closed).toBe(1)
  expect(canvas.width).toBe(0); expect(canvas.height).toBe(0)
})

test('review: crop rejects remote URLs, SVG and malformed PNG data before fetch or decode', async () => {
  let fetches = 0, decodes = 0
  await withGlobals({
    fetch: () => { fetches++; return Promise.reject(new Error('unexpected fetch')) },
    createImageBitmap: () => { decodes++; return Promise.reject(new Error('unexpected decode')) },
  }, async () => {
    for (const source of ['https://example.invalid/private.png', 'blob:external', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,%%%%', 'data:image/png;base64,YWJj', pngSource(5000, 5000).src]) {
      await expect(cropImage(source, fullCrop)).rejects.toThrow()
    }
  })
  expect(fetches).toBe(0)
  expect(decodes).toBe(0)
})

test('review: crop encoding errors close the decoded bitmap and clear its canvas', async () => {
  let closed = 0
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }), toDataURL: () => { throw new Error('synthetic encoding failure') } }
  await withGlobals({
    fetch: () => Promise.reject(new Error('CSP connect-src denies data:')),
    createImageBitmap: async () => ({ width: 64, height: 32, close: () => closed++ }),
    document: { createElement: () => canvas },
  }, async () => {
    await expect(cropImage(pngSource().src, fullCrop)).rejects.toThrow('synthetic encoding failure')
  })
  expect(closed).toBe(1)
  expect(canvas.width).toBe(0); expect(canvas.height).toBe(0)
})

test('review: crop source byte limit rejects before base64 allocation or decoding', async () => {
  let allocations = 0, decodes = 0
  await withGlobals({
    atob: () => { allocations++; throw new Error('unexpected allocation') },
    createImageBitmap: () => { decodes++; return Promise.reject(new Error('unexpected decode')) },
  }, async () => {
    await expect(cropImage('data:image/png;base64,' + 'A'.repeat(32_000_000), fullCrop)).rejects.toThrow('crop source')
  })
  expect(allocations).toBe(0); expect(decodes).toBe(0)
})

test('review: crop rejects decoded dimension mismatches and releases acquired resources', async () => {
  let closed = 0, draws = 0
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => draws++ }), toDataURL: () => 'unexpected output' }
  await withGlobals({
    createImageBitmap: async () => ({ width: 32, height: 64, close: () => closed++ }),
    document: { createElement: () => canvas },
  }, async () => {
    await expect(cropImage(pngSource().src, fullCrop)).rejects.toThrow('image dimensions')
  })
  expect(closed).toBe(1); expect(draws).toBe(0)
  expect(canvas.width).toBe(0); expect(canvas.height).toBe(0)
})

function textCanvases(encodingFails = false) {
  const canvases: { width: number; height: number }[] = []
  return { canvases, document: { createElement: () => {
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ measureText: (text: string) => ({ width: text.length * 100, actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.length * 100 }), scale: () => undefined, fillText: () => undefined }),
      toDataURL: () => { if (encodingFails) throw new Error('synthetic encoding failure'); return JSON.stringify({ width: canvas.width, height: canvas.height }) },
    }
    canvases.push(canvas)
    return canvas
  } } }
}

test('review: short raster text increases resolution to match its enlarged PDF placement', async () => {
  const setup = textCanvases()
  await withGlobals({ document: setup.document }, () => {
    const result = textToPng('短文', '#111827', 'device font', {}, { width: 800, height: 600 })
    const size = JSON.parse(result.src) as { width: number; height: number }
    expect(size.width).toBeGreaterThan(216)
    expect(size.height).toBeGreaterThan(136)
    expect(size.width).toBeLessThanOrEqual(800)
    expect(size.height).toBeLessThanOrEqual(600)
    expect(result.ratio).toBeCloseTo(216 / 136, 2)
  })
  expect(setup.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true)
})

test('review: requested raster sizes obey strict edge and pixel limits after rounding', async () => {
  const setup = textCanvases()
  await withGlobals({ document: setup.document }, () => {
    for (const text of ['短文', 'x', '短\n文', 'x'.repeat(20)]) {
      const result = textToPng(text, '#111827', 'device font', {}, { width: 1_000_000, height: 1_000_000 })
      const size = JSON.parse(result.src) as { width: number; height: number }
      expect(size.width).toBeLessThanOrEqual(2048); expect(size.height).toBeLessThanOrEqual(2048)
      expect(size.width * size.height).toBeLessThanOrEqual(1_000_000)
      expect(Math.max(size.width, size.height)).toBeGreaterThan(500)
    }
    const small = JSON.parse(textToPng('短文', '#111827', 'device font', {}, { width: 80, height: 40 }).src) as { width: number; height: number }
    expect(small.width).toBeLessThanOrEqual(80); expect(small.height).toBeLessThanOrEqual(40)
  })
})

test('review: enlarged raster encoding failure releases both layout and output canvases', async () => {
  const setup = textCanvases(true)
  await withGlobals({ document: setup.document }, () => {
    expect(() => textToPng('短文', '#111827', 'device font', {}, { width: 1600, height: 1200 })).toThrow('synthetic encoding failure')
  })
  expect(setup.canvases).toHaveLength(2)
  expect(setup.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true)
})
