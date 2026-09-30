import type { PDFDocumentProxy } from 'pdfjs-dist'

/** Retain the rendered pixels, but release PDF.js resources as soon as the render settles. */
export function beginPdfPreview(pdf: PDFDocumentProxy, page: number, canvas: HTMLCanvasElement, maxEdge: number, maxScale = Infinity) {
  let active = true
  let source: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined
  let render: ReturnType<NonNullable<typeof source>['render']> | undefined
  const clear = () => { canvas.width = canvas.height = 0 }
  const promise = (async () => {
    try {
      source = await pdf.getPage(page)
      if (!active) return null
      const base = source.getViewport({ scale: 1 })
      if (![base.width, base.height].every((size) => Number.isFinite(size) && size > 0)) throw new Error('page dimensions')
      const viewport = source.getViewport({ scale: Math.min(maxScale, maxEdge / Math.max(base.width, base.height)) })
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      render = source.render({ canvas, viewport })
      await render.promise
      return active ? base.width / base.height : null
    } catch (error) {
      if (!active) return null
      clear()
      throw error
    } finally {
      try { source?.cleanup() }
      finally { render = undefined; source = undefined }
    }
  })()
  return { promise, cancel: () => { active = false; render?.cancel(); clear() } }
}
