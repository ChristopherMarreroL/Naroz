import { describe, expect, test } from 'bun:test'
import createDOMPurify from 'dompurify'
import { Document, Packer, Paragraph } from 'docx'
import DocxMerger from 'docx-merger'
import { JSDOM } from 'jsdom'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

import {
  isAllowedMailImageSource,
  isSafeMailImageSource,
  MAIL_HTML_FORBIDDEN_ATTRIBUTES,
} from '../src/features/document/lib/mailHtmlPolicy'
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  assertSafeImageFile,
  validateImageDimensions,
} from '../src/features/image/lib/imageLimits'
import {
  VIDEO_MAX_FILE_SIZE,
  VIDEO_MERGE_MAX_FILES,
  VIDEO_MERGE_MAX_TOTAL_SIZE,
  validateVideoMergeSelection,
} from '../src/features/video/limits'
import {
  assertSafeOfficeArchive,
  loadSafeOfficeArchive,
  OFFICE_ARCHIVE_CANCELLED,
  readOfficeArchiveEntryText,
} from '../src/features/document/lib/officeArchiveLimits'
import { sanitizeMailHtml } from '../src/features/document/lib/mailHtmlSanitizer'
import { assertSafeMailComplexity, parseMailFile, type ParsedMsgData } from '../src/features/document/lib/msgToPdf'
import {
  assertOfficePdfPageCount,
  assertOfficePdfRasterBudget,
  OFFICE_TO_PDF_MAX_PAGE_DIMENSION,
  OFFICE_TO_PDF_MAX_PAGES,
} from '../src/features/document/lib/officeToPdf'
import { assertPdfMergePageBudget, PDF_MERGE_MAX_PAGES } from '../src/features/document/hooks/usePdfMerger'
import { generateCancellableZipBlob, ZIP_GENERATION_CANCELLED } from '../src/features/document/lib/zipGeneration'
import { EXCEL_MAX_ROWS, readExcelFile } from '../src/features/excel/lib/excelColumnBuilder'
import { limitExcelRange } from '../src/features/excel/lib/excelLimits'
import { validateBatchLimits } from '../src/lib/batchLimits'

describe('mail HTML policy', () => {
  test('only permits embedded image data URLs', () => {
    expect(isAllowedMailImageSource(' data:image/png;base64,AAAA')).toBe(true)
    expect(isAllowedMailImageSource('https://tracker.example/pixel.png')).toBe(false)
    expect(isAllowedMailImageSource('javascript:alert(1)')).toBe(false)
    expect(isAllowedMailImageSource('data:image/svg+xml,<svg onload="alert(1)"/>')).toBe(false)
    expect(isAllowedMailImageSource(null)).toBe(false)

    const oversizedPngHeader = new Uint8Array(24)
    oversizedPngHeader.set([0x89, 0x50, 0x4e, 0x47])
    const view = new DataView(oversizedPngHeader.buffer)
    view.setUint32(16, 50_000)
    view.setUint32(20, 50_000)
    const encoded = btoa(String.fromCharCode(...oversizedPngHeader))
    expect(isSafeMailImageSource(`data:image/png;base64,${encoded}`)).toBe(false)
  })

  test('forbids attributes that can conceal remote requests or navigation', () => {
    expect(MAIL_HTML_FORBIDDEN_ATTRIBUTES).toEqual(expect.arrayContaining([
      'href', 'srcset', 'style', 'background', 'poster', 'formaction',
    ]))
  })

  test('sanitizes hostile HTML with the production DOMPurify policy', () => {
    const { window } = new JSDOM('')
    const purifier = createDOMPurify(window as never)
    const hostileHtml = [
      '<script>alert(1)</script>',
      '<svg><a href="https://evil.example">bad</a></svg>',
      '<a href="https://phishing.example" target="_blank">click</a>',
      '<img src="https://tracker.example/pixel.png" srcset="https://tracker.example/2x.png 2x" onerror="alert(1)">',
      '<div style="background:url(https://tracker.example/bg.png)">styled</div>',
      '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB">',
    ].join('')

    const sanitized = sanitizeMailHtml(hostileHtml, {
      sanitize: (html, config) => purifier.sanitize(html, config),
      parse: (html) => new window.DOMParser().parseFromString(html, 'text/html') as unknown as Document,
    })

    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('<svg')
    expect(sanitized).not.toContain('href=')
    expect(sanitized).not.toContain('srcset=')
    expect(sanitized).not.toContain('style=')
    expect(sanitized).not.toContain('onerror=')
    expect(sanitized).not.toContain('tracker.example')
    expect(sanitized).toContain('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')
  })
})

