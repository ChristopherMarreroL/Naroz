import html2canvas from 'html2canvas'
import PostalMime, { type Email as ParsedEmlEmail } from 'postal-mime'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface ParsedMsgRecipient {
  name?: string
  email?: string
  recipType?: string
}

export interface ParsedMsgAttachment {
  fileName?: string
  contentId?: string
  mimeType?: string
  content?: ArrayBuffer | Uint8Array | string
}

export interface ParsedMsgData {
  subject: string
  senderName: string
  senderEmail: string
  sentAt: string
  recipients: ParsedMsgRecipient[]
  body: string
  bodyHtml: string
  attachments: ParsedMsgAttachment[]
}

type MsgReaderConstructor = new (arrayBuffer: ArrayBuffer | DataView) => {
  parserConfig?: { ansiEncoding?: string }
  getFileData: () => unknown
}

interface MsgReaderRawData {
  error?: unknown
  subject?: unknown
  senderName?: unknown
  senderEmail?: unknown
  creatorSMTPAddress?: unknown
  messageDeliveryTime?: unknown
  clientSubmitTime?: unknown
  creationTime?: unknown
  recipients?: unknown
  body?: unknown
  bodyHtml?: unknown
  html?: unknown
  attachments?: unknown
}

function normalizeBody(body: string) {
  return body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function decodeHtmlBytes(value: unknown) {
  if (!(value instanceof Uint8Array)) {
    return ''
  }

  try {
    const utf8 = new TextDecoder('utf-8').decode(value)
    if (!utf8.includes('\uFFFD')) {
      return utf8
    }
  } catch {
    // Fallback below.
  }

  try {
    return new TextDecoder('windows-1252').decode(value)
  } catch {
    return new TextDecoder().decode(value)
  }
}

function decodeEntities(text: string) {
  if (typeof document === 'undefined') {
    return text
  }

  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

function htmlToText(html: string) {
  if (!html.trim()) {
    return ''
  }

  const normalized = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' ')
    .replace(/<th[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

  return decodeEntities(normalized)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractHtmlBody(data: MsgReaderRawData) {
  const bodyHtml = typeof data.bodyHtml === 'string' ? data.bodyHtml : ''
  const htmlBytes = decodeHtmlBytes(data.html)
  return (bodyHtml || htmlBytes).trim()
}

function extractReadableBody(data: MsgReaderRawData) {
  const plainBody = typeof data.body === 'string' ? normalizeBody(decodeEntities(data.body)) : ''
  if (plainBody && !plainBody.includes('\uFFFD')) {
    return plainBody
  }

  return normalizeBody(htmlToText(extractHtmlBody(data)))
}

async function getMsgReaderConstructor(): Promise<MsgReaderConstructor> {
  const module = await import('@kenjiuno/msgreader')
  const candidate = ((module.default as unknown as { default?: unknown })?.default ?? module.default) as unknown

  if (typeof candidate !== 'function') {
    throw new Error('MSG_READER_UNAVAILABLE')
  }

  return candidate as MsgReaderConstructor
}

function arrayBufferToDataUrl(content: ArrayBuffer | Uint8Array | string, mimeType = 'application/octet-stream') {
  if (typeof content === 'string') {
    return `data:${mimeType};base64,${content}`
  }

  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

function replaceInlineCidSources(html: string, attachments: ParsedMsgAttachment[]) {
  if (!html.trim()) {
    return ''
  }

  const cidMap = new Map<string, string>()
  for (const attachment of attachments) {
    if (!attachment.contentId || !attachment.content) {
      continue
    }

    const normalizedCid = attachment.contentId.replace(/^<|>$/g, '')
    cidMap.set(normalizedCid, arrayBufferToDataUrl(attachment.content, attachment.mimeType || 'application/octet-stream'))
  }

  return html.replace(/src=["']cid:([^"']+)["']/gi, (fullMatch, cid) => {
    const replacement = cidMap.get(String(cid).replace(/^<|>$/g, ''))
    return replacement ? `src="${replacement}"` : fullMatch
  })
}

function flattenPostalAddresses(addresses: ParsedEmlEmail['to'] | ParsedEmlEmail['cc'] | ParsedEmlEmail['from']) {
  if (!addresses) {
    return []
  }

  const list = Array.isArray(addresses) ? addresses : [addresses]
  return list.flatMap((entry) => {
    if ('group' in entry && Array.isArray(entry.group)) {
      return entry.group.map((mailbox) => ({ name: mailbox.name, email: mailbox.address }))
    }

    return [{ name: entry.name, email: entry.address }]
  })
}

async function parseEmlFile(file: File): Promise<ParsedMsgData> {
  const raw = await file.text()
  const email = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' })

  const attachments: ParsedMsgAttachment[] = email.attachments.map((attachment) => ({
    fileName: attachment.filename || undefined,
    contentId: attachment.contentId || undefined,
    mimeType: attachment.mimeType || undefined,
    content: typeof attachment.content === 'string' ? attachment.content : attachment.content,
  }))

  const recipients = [
    ...flattenPostalAddresses(email.to).map((recipient) => ({ ...recipient, recipType: 'to' })),
    ...flattenPostalAddresses(email.cc).map((recipient) => ({ ...recipient, recipType: 'cc' })),
  ]

  const from = flattenPostalAddresses(email.from)[0]
  const html = replaceInlineCidSources(email.html || '', attachments)
  const text = normalizeBody(email.text || htmlToText(html))

  return {
    subject: decodeEntities(email.subject || '(No subject)'),
    senderName: decodeEntities(from?.name || ''),
    senderEmail: decodeEntities(from?.email || ''),
    sentAt: email.date || '',
    recipients,
    body: text,
    bodyHtml: html,
    attachments,
  }
}

export async function parseMailFile(file: File): Promise<ParsedMsgData> {
  if (file.name.toLowerCase().endsWith('.eml') || file.type === 'message/rfc822') {
    return parseEmlFile(file)
  }

  const buffer = await file.arrayBuffer()
  const MsgReader = await getMsgReaderConstructor()
  const reader = new MsgReader(buffer)
  reader.parserConfig = { ansiEncoding: 'windows-1252' }
  const data = reader.getFileData() as MsgReaderRawData

  if (data.error) {
    throw new Error(String(data.error))
  }

  return {
    subject: typeof data.subject === 'string' ? decodeEntities(data.subject) : '(No subject)',
    senderName: typeof data.senderName === 'string' ? decodeEntities(data.senderName) : '',
    senderEmail: typeof data.senderEmail === 'string' ? decodeEntities(data.senderEmail) : typeof data.creatorSMTPAddress === 'string' ? decodeEntities(data.creatorSMTPAddress) : '',
    sentAt:
      typeof data.messageDeliveryTime === 'string'
        ? data.messageDeliveryTime
        : typeof data.clientSubmitTime === 'string'
          ? data.clientSubmitTime
          : typeof data.creationTime === 'string'
            ? data.creationTime
            : '',
    recipients: Array.isArray(data.recipients) ? (data.recipients as ParsedMsgRecipient[]) : [],
    body: extractReadableBody(data),
    bodyHtml: extractHtmlBody(data),
    attachments: Array.isArray(data.attachments) ? (data.attachments as ParsedMsgAttachment[]) : [],
  }
}

function canvasToPngDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/png')
}

async function waitForImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll('img'))
  if (images.length === 0) {
    return
  }

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve()
            return
          }

          const finish = () => {
            image.removeEventListener('load', finish)
            image.removeEventListener('error', finish)
            resolve()
          }

          image.addEventListener('load', finish, { once: true })
          image.addEventListener('error', finish, { once: true })
        }),
    ),
  )
}

