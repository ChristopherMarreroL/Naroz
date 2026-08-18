import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

import {
  isAllowedMailImageSource,
  MAIL_HTML_FORBIDDEN_ATTRIBUTES,
} from '../src/features/document/lib/mailHtmlPolicy'
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  validateImageDimensions,
} from '../src/features/image/lib/imageLimits'
import {
  VIDEO_MAX_FILE_SIZE,
  VIDEO_MERGE_MAX_FILES,
  VIDEO_MERGE_MAX_TOTAL_SIZE,
  validateVideoMergeSelection,
} from '../src/features/video/limits'
import { assertSafeOfficeArchive } from '../src/features/document/lib/officeArchiveLimits'
import { parseMailFile } from '../src/features/document/lib/msgToPdf'
import { readExcelFile } from '../src/features/excel/lib/excelColumnBuilder'

describe('mail HTML policy', () => {
  test('only permits embedded image data URLs', () => {
    expect(isAllowedMailImageSource(' data:image/png;base64,AAAA')).toBe(true)
    expect(isAllowedMailImageSource('https://tracker.example/pixel.png')).toBe(false)
    expect(isAllowedMailImageSource('javascript:alert(1)')).toBe(false)
    expect(isAllowedMailImageSource('data:image/svg+xml,<svg onload="alert(1)"/>')).toBe(false)
    expect(isAllowedMailImageSource(null)).toBe(false)
  })

  test('forbids attributes that can conceal remote requests or navigation', () => {
    expect(MAIL_HTML_FORBIDDEN_ATTRIBUTES).toEqual(expect.arrayContaining([
      'href', 'srcset', 'style', 'background', 'poster', 'formaction',
    ]))
  })
})

describe('image limits', () => {
  test('accepts ordinary images and rejects invalid or oversized canvases', () => {
    expect(validateImageDimensions(4_000, 3_000)).toBeNull()
    expect(validateImageDimensions(0, 100)).toBe('INVALID_IMAGE_DIMENSIONS')
    expect(validateImageDimensions(MAX_IMAGE_DIMENSION + 1, 1)).toBe('IMAGE_DIMENSIONS_TOO_LARGE')
    expect(validateImageDimensions(MAX_IMAGE_PIXELS, 2)).toBe('IMAGE_DIMENSIONS_TOO_LARGE')
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
})

describe('Office archive guard', () => {
  test('accepts a small normal archive', async () => {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types></Types>')
    const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
    await expect(assertSafeOfficeArchive(buffer)).resolves.toBeUndefined()
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
})
