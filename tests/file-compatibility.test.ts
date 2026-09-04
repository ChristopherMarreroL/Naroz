import { describe, expect, test } from 'bun:test'
import { Document, Packer, Paragraph } from 'docx'
import JSZip from 'jszip'
import pptxgen from 'pptxgenjs'
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib'
import * as XLSX from 'xlsx'
import { assertOfficeNotEncrypted, preflightOffice } from '../src/lib/fileCompatibility/office'
import { openPdfForEditing } from '../src/lib/fileCompatibility/pdf'
import { compatibilityErrorKey, FileCompatibilityError } from '../src/lib/fileCompatibility/core'
import enMessages from '../src/i18n/messages.en'
import esMessages from '../src/i18n/messages.es'

// All documents are generated in memory; no user data or fixtures are persisted.
async function officeSamples() {
  const wordBuffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Synthetic test')] }] }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Synthetic'], [42]]), 'Sheet1')
  const slides = new pptxgen()
  slides.addSlide().addText('Synthetic test', { x: 1, y: 1, w: 5, h: 1 })
  return {
    docx: Uint8Array.from(wordBuffer).buffer,
    xlsx: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    pptx: await slides.write({ outputType: 'arraybuffer' }) as ArrayBuffer,
  }
}

describe('Office compatibility integration', () => {
  test('rejects missing, incorrect and external package main relationships', async () => {
    const bytes = (await officeSamples()).docx
    for (const target of [null, 'word/missing.xml', 'https://example.invalid/main.xml',
      'https://opc.invalid/word/document.xml', '//opc.invalid/word/document.xml']) {
      const zip = await JSZip.loadAsync(bytes)
      if (target === null) zip.remove('_rels/.rels')
      else zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"${target.startsWith('https:') ? ' TargetMode="External"' : ''}/></Relationships>`)
      await expect(preflightOffice(await zip.generateAsync({ type: 'arraybuffer' }), 'docx')).rejects.toThrow('OFFICE_ARCHIVE_INVALID')
    }
  })

  test('resolves valid package-root relationship URI references', async () => {
    const bytes = (await officeSamples()).docx
    for (const target of ['./word/document.xml', 'folder/../word/document.xml', '/word/document.xml']) {
      const zip = await JSZip.loadAsync(bytes)
      zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"/></Relationships>`)
      await expect(preflightOffice(await zip.generateAsync({ type: 'arraybuffer' }), 'docx')).resolves.toHaveProperty('preflight.detectedType', 'docx')
    }
  })

  test('rejects absolute relationship URI references without relying on TargetMode', async () => {
    const bytes = (await officeSamples()).docx
    for (const target of ['https://opc.invalid/word/document.xml', 'https:word/document.xml',
      'https:/word/document.xml', '//opc.invalid/word/document.xml', ' ./word/document.xml']) {
      const zip = await JSZip.loadAsync(bytes)
      zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"/></Relationships>`)
      await expect(preflightOffice(await zip.generateAsync({ type: 'arraybuffer' }), 'docx')).rejects.toThrow('OFFICE_ARCHIVE_INVALID')
    }
  })

  test('rejects lookalike main-part XML namespaces', async () => {
    const zip = await JSZip.loadAsync((await officeSamples()).docx)
    const xml = await zip.file('word/document.xml')!.async('string')
    zip.file('word/document.xml', xml.replaceAll('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main-spoof'))
    await expect(preflightOffice(await zip.generateAsync({ type: 'arraybuffer' }), 'docx')).rejects.toThrow('OFFICE_ARCHIVE_INVALID')
  })
  test('recognizes real generated DOCX, XLSX and PPTX', async () => {
    for (const [kind, bytes] of Object.entries(await officeSamples())) {
      const result = await preflightOffice(bytes, kind as 'docx' | 'xlsx' | 'pptx')
      expect(result.preflight.status).toBe('normal')
      expect(result.preflight.detectedType).toBe(kind)
      expect(result.preflight.canProcessDirectly).toBe(true)
      expect(result.totalUncompressed).toBeGreaterThan(0)
      expect(result.preflight.encrypted).toBe(false)
    }
  })

  test('rejects a valid Office archive presented as another format', async () => {
    const samples = await officeSamples()
    await expect(preflightOffice(samples.xlsx, 'docx')).rejects.toThrow('FILE_TYPE_MISMATCH')
    await expect(preflightOffice(samples.pptx, 'xlsx')).rejects.toThrow('FILE_TYPE_MISMATCH')
    await expect(preflightOffice(new TextEncoder().encode('not a ZIP').buffer, 'docx')).rejects.toThrow('FILE_TYPE_MISMATCH')
  })

  test('recognizes XLSX XML parts encoded as UTF-16LE and UTF-16BE', async () => {
    const bytes = (await officeSamples()).xlsx
    for (const littleEndian of [true, false]) {
      const zip = await JSZip.loadAsync(bytes)
      for (const path of ['xl/workbook.xml', '[Content_Types].xml']) {
        const xml = (await zip.file(path)!.async('string')).replace(/encoding="UTF-8"/i, 'encoding="UTF-16"')
        const encoded = new Uint8Array(2 + xml.length * 2)
        const view = new DataView(encoded.buffer)
        view.setUint16(0, 0xfeff, littleEndian)
        for (let index = 0; index < xml.length; index += 1) view.setUint16(2 + index * 2, xml.charCodeAt(index), littleEndian)
        zip.file(path, encoded)
      }
      const result = await preflightOffice(await zip.generateAsync({ type: 'arraybuffer' }), 'xlsx')
      expect(result.preflight.status).toBe('normal')
    }
  })

  test('classifies encrypted OOXML from real CFB streams and does not confuse legacy CFB', async () => {
    const compound = XLSX.CFB.utils.cfb_new()
    XLSX.CFB.utils.cfb_add(compound, 'EncryptionInfo', new Uint8Array([4, 0, 4, 0]))
    XLSX.CFB.utils.cfb_add(compound, 'EncryptedPackage', new Uint8Array(32))
    const bytes = Uint8Array.from(XLSX.CFB.write(compound, { type: 'buffer' })).buffer
    for (const kind of ['docx', 'xlsx', 'pptx'] as const) {
      await expect(preflightOffice(bytes, kind)).rejects.toThrow('OFFICE_PASSWORD_REQUIRED')
    }
    const legacy = XLSX.CFB.utils.cfb_new()
    XLSX.CFB.utils.cfb_add(legacy, 'Workbook', new Uint8Array(32))
    const legacyBytes = Uint8Array.from(XLSX.CFB.write(legacy, { type: 'buffer' })).buffer
    await expect(assertOfficeNotEncrypted(legacyBytes)).resolves.toBeUndefined()
    await expect(preflightOffice(legacyBytes, 'xlsx')).rejects.toThrow('FILE_TYPE_MISMATCH')
    await expect(assertOfficeNotEncrypted(bytes.slice(0, 16))).rejects.toThrow('FILE_CORRUPT')
  })

  test('reports Word editing restrictions without claiming password encryption', async () => {
    const zip = await JSZip.loadAsync((await officeSamples()).docx)
    zip.file('word/settings.xml', '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:documentProtection w:enforcement="1" w:edit="readOnly"/></w:settings>')
    const result = await preflightOffice(await zip.generateAsync({ type: 'arraybuffer' }), 'docx')
    expect(result.preflight.protected).toBe(true)
    expect(result.preflight.encrypted).toBe(false)
    expect(result.preflight.warnings).toEqual(['OFFICE_EDITING_RESTRICTED'])
  })

  test('rejects malformed XML, external entities, missing metadata and traversal entries', async () => {
    const bytes = (await officeSamples()).docx
    const cases: [string, string, string][] = [
      ['word/document.xml', '<w:document', 'OFFICE_ARCHIVE_INVALID'],
      ['word/document.xml', '<!DOCTYPE x [<!ENTITY x SYSTEM "https://example.invalid/secret">]><x>&x;</x>', 'FILE_UNSUPPORTED'],
      ['[Content_Types].xml', '<Types/>', 'OFFICE_ARCHIVE_INVALID'],
      ['../escaped.xml', '<x/>', 'OFFICE_ARCHIVE_INVALID'],
    ]
    for (const [path, xml, code] of cases) {
      const zip = await JSZip.loadAsync(bytes)
      zip.file(path, xml)
      await expect(preflightOffice(await zip.generateAsync({ type: 'arraybuffer' }), 'docx')).rejects.toThrow(code)
    }
  })

  test('rejects ZIP expansion attacks at the compatibility boundary', async () => {
    const zip = await JSZip.loadAsync((await officeSamples()).docx)
    zip.file('word/bomb.xml', 'A'.repeat(2 * 1024 * 1024))
    await expect(preflightOffice(await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' }), 'docx')).rejects.toThrow('OFFICE_ARCHIVE_SUSPICIOUS_COMPRESSION')
  })

  test('cancellation before parsing is distinguishable and retry succeeds', async () => {
    const bytes = (await officeSamples()).docx
    const controller = new AbortController()
    controller.abort()
    await expect(preflightOffice(bytes, 'docx', controller.signal)).rejects.toHaveProperty('name', 'AbortError')
    expect((await preflightOffice(bytes, 'docx')).preflight.status).toBe('normal')
  })
})

describe('compatibility error messages', () => {
  test('maps known failures to complete ES/EN messages without replacement characters', () => {
    const codes = ['PDF_PASSWORD_REQUIRED', 'OFFICE_PASSWORD_REQUIRED', 'FILE_TYPE_MISMATCH', 'FILE_UNSUPPORTED',
      'FILE_CORRUPT', 'OFFICE_ARCHIVE_INVALID', 'PDF_OUTPUT_INVALID', 'PDF_RASTER_LIMIT', 'PDF_TOO_MANY_PAGES',
      'OFFICE_ARCHIVE_TOO_LARGE', 'OFFICE_ARCHIVE_SUSPICIOUS_COMPRESSION']
    for (const code of codes) {
      const key = compatibilityErrorKey(new FileCompatibilityError(code))!
      expect(key).toBeTruthy()
      for (const messages of [esMessages, enMessages]) {
        const message = messages[key as keyof typeof messages]
        expect(message.length).toBeGreaterThan(0)
        expect(message).not.toContain('\uFFFD')
      }
    }
    expect(esMessages.compatibilityPdfPassword).toContain('contraseña')
    expect(enMessages.compatibilityPdfPassword).toContain('password')
    const invalid = new Error('Untrusted parser details')
    invalid.name = 'InvalidPDFException'
    expect(compatibilityErrorKey(invalid)).toBe('compatibilityCorrupt')
    expect(compatibilityErrorKey(new Error('unknown'))).toBeNull()
  })
})

describe('normal PDF compatibility integration', () => {
  test('copies selected pages in order with rotation, dimensions and text resources intact', async () => {
    const original = await PDFDocument.create()
    const font = await original.embedFont(StandardFonts.Helvetica)
    original.addPage([200, 300]).drawText('Synthetic text', { font })
    original.addPage([400, 500]).setRotation(degrees(90))
    const source = await openPdfForEditing(Uint8Array.from(await original.save()).buffer)
    try {
      expect(source.preflight.status).toBe('normal')
      const output = await PDFDocument.create()
      const budget = { pixels: 0, bytes: 0 }
      await source.appendTo(output, [1, 0], budget)
      const reopened = await PDFDocument.load(await output.save())
      expect(reopened.getPageCount()).toBe(2)
      expect(reopened.getPage(0).getSize()).toEqual({ width: 400, height: 500 })
      expect(reopened.getPage(0).getRotation().angle).toBe(90)
      expect(reopened.getPage(1).node.Resources()?.toString()).toContain('Helvetica')
      expect(budget).toEqual({ pixels: 0, bytes: 0 })
      await expect(source.appendTo(output, [-1], budget)).rejects.toThrow('FILE_CORRUPT')
    } finally { await source.dispose() }
  })

  test('rejects invalid type, malformed PDFs and excessive page count', async () => {
    await expect(openPdfForEditing(new TextEncoder().encode('not pdf').buffer)).rejects.toThrow('FILE_TYPE_MISMATCH')
    await expect(openPdfForEditing(new TextEncoder().encode('%PDF-1.7\ninvalid').buffer)).rejects.toThrow('FILE_CORRUPT')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    pdf.addPage()
    await expect(openPdfForEditing(Uint8Array.from(await pdf.save()).buffer, undefined, 1)).rejects.toThrow('PDF_TOO_MANY_PAGES')
  })

  test('cancelled copies do not append pages and can be retried with a fresh operation', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = Uint8Array.from(await pdf.save()).buffer
    const controller = new AbortController()
    const source = await openPdfForEditing(bytes, controller.signal)
    const output = await PDFDocument.create()
    controller.abort()
    await expect(source.appendTo(output, [0], { pixels: 0, bytes: 0 })).rejects.toHaveProperty('name', 'AbortError')
    expect(output.getPageCount()).toBe(0)
    await source.dispose()
    const retry = await openPdfForEditing(bytes)
    await retry.appendTo(output, [0], { pixels: 0, bytes: 0 })
    expect(output.getPageCount()).toBe(1)
    await retry.dispose()
  })
})
