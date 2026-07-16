import DOMPurify from 'dompurify'
import { marked } from 'marked'

export const MARKDOWN_MAX_SIZE = 5 * 1024 * 1024

interface MarkdownStats {
  characters: number
  words: number
  lines: number
  headings: number
}

type ExportBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[]; ordered: boolean }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'rule' }

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

export function isSupportedMarkdown(file: File) {
  const lowerName = file.name.toLowerCase()
  return lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || file.type === 'text/markdown'
}

export function getMarkdownBaseName(fileName: string) {
  return fileName.replace(/\.(md|markdown)$/i, '') || 'documento-markdown'
}

export function getMarkdownStats(source: string): MarkdownStats {
  const words = source.trim() ? source.trim().split(/\s+/).length : 0
  const headings = source.split(/\r?\n/).filter((line) => /^#{1,6}\s+/.test(line.trim())).length

  return {
    characters: source.length,
    words,
    lines: source ? source.split(/\r?\n/).length : 0,
    headings,
  }
}

export function markdownToSafeHtml(source: string) {
  const rendered = marked.parse(source, { breaks: true, gfm: true }) as string
  const sanitized = DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['style', 'srcdoc'],
  })
  const parsed = new DOMParser().parseFromString(sanitized, 'text/html')

  parsed.querySelectorAll('img').forEach((image) => {
    const replacement = document.createElement('span')
    replacement.className = 'markdown-image-placeholder'
    replacement.textContent = image.getAttribute('alt')?.trim() || 'Imagen no incluida'
    image.replaceWith(replacement)
  })
  parsed.querySelectorAll('a').forEach((link) => {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  })

  return parsed.body.innerHTML
}

function extractBlocks(html: string): ExportBlock[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const blocks: ExportBlock[] = []

  const visit = (element: Element) => {
    const tag = element.tagName.toLowerCase()
    const text = normalizeText(element.textContent)

    if (/^h[1-6]$/.test(tag) && text) {
      blocks.push({ kind: 'heading', level: Number(tag.slice(1)), text })
      return
    }
    if (tag === 'p' && text) {
      blocks.push({ kind: 'paragraph', text })
      return
    }
    if (tag === 'pre') {
      blocks.push({ kind: 'code', text: element.textContent?.replace(/^\n|\n$/g, '') ?? '' })
      return
    }
    if (tag === 'blockquote' && text) {
      blocks.push({ kind: 'quote', text })
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(element.children)
        .filter((child) => child.tagName.toLowerCase() === 'li')
        .map((child) => normalizeText(child.textContent))
        .filter(Boolean)
      if (items.length) {
        blocks.push({ kind: 'list', items, ordered: tag === 'ol' })
      }
      return
    }
    if (tag === 'table') {
      const rows = Array.from(element.querySelectorAll('tr'))
        .map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => normalizeText(cell.textContent)))
        .filter((row) => row.length > 0)
      if (rows.length) {
        blocks.push({ kind: 'table', rows })
      }
      return
    }
    if (tag === 'hr') {
      blocks.push({ kind: 'rule' })
      return
    }

    Array.from(element.children).forEach(visit)
  }

  Array.from(parsed.body.children).forEach(visit)
  return blocks
}

