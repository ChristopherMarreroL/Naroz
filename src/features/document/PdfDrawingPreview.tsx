import { useId } from 'react'
import type { PdfOverlay } from './lib/pdfEditor'

/** A shared SVG path masks each stroke in its own rotated coordinates, without decoding new bitmaps. */
export function PdfDrawingPreview({ item, ratio, eraserPathId }: { item: PdfOverlay; ratio: number; eraserPathId?: string }) {
  const id = useId()
  const width = item.width * 900, height = item.height * 900 / ratio
  const cx = (item.x + item.width / 2) * 900, cy = (item.y + item.height / 2) * 900 / ratio
  const angle = (item.rotation ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
  const transform = `matrix(${cos} ${-sin} ${sin} ${cos} ${width / 2 - cos * cx - sin * cy} ${height / 2 + sin * cx - cos * cy})`
  return <svg className="pdf-editor-stroke-preview" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    {eraserPathId && <defs><mask id={id} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: 'luminance' }}>
      <rect width={width} height={height} fill="white" />
      <use href={`#${eraserPathId}`} transform={transform} />
    </mask></defs>}
    <image data-pdf-drawing-source href={item.src} x="0" y="0" width={width} height={height} preserveAspectRatio="none" mask={eraserPathId ? `url(#${id})` : undefined} />
  </svg>
}