function normalizeSearchableText(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\uFFFD/g, '')
}

function wrapPlainText(text: string, maxChars: number) {
  return text
    .split('\n')
    .flatMap((paragraph) => {
      if (!paragraph.trim()) {
        return ['']
      }

      const words = paragraph.split(/\s+/).filter(Boolean)
      const lines: string[] = []
      let current = ''

      for (const word of words) {
        const safeWord = normalizeSearchableText(word)
        const candidate = current ? `${current} ${safeWord}` : safeWord
        if (candidate.length <= maxChars) {
          current = candidate
          continue
        }

        if (current) {
          lines.push(current)
        }

        current = safeWord
      }

      if (current) {
        lines.push(current)
      }

      return lines
    })
}

function buildSearchableTranscript(msg: ParsedMsgData) {
  const recipients = msg.recipients
    .map((recipient) => recipient.email || recipient.name || '')
    .filter(Boolean)
    .join(', ')

  const attachments = msg.attachments
    .map((attachment) => attachment.fileName || '')
    .filter(Boolean)
    .join(', ')

  return [
    `Subject: ${normalizeSearchableText(msg.subject)}`,
    `From: ${normalizeSearchableText(msg.senderName || msg.senderEmail)}`,
    `Date: ${normalizeSearchableText(msg.sentAt)}`,
    recipients ? `Recipients: ${normalizeSearchableText(recipients)}` : '',
    attachments ? `Attachments: ${normalizeSearchableText(attachments)}` : '',
    '',
    normalizeSearchableText(msg.body || ''),
  ]
    .filter((line, index, all) => line || (index > 0 && all[index - 1]))
    .join('\n')
}