describe('batch limits', () => {
  const file = (size: number) => ({ size })

  test('rejects excessive file counts and total size', () => {
    const limits = { maxFiles: 2, maxTotalSize: 100 }
    expect(validateBatchLimits([file(10)], [file(20)], limits)).toBeNull()
    expect(validateBatchLimits([file(10), file(20)], [file(1)], limits)).toBe('TOO_MANY_FILES')
    expect(validateBatchLimits([file(60)], [file(41)], limits)).toBe('TOTAL_TOO_LARGE')
  })
})

describe('PDF page budgets', () => {
  test('rejects a merge that exceeds the global page limit', () => {
    expect(() => assertPdfMergePageBudget(PDF_MERGE_MAX_PAGES - 1, 1)).not.toThrow()
    expect(() => assertPdfMergePageBudget(PDF_MERGE_MAX_PAGES, 1)).toThrow('PDF_TOO_MANY_PAGES')
  })
})

describe('image limits', () => {
  test('accepts ordinary images and rejects invalid or oversized canvases', () => {
    expect(validateImageDimensions(4_000, 3_000)).toBeNull()
    expect(validateImageDimensions(0, 100)).toBe('INVALID_IMAGE_DIMENSIONS')
    expect(validateImageDimensions(MAX_IMAGE_DIMENSION + 1, 1)).toBe('IMAGE_DIMENSIONS_TOO_LARGE')
    expect(validateImageDimensions(MAX_IMAGE_PIXELS, 2)).toBe('IMAGE_DIMENSIONS_TOO_LARGE')
  })

  test('rejects oversized image headers before browser decoding', async () => {
    const pngHeader = new Uint8Array(24)
    pngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const view = new DataView(pngHeader.buffer)
    view.setUint32(12, 13)
    pngHeader.set([0x49, 0x48, 0x44, 0x52], 12)
    view.setUint32(16, MAX_IMAGE_DIMENSION + 1)
    view.setUint32(20, 1)

    await expect(assertSafeImageFile(new File([pngHeader], 'oversized.png', { type: 'image/png' })))
      .rejects.toThrow('IMAGE_DIMENSIONS_TOO_LARGE')
  })

  test('requires a real AVIF BMFF structure before accepting ispe dimensions', async () => {
    const writeAscii = (target: Uint8Array, offset: number, value: string) => {
      target.set(Array.from(value, (character) => character.charCodeAt(0)), offset)
    }
    const concat = (...parts: Uint8Array[]) => {
      const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
      let offset = 0
      parts.forEach((part) => {
        result.set(part, offset)
        offset += part.length
      })
      return result
    }
    const box = (type: string, payload: Uint8Array) => {
      const result = new Uint8Array(8 + payload.length)
      new DataView(result.buffer).setUint32(0, result.length)
      writeAscii(result, 4, type)
      result.set(payload, 8)
      return result
    }

    const fakeIspe = new Uint8Array(16)
    writeAscii(fakeIspe, 0, 'ispe')
    new DataView(fakeIspe.buffer).setUint32(8, 100)
    new DataView(fakeIspe.buffer).setUint32(12, 100)
    await expect(assertSafeImageFile(new File([fakeIspe], 'fake.avif', { type: 'image/avif' })))
      .rejects.toThrow('IMAGE_DIMENSIONS_UNAVAILABLE')

    const ftypPayload = new Uint8Array(16)
    writeAscii(ftypPayload, 0, 'avif')
    writeAscii(ftypPayload, 8, 'mif1')
    writeAscii(ftypPayload, 12, 'avif')
    const ispePayload = new Uint8Array(12)
    const ispeView = new DataView(ispePayload.buffer)
    ispeView.setUint32(4, 100)
    ispeView.setUint32(8, 100)
    const metaPayload = concat(new Uint8Array(4), box('ipco', box('ispe', ispePayload)))
    const avif = concat(box('ftyp', ftypPayload), box('meta', metaPayload))

    await expect(assertSafeImageFile(new File([avif], 'valid.avif', { type: 'image/avif' }))).resolves.toBeUndefined()
  })
})

describe('Office PDF raster budgets', () => {
  test('enforces page, dimension and pixel budgets before html2canvas', () => {
    expect(() => assertOfficePdfPageCount(OFFICE_TO_PDF_MAX_PAGES)).not.toThrow()
    expect(() => assertOfficePdfPageCount(OFFICE_TO_PDF_MAX_PAGES + 1)).toThrow('OFFICE_TOO_MANY_PAGES')
    expect(() => assertOfficePdfRasterBudget(OFFICE_TO_PDF_MAX_PAGE_DIMENSION + 1, 1))
      .toThrow('OFFICE_PAGE_DIMENSIONS_TOO_LARGE')
    expect(() => assertOfficePdfRasterBudget(3_000, 3_000)).toThrow('OFFICE_PAGE_RASTER_TOO_LARGE')
    expect(() => assertOfficePdfRasterBudget(1_000, 1_000, 79_000_000)).toThrow('OFFICE_TOTAL_RASTER_TOO_LARGE')
  })
})

