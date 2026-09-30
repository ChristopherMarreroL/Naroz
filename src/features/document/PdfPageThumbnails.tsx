import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useLocale } from '../../i18n/LocaleProvider'
import { beginPdfPreview } from './lib/pdfPreview'

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
    const preview = beginPdfPreview(pdf, page, canvas, 160)
    void preview.promise.catch(() => undefined)
    return () => preview.cancel()
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
