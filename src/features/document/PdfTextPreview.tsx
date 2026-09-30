import { textLayout, type PdfOverlay } from './lib/pdfEditor'
import { pdfFontFamily } from './lib/pdfFonts'

export function PdfTextPreview({ item }: { item: PdfOverlay }) {
  const layout = useMemo(() => textLayout(item.text ?? '', item.textFont, { textBold: item.textBold, textItalic: item.textItalic }), [item.text, item.textFont, item.textBold, item.textItalic])
  return <svg className="pdf-editor-text-preview" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="none" aria-hidden="true" style={{ fontFamily: pdfFontFamily(item.textFont ?? 'sans-serif'), fontWeight: item.textBold ? 700 : 400, fontStyle: item.textItalic ? 'italic' : 'normal' }}>
    {layout.lines.map((line, index) => <text key={index} fill={item.textColor ?? '#111827'} fontSize="96" x={item.textAlign === 'center' ? (layout.width - layout.widths[index]) / 2 : item.textAlign === 'right' ? layout.width - 8 - layout.widths[index] : 8} y={8 + 96 + index * 120}>{line}</text>)}
  </svg>
}
import { useMemo } from 'react'