describe('video merge limits', () => {
  const file = (size: number) => ({ size })

  test('enforces per-file, count and batch budgets', () => {
    expect(validateVideoMergeSelection([], [file(10)])).toBeNull()
    expect(validateVideoMergeSelection([], [file(VIDEO_MAX_FILE_SIZE + 1)])).toBe('FILE_TOO_LARGE')
    expect(validateVideoMergeSelection(
      Array.from({ length: VIDEO_MERGE_MAX_FILES }, () => file(1)),
      [file(1)],
    )).toBe('TOO_MANY_FILES')
    expect(validateVideoMergeSelection([file(VIDEO_MERGE_MAX_TOTAL_SIZE)], [file(1)]))
      .toBe('TOTAL_TOO_LARGE')
  })
})

describe('real file parsers', () => {
  test('parses a real EML with HTML and an attachment', async () => {
    const eml = [
      'From: Sender <sender@example.com>',
      'To: Recipient <recipient@example.com>',
      'Subject: Security fixture',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="naroz-boundary"',
      '',
      '--naroz-boundary',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Hello <img src="https://tracker.example/pixel.png"></p>',
      '--naroz-boundary',
      'Content-Type: text/plain; name="note.txt"',
      'Content-Disposition: attachment; filename="note.txt"',
      '',
      'fixture attachment',
      '--naroz-boundary--',
    ].join('\r\n')

    const parsed = await parseMailFile(new File([eml], 'fixture.eml', { type: 'message/rfc822' }))
    expect(parsed.subject).toBe('Security fixture')
    expect(parsed.senderEmail).toBe('sender@example.com')
    expect(parsed.bodyHtml).toContain('tracker.example')
    expect(parsed.attachments[0]?.fileName).toBe('note.txt')
  })

  test('reads a generated XLSX workbook through the production parser', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Name', 'Score'],
      ['Ada', 10],
      ['Linus', 9],
    ]), 'Results')
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const parsed = await readExcelFile(new File([bytes], 'fixture.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }))

    expect(parsed.sheets).toHaveLength(1)
    expect(parsed.sheets[0]?.headers).toEqual(['Name', 'Score'])
    expect(parsed.sheets[0]?.rows).toEqual([['Ada', '10'], ['Linus', '9']])
  })

  test('caps XLSX row materialization before producing application data', async () => {
    const workbook = XLSX.utils.book_new()
    const rows = [['Value'], ...Array.from({ length: EXCEL_MAX_ROWS + 2 }, (_, index) => [index])]
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Large')
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const parsed = await readExcelFile(new File([bytes], 'large.xlsx'))

    expect(parsed.sheets[0]?.rows).toHaveLength(EXCEL_MAX_ROWS)
  })

  test('rejects workbooks whose sheets exceed the global cell budget', async () => {
    const workbook = XLSX.utils.book_new()
    for (const name of ['One', 'Two']) {
      const sheet = XLSX.utils.aoa_to_sheet([['Value']])
      sheet['!ref'] = 'A1:CV10001'
      XLSX.utils.book_append_sheet(workbook, sheet, name)
    }
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    await expect(readExcelFile(new File([bytes], 'wide.xlsx'))).rejects.toThrow('EXCEL_TOO_MANY_CELLS')
  })

  test('limits sparse XLSX ranges before rows are materialized for PDF', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['start']])
    sheet['!ref'] = 'A1:XFD10'
    const sourceRange = XLSX.utils.decode_range(sheet['!ref'])
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      range: limitExcelRange(sourceRange, 10_000, 100),
    })

    expect(rows).toHaveLength(10)
    expect(rows.every((row) => row.length <= 100)).toBe(true)
  })

  test('merges DOCX buffers with the patched XML implementation', async () => {
    const createDocx = (text: string) => Packer.toArrayBuffer(new Document({
      sections: [{ children: [new Paragraph(text)] }],
    }))
    const buffers = await Promise.all([createDocx('First document'), createDocx('Second document')])
    const merged = await new Promise<ArrayBuffer>((resolve) => {
      new DocxMerger({ pageBreak: true }, buffers).save('arraybuffer', resolve)
    })
    const archive = await JSZip.loadAsync(merged)
    const documentXml = await archive.file('word/document.xml')?.async('text')

    expect(documentXml).toContain('First document')
    expect(documentXml).toContain('Second document')
  })
})

