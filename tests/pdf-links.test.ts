import { describe, expect, test } from 'bun:test'
import type { PDFPageProxy, TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'
import { PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import { addPdfPageLinks, collectPdfPageLinks, outputLinkRect, safePdfLinkUrl } from '../src/lib/fileCompatibility/pdfLinks'

const viewport = { width: 400, height: 600, transform: [1, 0, 0, -1, 0, 600] }
const context = { measureText: (text: string) => ({ width: text.length * 10 }), font: '' } as unknown as CanvasRenderingContext2D
const item = (str: string, x = 20, y = 300): TextItem => ({
  str, dir: 'ltr', width: str.length * 10, height: 12, transform: [12, 0, 0, 12, x, y], fontName: 'f1', hasEOL: true,
})
const chunk = (items: TextItem[]): TextContent => ({ items, styles: { f1: { fontFamily: 'sans-serif', ascent: 0.9, descent: -0.2, vertical: false } }, lang: null })
function source(stream: ReadableStream<TextContent>, annotations: unknown[] = []): PDFPageProxy {
  return { getViewport: () => viewport, getAnnotations: async () => annotations, streamTextContent: () => stream } as unknown as PDFPageProxy
}
function content(items: TextItem[]) {
  return new ReadableStream<TextContent>({ start(controller) { controller.enqueue(chunk(items)); controller.close() } })
}

describe('PDF link safety and coordinates', () => {
  test('serializes URI bytes without allowing PDF action injection or losing literal characters', async () => {
    const urls = [
      'https://example.org/x)/S/JavaScript/JS(app.alert(1))/Ignore(',
      'https://example.org/unmatched)',
      'mailto:help@example.org?subject=literal\\name',
      'https://example.org/\u00e1rea',
    ].map((url) => safePdfLinkUrl(url)!)
    for (const useObjectStreams of [false, true]) {
      const document = await PDFDocument.create()
      const page = document.addPage()
      addPdfPageLinks(page, urls.map((url) => ({ url, rect: [10, 10, 100, 30] })))
      const reopened = await PDFDocument.load(await document.save({ useObjectStreams }))
      const annotations = reopened.getPage(0).node.Annots()!
      expect(annotations.size()).toBe(urls.length)
      urls.forEach((url, index) => {
        const annotation = reopened.context.lookup(annotations.get(index), PDFDict)
        const action = annotation.lookup(PDFName.of('A'), PDFDict)
        expect(action.lookup(PDFName.of('S'), PDFName).asString()).toBe('/URI')
        expect(action.has(PDFName.of('JS'))).toBe(false)
        expect(action.lookup(PDFName.of('URI'), PDFHexString).decodeText()).toBe(url)
      })
    }
  })

  test('allows only deliberate passive URI schemes and canonicalizes www', () => {
    expect(safePdfLinkUrl('www.example.org/path')).toBe('http://www.example.org/path')
    for (const url of ['https://example.org/path', 'http://example.org/', 'mailto:help@example.org', 'tel:+123456789']) expect(safePdfLinkUrl(url)).toBe(url)
    for (const url of [null, {}, '', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://example.org/', '//example.org', 'https://example.org/\nnext', 'https://example.org/a b', 'https://' + 'a'.repeat(2048)]) expect(safePdfLinkUrl(url)).toBeNull()
  })

  test('clips links to page bounds and rejects invalid or empty rectangles', () => {
    expect(outputLinkRect([-10, -20, 40, 50], viewport)).toEqual([0, 0, 40, 50])
    expect(outputLinkRect([40, 50, 10, 20], viewport)).toEqual([10, 20, 40, 50])
    for (const rect of [null, [1, 2], [0, 0, Infinity, 50], [0, 0, NaN, 2], [0, 0, 0, 10], [500, 0, 600, 20]]) expect(outputLinkRect(rect, viewport)).toBeNull()
  })

  test('rotates and scales cropped page coordinates into the output page', () => {
    expect(outputLinkRect([50, 100, 100, 120], { width: 810, height: 570, transform: [0, 1.5, 1.5, 0, -45, -30] })).toEqual([105, 450, 135, 525])
  })
})

describe('PDF link extraction lifecycle', () => {
  test('recognizes a bare academic domain without turning email addresses or decimals into links', async () => {
    const links = await collectPdfPageLinks(source(content([
      item('portal.example.edu.do', 20, 400),
      item('support@example.org', 20, 350),
      item('123.456 12.34 1.2.3', 20, 300),
    ])), context)
    expect(links.map((link) => link.url)).toEqual(['https://portal.example.edu.do/'])
  })

  test('explicit destination wins over its URL label and hidden or unsafe annotations are dropped', async () => {
    const links = await collectPdfPageLinks(source(content([item('https://example.org/label')]), [
      { annotationType: 2, url: 'https://example.org/destination', rect: [20, 297, 270, 312] },
      { annotationType: 2, url: 'javascript:alert(1)', rect: [20, 350, 100, 370] },
      { annotationType: 2, url: 'https://example.org/hidden', rect: [20, 350, 100, 370], annotationFlags: 2 },
    ]), context)
    expect(links.map((link) => link.url)).toEqual(['https://example.org/destination'])
  })

  test('joins adjacent text fragments across stream chunks and strips sentence punctuation', async () => {
    const first = item('https://example.', 20)
    first.hasEOL = false
    const second = item('org/path).', 20 + first.width)
    const stream = new ReadableStream<TextContent>({ start(controller) { controller.enqueue(chunk([first])); controller.enqueue(chunk([second])); controller.close() } })
    const links = await collectPdfPageLinks(source(stream), context)
    expect(links).toHaveLength(2)
    expect(links.map((link) => link.url)).toEqual(['https://example.org/path', 'https://example.org/path'])
    expect(stream.locked).toBe(false)
  })

  test('cancels a pending text read and releases its reader on abort', async () => {
    let cancelled = false
    const stream = new ReadableStream<TextContent>({ cancel() { cancelled = true } })
    const controller = new AbortController()
    const pending = collectPdfPageLinks(source(stream), context, controller.signal)
    await Promise.resolve()
    controller.abort()
    await expect(pending).rejects.toThrow()
    expect(cancelled).toBe(true)
    expect(stream.locked).toBe(false)
  })

  test('rejects oversized text and cancels the stream before retaining further chunks', async () => {
    let cancelled = false
    const stream = new ReadableStream<TextContent>({ start(controller) { controller.enqueue(chunk([item('a'.repeat(2_000_001))])) }, cancel() { cancelled = true } })
    await expect(collectPdfPageLinks(source(stream), context)).rejects.toThrow('PDF_LINK_LIMIT')
    expect(cancelled).toBe(true)
    expect(stream.locked).toBe(false)
  })

  test('rejects too many annotations before starting text extraction', async () => {
    const stream = content([])
    await expect(collectPdfPageLinks(source(stream, Array.from({ length: 1001 }, () => ({}))), context)).rejects.toThrow('PDF_LINK_LIMIT')
    expect(stream.locked).toBe(false)
  })
})
