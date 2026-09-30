import { expect, test } from 'bun:test'
import { PDFDocument, PDFName, PDFNumber } from 'pdf-lib'
import { assertPdfEditorResources, cropImage, imageToPng, PdfInputLimitError, textLayout, textToPng } from '../src/features/document/lib/pdfEditor'
import { pdfFontFamily } from '../src/features/document/lib/pdfFonts'
import { appendHistory, imageBudget } from '../src/features/document/lib/pdfEditorState'

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  bytes.set([73, 72, 68, 82], 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width); view.setUint32(20, height)
  return new File([bytes], 'synthetic.png', { type: 'image/png' })
}

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

test('security: image headers and input bytes are bounded before browser decoding', async () => {
  let decodes = 0
  await withGlobals({ createImageBitmap: () => { decodes++; throw new Error('unexpected decode') } }, async () => {
    for (const file of [pngHeader(32768, 1), pngHeader(4001, 4000), pngHeader(0, 20), new File(['<svg onload="alert(1)">'], 'synthetic.png', { type: 'image/png' }), new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'synthetic.png')]) {
      await expect(imageToPng(file)).rejects.toThrow()
    }
  })
  expect(decodes).toBe(0)
})

test('security: decoded dimension mismatch and encoding failure release image resources', async () => {
  let closes = 0
  const canvases: { width: number; height: number }[] = []
  const canvas = () => {
    const value = { width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }), toDataURL: () => { throw new Error('synthetic encoding failure') } }
    canvases.push(value)
    return value
  }
  await withGlobals({ document: { createElement: canvas }, createImageBitmap: async () => ({ width: 5000, height: 5000, close: () => { closes++ } }) }, async () => {
    await expect(imageToPng(pngHeader(1, 1))).rejects.toThrow('image limit')
  })
  await withGlobals({ document: { createElement: canvas }, createImageBitmap: async () => ({ width: 2000, height: 1000, close: () => { closes++ } }) }, async () => {
    await expect(imageToPng(pngHeader(2000, 1000))).rejects.toThrow('synthetic encoding failure')
  })
  expect(closes).toBe(2)
  expect(canvases.every((value) => value.width === 0 && value.height === 0)).toBe(true)
})

test('security: invalid crop numbers cannot fetch or decode image data', async () => {
  let fetches = 0
  await withGlobals({ fetch: () => { fetches++; throw new Error('unexpected fetch') } }, async () => {
    for (const value of [NaN, Infinity, -Infinity, -1, 2]) {
      await expect(cropImage('unused synthetic source', { x: value, y: 0, width: 1, height: 1 })).rejects.toThrow('crop bounds')
    }
  })
  expect(fetches).toBe(0)
})

test('security: multiline text dimensions reject oversized canvases and release encoding failures', async () => {
  const canvases: { width: number; height: number }[] = []
  await withGlobals({ document: { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ measureText: (value: string) => ({ width: value.length * 100, actualBoundingBoxLeft: 0, actualBoundingBoxRight: value.length * 100 }), scale: () => undefined, fillText: () => undefined }), toDataURL: () => { throw new Error('synthetic encoding failure') } }
    canvases.push(canvas)
    return canvas
  } } }, () => {
    expect(() => textLayout('x'.repeat(82))).toThrow('text dimensions')
    expect(() => textLayout('x\n'.repeat(70))).toThrow('text dimensions')
    expect(() => textToPng('safe', '#111827')).toThrow('synthetic encoding failure')
  })
  expect(canvases.every((value) => value.width === 0 && value.height === 0)).toBe(true)
})

test('security: local font names remain a quoted CSS string', () => {
  expect(pdfFontFamily('A";background:url(https://example.invalid/private);\\B')).toBe('"A\\";background:url(https://example.invalid/private);\\\\B", sans-serif')
})

test('security: retained images obey byte limits while duplicate references share their budget', () => {
  const item = { id: 'synthetic', page: 1, src: 'x'.repeat(16_000_001), x: .1, y: .1, width: .2, height: .1 }
  expect(imageBudget([item, { ...item, id: 'duplicate' }])).toBe(true)
  expect(imageBudget([item, { ...item, id: 'distinct', src: 'y'.repeat(16_000_001) }])).toBe(false)
  const original = { entries: [[item]], index: 0 }
  const pruned = appendHistory(original, [{ ...item, src: 'y'.repeat(16_000_001) }])
  expect(pruned.entries).toHaveLength(1)
  expect(original.entries[0][0].src).toBe(item.src)
})

function registerImage(document: PDFDocument, width: number, height: number, indirect = false) {
  return document.context.register(document.context.stream(new Uint8Array(), {
    Type: 'XObject', Subtype: indirect ? document.context.register(PDFName.of('Image')) : 'Image',
    Width: indirect ? document.context.register(PDFNumber.of(width)) : width,
    Height: indirect ? document.context.register(PDFNumber.of(height)) : height,
    BitsPerComponent: 8, ColorSpace: 'DeviceRGB',
  }))
}

test('security: empty PDFs fail the editor preflight before page rendering', async () => {
  const document = await PDFDocument.create()
  const bytes = await document.save({ addDefaultPage: false })
  const empty = await PDFDocument.load(bytes)
  expect(empty.getPageCount()).toBe(0)
  expect(() => assertPdfEditorResources(empty)).toThrow('empty PDF')
})

test('security: declared PDF image bombs and invalid dimensions fail without decoding', async () => {
  for (const [width, height] of [[4001, 4000], [16385, 1], [0, 100], [-1, 100], [1.5, 100]]) {
    const document = await PDFDocument.create()
    document.addPage()
    registerImage(document, width, height)
    expect(() => assertPdfEditorResources(document)).toThrow(PdfInputLimitError)
  }
  const safe = await PDFDocument.create()
  safe.addPage()
  registerImage(safe, 4000, 4000)
  expect(() => assertPdfEditorResources(safe)).not.toThrow()
})

test('security: image type and dimensions referenced indirectly cannot bypass PDF budgets', async () => {
  const safe = await PDFDocument.create()
  safe.addPage()
  registerImage(safe, 100, 100, true)
  expect(() => assertPdfEditorResources(safe)).not.toThrow()
  const unsafe = await PDFDocument.create()
  unsafe.addPage()
  registerImage(unsafe, 8000, 8000, true)
  expect(() => assertPdfEditorResources(unsafe)).toThrow(PdfInputLimitError)
})

test('security: cumulative PDF image and page budgets reject oversized documents', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage()
  const shared = registerImage(document, 4000, 4000)
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { First: shared, Second: shared } }))
  expect(() => assertPdfEditorResources(document)).not.toThrow()
  for (let index = 1; index < 15; index++) registerImage(document, 4000, 4000)
  registerImage(document, 10000, 1000)
  expect(() => assertPdfEditorResources(document)).not.toThrow()
  registerImage(document, 1, 1)
  expect(() => assertPdfEditorResources(document)).toThrow(PdfInputLimitError)
  const pages = await PDFDocument.create()
  for (let index = 0; index < 501; index++) pages.addPage()
  expect(() => assertPdfEditorResources(pages)).toThrow(PdfInputLimitError)
})