describe('mail complexity limits', () => {
  const baseMail = (): ParsedMsgData => ({
    subject: '', senderName: '', senderEmail: '', sentAt: '', recipients: [],
    body: '', bodyHtml: '', attachments: [],
  })

  test('rejects excessive attachment counts and body size', () => {
    const tooManyAttachments = baseMail()
    tooManyAttachments.attachments = Array.from({ length: 101 }, () => ({ content: new Uint8Array(1) }))
    expect(() => assertSafeMailComplexity(tooManyAttachments)).toThrow('MAIL_TOO_MANY_ATTACHMENTS')

    const oversizedBody = baseMail()
    oversizedBody.bodyHtml = 'A'.repeat(2_000_001)
    expect(() => assertSafeMailComplexity(oversizedBody)).toThrow('MAIL_BODY_TOO_LARGE')
  })
})

describe('Office archive guard', () => {
  test('stops before parsing when its cancellation signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(assertSafeOfficeArchive(new ArrayBuffer(0), controller.signal)).rejects.toThrow(OFFICE_ARCHIVE_CANCELLED)
  })

  test('accepts a small normal archive', async () => {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types></Types>')
    const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
    await expect(assertSafeOfficeArchive(buffer)).resolves.toMatchObject({ entryCount: 1 })
  })

  test('reuses a validated archive and cancels XML entry reads', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', '<document><paragraph>fixture</paragraph></document>')
    const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' })
    const loaded = await loadSafeOfficeArchive(buffer)
    const documentEntry = loaded.zip.file('word/document.xml')

    expect(documentEntry).not.toBeNull()
    await expect(readOfficeArchiveEntryText(documentEntry!)).resolves.toContain('fixture')

    const controller = new AbortController()
    controller.abort()
    await expect(readOfficeArchiveEntryText(documentEntry!, controller.signal))
      .rejects.toThrow(OFFICE_ARCHIVE_CANCELLED)
  })

  test('stops ZIP generation immediately when its stream is aborted', async () => {
    const controller = new AbortController()
    let paused = false
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    const stream = {
      on(event: string, handler: (...args: unknown[]) => void) {
        handlers[event] = handler
        return this
      },
      pause() {
        paused = true
        return this
      },
      resume() {
        controller.abort()
        handlers.data?.(new Uint8Array([1]))
        return this
      },
    }
    const zip = {
      generateInternalStream: () => stream,
    } as unknown as InstanceType<typeof JSZip>

    await expect(generateCancellableZipBlob(zip, controller.signal))
      .rejects.toThrow(ZIP_GENERATION_CANCELLED)
    expect(paused).toBe(true)
  })

  test('generates a normal ZIP Blob through the cancellable path', async () => {
    const zip = new JSZip()
    zip.file('result.txt', 'converted')
    const blob = await generateCancellableZipBlob(zip)

    expect(blob.type).toBe('application/zip')
    expect(blob.size).toBeGreaterThan(0)
  })

  test('rejects a highly compressed expansion payload', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', 'A'.repeat(2 * 1024 * 1024))
    const buffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    })
    await expect(assertSafeOfficeArchive(buffer)).rejects.toThrow('OFFICE_ARCHIVE_SUSPICIOUS_COMPRESSION')
  })

  test('rejects an archive whose ZIP headers underreport expanded bytes', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', 'A'.repeat(2 * 1024 * 1024))
    const generated = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    })
    const forged = generated.slice()
    const view = new DataView(forged.buffer, forged.byteOffset, forged.byteLength)
    for (let offset = 0; offset <= forged.length - 4; offset += 1) {
      const signature = view.getUint32(offset, true)
      if (signature === 0x04034b50 && offset + 26 <= forged.length) view.setUint32(offset + 22, 100, true)
      if (signature === 0x02014b50 && offset + 28 <= forged.length) view.setUint32(offset + 24, 100, true)
    }

    await expect(assertSafeOfficeArchive(forged.buffer)).rejects.toThrow()
  })

  test('rejects a compressed entry even when random archive padding dilutes the global ratio', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', 'A'.repeat(2 * 1024 * 1024))
    const generated = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    })
    const padding = new Uint8Array(2 * 1024 * 1024)
    for (let index = 0; index < padding.length; index += 1) {
      padding[index] = (index * 97 + 31) % 256
    }
    const padded = new Uint8Array(generated.length + padding.length)
    padded.set(generated)
    padded.set(padding, generated.length)

    await expect(assertSafeOfficeArchive(padded.buffer)).rejects.toThrow('OFFICE_ARCHIVE_SUSPICIOUS_COMPRESSION')
  })
})
