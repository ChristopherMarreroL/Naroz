import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useLocale } from '../../i18n/LocaleProvider'

function Thumbnail({ pdf, page }: { pdf: PDFDocumentProxy; page: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { root: canvasRef.current?.closest('.pdf-editor-thumbnails'), rootMargin: '120px' })
    observer.observe(canvasRef.current!)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current!
    if (!visible) { canvas.width = canvas.height = 0; return }
    let active = true
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    let sourcePage: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined
    void pdf.getPage(page).then(async (source) => {
      sourcePage = source
      if (!active) { source.cleanup(); return }
      const base = source.getViewport({ scale: 1 })
      const viewport = source.getViewport({ scale: 160 / Math.max(base.width, base.height) })
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      render = source.render({ canvas, viewport })
      await render.promise
    }).catch(() => undefined)
    return () => { active = false; render?.cancel(); if (render) void render.promise.catch(() => undefined).finally(() => sourcePage?.cleanup()); else sourcePage?.cleanup(); canvas.width = canvas.height = 0 }
  }, [pdf, page, visible])
  return <canvas ref={canvasRef} aria-hidden="true" />
}

export function PdfPageThumbnails({ pdf, page, disabled, onSelect }: { pdf: PDFDocumentProxy; page: number; disabled: boolean; onSelect: (page: number) => void }) {
  const { t } = useLocale()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [page])
  return <div ref={ref} className="pdf-editor-thumbnails" role="navigation" aria-label={t('pdfEditPages')}>
    {Array.from({ length: pdf.numPages }, (_, index) => <button key={index} disabled={disabled} aria-label={`${t('pdfEditPage')} ${index + 1}`} aria-current={page === index + 1 ? 'page' : undefined} onClick={() => onSelect(index + 1)}>
      <Thumbnail pdf={pdf} page={index + 1} /><span>{index + 1}</span>
    </button>)}
  </div>
}
