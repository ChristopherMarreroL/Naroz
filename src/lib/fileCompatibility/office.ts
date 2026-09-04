import { DOMParser } from '@xmldom/xmldom'
import { loadSafeOfficeArchive, readOfficeArchiveEntryText } from '../../features/document/lib/officeArchiveLimits'
import { assertNotAborted, FileCompatibilityError, type FilePreflightResult } from './core'
import { compoundStreamNames } from './compound'

export type OpenXmlKind = 'docx' | 'xlsx' | 'pptx'
const formats = {
  docx: { part: 'word/document.xml', root: 'document', namespace: 'wordprocessingml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' },
  xlsx: { part: 'xl/workbook.xml', root: 'workbook', namespace: 'spreadsheetml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' },
  pptx: { part: 'ppt/presentation.xml', root: 'presentation', namespace: 'presentationml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml' },
} as const

export function isCompoundFile(buffer: ArrayBuffer) {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8))
  return signature.every((byte, index) => bytes[index] === byte)
}

/** Inspect actual compound stream names without invoking the unbounded Office parser. */
export async function assertOfficeNotEncrypted(buffer: ArrayBuffer, signal?: AbortSignal) {
  assertNotAborted(signal)
  if (!isCompoundFile(buffer)) return
  if (buffer.byteLength > 100 * 1024 * 1024) throw new FileCompatibilityError('OFFICE_ARCHIVE_TOO_LARGE')
  const names = compoundStreamNames(buffer)
  if (names.includes('EncryptedPackage') && names.includes('EncryptionInfo')) {
    throw new FileCompatibilityError('OFFICE_PASSWORD_REQUIRED')
  }
}

function parseXml(text: string) {
  // Bound DOM construction independently from the ZIP expansion budget.
  if (text.length > 8 * 1024 * 1024) throw new FileCompatibilityError('OFFICE_ARCHIVE_TOO_LARGE')
  let markup = 0
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 60 && ++markup > 100_000) throw new FileCompatibilityError('OFFICE_ARCHIVE_TOO_LARGE')
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new FileCompatibilityError('FILE_UNSUPPORTED')
  let invalid = false
  const parser = new DOMParser({ errorHandler: {
    warning: () => { invalid = true }, error: () => { invalid = true }, fatalError: () => { invalid = true },
  } })
  const doc = parser.parseFromString(text, 'application/xml')
  if (invalid || !doc.documentElement) throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
  return doc
}

function resolvesToPackagePart(target: string | null, expectedPart: string) {
  // eslint-disable-next-line no-control-regex -- OPC targets containing controls are invalid URI references.
  if (!target || /[\\\s\u0000-\u001f\u007f]/u.test(target) || /^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith('//')) return false
  try {
    const resolved = new URL(target, 'https://opc.invalid/')
    return resolved.origin === 'https://opc.invalid' && !resolved.search && !resolved.hash
      && resolved.pathname === `/${expectedPart}`
  } catch {
    return false
  }
}

/** Returns the already bounded archive so consumers do not inflate it again for validation. */
export async function preflightOffice(buffer: ArrayBuffer, expected: OpenXmlKind, signal?: AbortSignal) {
  assertNotAborted(signal)
  await assertOfficeNotEncrypted(buffer, signal)
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4))
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) {
    throw new FileCompatibilityError('FILE_TYPE_MISMATCH')
  }
  let archive: Awaited<ReturnType<typeof loadSafeOfficeArchive>>
  try {
    archive = await loadSafeOfficeArchive(buffer, signal)
  } catch (error) {
    assertNotAborted(signal)
    if (error instanceof Error && error.message.startsWith('OFFICE_ARCHIVE_')) throw error
    throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
  }
  const read = async (path: string) => {
    const entry = archive.zip.file(path)
    if (!entry) throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
    return parseXml(await readOfficeArchiveEntryText(entry, signal))
  }
  for (const [name, entry] of Object.entries(archive.zip.files)) {
    const original = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ?? name
    if (original.split(/[\\/]/).includes('..') || original.startsWith('/') || /^[a-z]:/i.test(original)) {
      throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
    }
  }
  const detected = (Object.keys(formats) as OpenXmlKind[]).filter((kind) => archive.zip.file(formats[kind].part))
  if (detected.length !== 1) throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
  if (detected[0] !== expected) throw new FileCompatibilityError('FILE_TYPE_MISMATCH')
  const format = formats[expected]
  const types = await read('[Content_Types].xml')
  if (types.documentElement.localName !== 'Types' || types.documentElement.namespaceURI !== 'http://schemas.openxmlformats.org/package/2006/content-types') {
    throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
  }
  const overrides = Array.from(types.getElementsByTagNameNS('*', 'Override'))
  if (!overrides.some((entry) => entry.getAttribute('PartName') === `/${format.part}` && entry.getAttribute('ContentType') === format.contentType)) {
    throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
  }
  const root = (await read(format.part)).documentElement
  if (root.localName !== format.root || !root.namespaceURI?.includes(format.namespace)) throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
  // Strict OpenXML is structurally valid, but current rendering/merge libraries expect Transitional.
  if (!root.namespaceURI.startsWith('http://schemas.openxmlformats.org/')) throw new FileCompatibilityError('FILE_UNSUPPORTED')
  if (root.namespaceURI !== `http://schemas.openxmlformats.org/${format.namespace}/2006/main`) throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
  const relationships = await read('_rels/.rels')
  if (relationships.documentElement.localName !== 'Relationships' || relationships.documentElement.namespaceURI !== 'http://schemas.openxmlformats.org/package/2006/relationships') {
    throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
  }
  const mainRelationships = Array.from(relationships.getElementsByTagNameNS('*', 'Relationship')).filter((entry) =>
    entry.getAttribute('Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument')
  const mainRelationship = mainRelationships[0]
  const targetMode = mainRelationship?.getAttribute('TargetMode')
  if (mainRelationships.length !== 1 || targetMode && targetMode !== 'Internal'
    || !resolvesToPackagePart(mainRelationship?.getAttribute('Target') ?? null, format.part)) {
    throw new FileCompatibilityError('OFFICE_ARCHIVE_INVALID')
  }
  let protectedDocument = false
  if (expected === 'docx' && archive.zip.file('word/settings.xml')) {
    protectedDocument = (await read('word/settings.xml')).getElementsByTagNameNS('*', 'documentProtection').length > 0
  }
  assertNotAborted(signal)
  const preflight: FilePreflightResult = {
    detectedType: expected, status: 'normal', encrypted: false, protected: protectedDocument,
    canProcessDirectly: true, canNormalize: false, warnings: protectedDocument ? ['OFFICE_EDITING_RESTRICTED'] : [],
  }
  return { ...archive, preflight }
}