export async function buildMsgPdfFromElement(element: HTMLElement, msg: ParsedMsgData) {
  await waitForImages(element)

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    onclone: (documentClone) => {
      const cloneElement = documentClone.getElementById(element.id)
      if (cloneElement) {
        cloneElement.querySelectorAll('*').forEach((node) => {
          if (!(node instanceof HTMLElement)) {
            return
          }

          node.style.color = node.style.color || '#1f2937'
          node.style.backgroundColor = node.style.backgroundColor === 'transparent' ? 'transparent' : node.style.backgroundColor || 'transparent'
          node.style.borderColor = node.style.borderColor || '#cbd5e1'
          node.style.boxShadow = 'none'
          node.style.textShadow = 'none'
        })
      }
    },
  })

  const pdf = await PDFDocument.create()
  const pageWidth = 595
  const pageHeight = 842
  const margin = 24
  const usableWidth = pageWidth - margin * 2
  const usableHeight = pageHeight - margin * 2
  const pageSliceHeight = Math.floor((usableHeight / usableWidth) * canvas.width)

  let offsetY = 0

  while (offsetY < canvas.height) {
    const sliceHeight = Math.min(pageSliceHeight, canvas.height - offsetY)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight
    const context = pageCanvas.getContext('2d')

    if (!context) {
      throw new Error('No se pudo preparar la pagina PDF desde la vista previa.')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, pageCanvas.width, sliceHeight)

    const image = await pdf.embedPng(canvasToPngDataUrl(pageCanvas))
    const renderedHeight = (image.height / image.width) * usableWidth
    const page = pdf.addPage([pageWidth, pageHeight])
    page.drawImage(image, {
      x: margin,
      y: pageHeight - margin - renderedHeight,
      width: usableWidth,
      height: renderedHeight,
    })

    offsetY += sliceHeight
  }

  const searchableText = buildSearchableTranscript(msg)
  if (searchableText.trim()) {
    const regularFont = await pdf.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)
    const marginX = 42
    const topMargin = 52
    const bottomMargin = 42
    const lineHeight = 16
    const maxChars = 92
    let page = pdf.addPage([pageWidth, pageHeight])
    let cursorY = pageHeight - topMargin

    const ensureSpace = (linesNeeded = 1) => {
      if (cursorY - linesNeeded * lineHeight >= bottomMargin) {
        return
      }

      page = pdf.addPage([pageWidth, pageHeight])
      cursorY = pageHeight - topMargin
    }

    page.drawText('Extracted text copy', {
      x: marginX,
      y: cursorY,
      size: 16,
      font: boldFont,
      color: rgb(0.1, 0.14, 0.2),
    })
    cursorY -= 28

    for (const line of wrapPlainText(searchableText, maxChars)) {
      ensureSpace()
      page.drawText(line || ' ', {
        x: marginX,
        y: cursorY,
        size: 10.5,
        font: regularFont,
        color: rgb(0.16, 0.18, 0.24),
      })
      cursorY -= lineHeight
    }
  }

  const bytes = await pdf.save()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'application/pdf' })
}