export async function exportMarkdownToPdf(html: string, title: string) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const blocks = extractBlocks(html)
  const margin = 18
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - margin * 2
  let y = 20

  pdf.setProperties({ title, creator: 'Naroz', subject: 'Documento convertido desde Markdown' })

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 18) {
      return
    }
    pdf.addPage()
    y = 20
  }

  const drawText = (
    text: string,
    options: { size?: number; style?: 'normal' | 'bold' | 'italic'; font?: 'helvetica' | 'courier'; indent?: number; color?: [number, number, number] } = {},
  ) => {
    const size = options.size ?? 11
    const indent = options.indent ?? 0
    pdf.setFont(options.font ?? 'helvetica', options.style ?? 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(...(options.color ?? [31, 41, 55]))
    const lines = [...(pdf.splitTextToSize(text || ' ', contentWidth - indent) as string[])]
    const lineHeight = size * 0.42

    while (lines.length) {
      const availableHeight = pageHeight - 18 - y
      const linesPerPage = Math.max(1, Math.floor((availableHeight - 3) / lineHeight))

      if (availableHeight < lineHeight + 3) {
        pdf.addPage()
        y = 20
        continue
      }

      const pageLines = lines.splice(0, linesPerPage)
      pdf.text(pageLines, margin + indent, y)
      y += pageLines.length * lineHeight + 3

      if (lines.length) {
        pdf.addPage()
        y = 20
      }
    }
  }

  blocks.forEach((block) => {
    if (block.kind === 'heading') {
      const sizes = [0, 24, 20, 17, 14, 12, 11]
      y += block.level === 1 ? 3 : 1
      drawText(block.text, { size: sizes[block.level] ?? 11, style: 'bold', color: [15, 23, 42] })
      return
    }
    if (block.kind === 'paragraph') {
      drawText(block.text)
      return
    }
    if (block.kind === 'quote') {
      drawText('|  ' + block.text, { style: 'italic', indent: 3, color: [71, 85, 105] })
      return
    }
    if (block.kind === 'list') {
      block.items.forEach((item, index) => drawText((block.ordered ? (index + 1) + '.' : '-') + ' ' + item, { indent: 4 }))
      y += 1
      return
    }
    if (block.kind === 'code') {
      const lines = block.text
        .split(/\r?\n/)
        .flatMap((line) => pdf.splitTextToSize(line || ' ', contentWidth - 8) as string[])

      while (lines.length) {
        if (pageHeight - 18 - y < 12) {
          pdf.addPage()
          y = 20
        }

        const linesPerPage = Math.max(1, Math.floor((pageHeight - 18 - y - 6) / 4.2))
        const pageLines = lines.splice(0, linesPerPage)
        const height = Math.max(10, pageLines.length * 4.2 + 6)
        pdf.setFillColor(245, 247, 250)
        pdf.roundedRect(margin, y - 4, contentWidth, height, 2, 2, 'F')
        pdf.setFont('courier', 'normal')
        pdf.setFontSize(9)
        pdf.setTextColor(30, 41, 59)
        pdf.text(pageLines, margin + 4, y)
        y += height + 2

        if (lines.length) {
          pdf.addPage()
          y = 20
        }
      }
      return
    }
    if (block.kind === 'table') {
      block.rows.forEach((row, index) => drawText(row.join('  |  '), { size: 9, style: index === 0 ? 'bold' : 'normal', indent: 2 }))
      y += 1
      return
    }

    ensureSpace(6)
    pdf.setDrawColor(203, 213, 225)
    pdf.line(margin, y, pageWidth - margin, y)
    y += 6
  })

  const pageCount = pdf.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(148, 163, 184)
    pdf.text(page + ' / ' + pageCount, pageWidth - margin, pageHeight - 9, { align: 'right' })
  }

  return pdf.output('blob')
}

export async function exportMarkdownToDocx(html: string, title: string) {
  const {
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx')
  const blocks = extractBlocks(html)
  type DocChild = InstanceType<typeof Paragraph> | InstanceType<typeof Table>
  const children: DocChild[] = []
  const headingLevels = [
    HeadingLevel.TITLE,
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ]

  blocks.forEach((block) => {
    if (block.kind === 'heading') {
      children.push(new Paragraph({ text: block.text, heading: headingLevels[block.level] ?? HeadingLevel.HEADING_6, spacing: { before: 180, after: 100 } }))
      return
    }
    if (block.kind === 'paragraph') {
      children.push(new Paragraph({ text: block.text, spacing: { after: 140 }, style: 'Normal' }))
      return
    }
    if (block.kind === 'quote') {
      children.push(new Paragraph({
        children: [new TextRun({ text: block.text, italics: true, color: '475569' })],
        indent: { left: 480 },
        border: { left: { color: '94A3B8', size: 12, style: BorderStyle.SINGLE } },
        spacing: { after: 140 },
      }))
      return
    }
    if (block.kind === 'list') {
      block.items.forEach((item, index) => {
        const prefix = block.ordered ? (index + 1) + '.' : '-'
        children.push(new Paragraph({ text: prefix + ' ' + item, indent: { left: 360, hanging: 180 }, spacing: { after: 60 } }))
      })
      return
    }
    if (block.kind === 'code') {
      const codeRuns = block.text.split(/\r?\n/).map((line, index) => new TextRun({ text: line || ' ', break: index ? 1 : 0, font: 'Consolas', size: 19 }))
      children.push(new Paragraph({
        children: codeRuns,
        shading: { fill: 'F3F4F6', type: ShadingType.CLEAR },
        spacing: { before: 80, after: 160 },
        indent: { left: 240, right: 240 },
      }))
      return
    }
    if (block.kind === 'table') {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: block.rows.map((row, rowIndex) => new TableRow({
          children: row.map((cell) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: cell, bold: rowIndex === 0 })] })],
            shading: rowIndex === 0 ? { fill: 'EEF2FF', type: ShadingType.CLEAR } : undefined,
          })),
        })),
      }))
      children.push(new Paragraph({ text: '' }))
      return
    }

    children.push(new Paragraph({
      border: { bottom: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE } },
      spacing: { before: 100, after: 140 },
    }))
  })

  const document = new Document({
    creator: 'Naroz',
    title,
    description: 'Documento convertido desde Markdown',
    styles: {
      default: {
        document: {
          run: { font: 'Aptos', size: 22, color: '1F2937' },
          paragraph: { spacing: { line: 300 } },
        },
      },
    },
    sections: [{ properties: {}, children }],
  })

  return Packer.toBlob(document)
}
