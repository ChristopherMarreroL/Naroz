import JSZip from 'jszip'

export const OFFICE_ARCHIVE_MAX_ENTRIES = 2_000
export const OFFICE_ARCHIVE_MAX_UNCOMPRESSED_SIZE = 100 * 1024 * 1024
export const OFFICE_ARCHIVE_MAX_COMPRESSION_RATIO = 250
export const OFFICE_ARCHIVE_MAX_XML_SIZE = 8 * 1024 * 1024
export const OFFICE_ARCHIVE_CANCELLED = 'OFFICE_ARCHIVE_CANCELLED'

export interface OfficeArchiveStats {
  entryCount: number
  totalCompressed: number
  totalUncompressed: number
}

export type OfficeArchive = InstanceType<typeof JSZip>

interface ZipEntryStream {
  on(event: 'data', handler: (chunk: Uint8Array) => void): ZipEntryStream
  on(event: 'error', handler: (error: Error) => void): ZipEntryStream
  on(event: 'end', handler: () => void): ZipEntryStream
  pause(): ZipEntryStream
  resume(): ZipEntryStream
}

interface StreamableZipEntry {
  internalStream(type: 'uint8array'): ZipEntryStream
}

interface CompressedZipEntryData {
  compressedContent?: string | ArrayBuffer | ArrayBufferView
}

function getActualCompressedSize(entry: OfficeArchive['files'][string]) {
  const data = (entry as unknown as { _data?: CompressedZipEntryData })._data
  const compressedContent = data?.compressedContent

  if (typeof compressedContent === 'string') {
    return compressedContent.length
  }

  if (compressedContent instanceof ArrayBuffer) {
    return compressedContent.byteLength
  }

  if (ArrayBuffer.isView(compressedContent)) {
    return compressedContent.byteLength
  }

  throw new Error('OFFICE_ARCHIVE_ENTRY_DATA_UNAVAILABLE')
}

/** Count central-directory records before JSZip can allocate or collapse duplicate names. */
function assertSafeCentralDirectory(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const minimumEocdSize = 22
  const firstCandidate = Math.max(0, buffer.byteLength - minimumEocdSize - 0xffff - 4 * 1024 * 1024)
  let eocd = -1
  for (let offset = buffer.byteLength - minimumEocdSize; offset >= firstCandidate; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50
      && offset + minimumEocdSize + view.getUint16(offset + 20, true) <= buffer.byteLength
      && view.getUint16(offset + 4, true) === 0 && view.getUint16(offset + 6, true) === 0
      && view.getUint32(offset + 16, true) + view.getUint32(offset + 12, true) === offset) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('OFFICE_ARCHIVE_INVALID')
  const declaredEntries = view.getUint16(eocd + 10, true)
  const entriesOnDisk = view.getUint16(eocd + 8, true)
  const directorySize = view.getUint32(eocd + 12, true)
  const directoryOffset = view.getUint32(eocd + 16, true)
  if (entriesOnDisk !== declaredEntries || declaredEntries === 0xffff || declaredEntries > OFFICE_ARCHIVE_MAX_ENTRIES
    || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('OFFICE_ARCHIVE_TOO_MANY_ENTRIES')
  }
  const directoryEnd = directoryOffset + directorySize
  if (directoryEnd !== eocd || directoryEnd < directoryOffset) throw new Error('OFFICE_ARCHIVE_INVALID')
  let offset = directoryOffset
  let actualEntries = 0
  while (offset < directoryEnd) {
    if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== 0x02014b50) throw new Error('OFFICE_ARCHIVE_INVALID')
    actualEntries += 1
    if (actualEntries > OFFICE_ARCHIVE_MAX_ENTRIES) throw new Error('OFFICE_ARCHIVE_TOO_MANY_ENTRIES')
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  if (offset !== directoryEnd || actualEntries !== declaredEntries) throw new Error('OFFICE_ARCHIVE_INVALID')
}

function measureActualEntrySize(
  entry: OfficeArchive['files'][string],
  onChunk: (chunkSize: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<number>((resolve, reject) => {
    let stream: ZipEntryStream | null = null
    let total = 0
    let settled = false
    const cleanup = () => signal?.removeEventListener('abort', cancel)
    const cancel = () => {
      if (settled) return
      settled = true
      stream?.pause()
      cleanup()
      reject(new Error(OFFICE_ARCHIVE_CANCELLED))
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      stream?.pause()
      cleanup()
      reject(error)
    }

    if (signal?.aborted) {
      cancel()
      return
    }

    stream = (entry as unknown as StreamableZipEntry).internalStream('uint8array')
    signal?.addEventListener('abort', cancel, { once: true })

    stream
      .on('data', (chunk: Uint8Array) => {
        if (settled) return
        if (signal?.aborted) {
          cancel()
          return
        }
        try {
          total += chunk.byteLength
          onChunk(chunk.byteLength)
        } catch (error) {
          fail(error)
        }
      })
      .on('error', (error: Error) => {
        fail(error)
      })
      .on('end', () => {
        if (settled) return
        settled = true
        cleanup()
        resolve(total)
      })

    if (!settled) stream.resume()
  })
}

export function readOfficeArchiveEntryText(
  entry: OfficeArchive['files'][string],
  signal?: AbortSignal,
  maxBytes = OFFICE_ARCHIVE_MAX_XML_SIZE,
) {
  return new Promise<string>((resolve, reject) => {
    let stream: ZipEntryStream | null = null
    let settled = false
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    const cleanup = () => signal?.removeEventListener('abort', cancel)
    const cancel = () => {
      if (settled) return
      settled = true
      stream?.pause()
      cleanup()
      reject(new Error(OFFICE_ARCHIVE_CANCELLED))
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      stream?.pause()
      cleanup()
      reject(error)
    }

    if (signal?.aborted) {
      cancel()
      return
    }

    try {
      stream = (entry as unknown as StreamableZipEntry).internalStream('uint8array')
    } catch (error) {
      fail(error)
      return
    }

    signal?.addEventListener('abort', cancel, { once: true })
    stream
      .on('data', (chunk: Uint8Array) => {
        if (settled) return
        if (signal?.aborted) {
          cancel()
          return
        }
        totalBytes += chunk.byteLength
        if (totalBytes > maxBytes) {
          fail(new Error('OFFICE_ARCHIVE_TOO_LARGE'))
          return
        }
        chunks.push(chunk)
      })
      .on('error', (error: Error) => {
        fail(error)
      })
      .on('end', () => {
        if (settled) return
        try {
          const bytes = new Uint8Array(totalBytes)
          let offset = 0
          chunks.forEach((chunk) => {
            bytes.set(chunk, offset)
            offset += chunk.byteLength
          })
          const encoding = bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x3c && bytes[1] === 0 ? 'utf-16le'
            : bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 0x3c ? 'utf-16be' : 'utf-8'
          const text = new TextDecoder(encoding, { fatal: true }).decode(bytes)
          settled = true
          cleanup()
          resolve(text)
        } catch (error) {
          fail(error)
        }
      })

    if (!settled) stream.resume()
  })
}

export async function loadSafeOfficeArchive(buffer: ArrayBuffer, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error(OFFICE_ARCHIVE_CANCELLED)
  assertSafeCentralDirectory(buffer)
  const zip = await new JSZip().loadAsync(buffer)
  if (signal?.aborted) throw new Error(OFFICE_ARCHIVE_CANCELLED)
  const entries = Object.entries(zip.files)
    .filter(([name]) => !name.endsWith('/'))
    .map(([, entry]) => entry)

  if (entries.length > OFFICE_ARCHIVE_MAX_ENTRIES) {
    throw new Error('OFFICE_ARCHIVE_TOO_MANY_ENTRIES')
  }

  let totalUncompressed = 0
  for (const entry of entries) {
    if (signal?.aborted) throw new Error(OFFICE_ARCHIVE_CANCELLED)
    const actualCompressedSize = getActualCompressedSize(entry)
    let entryUncompressed = 0
    await measureActualEntrySize(entry, (chunkSize) => {
      if (signal?.aborted) throw new Error(OFFICE_ARCHIVE_CANCELLED)
      entryUncompressed += chunkSize
      totalUncompressed += chunkSize
      if (entryUncompressed > OFFICE_ARCHIVE_MAX_UNCOMPRESSED_SIZE || totalUncompressed > OFFICE_ARCHIVE_MAX_UNCOMPRESSED_SIZE) {
        throw new Error('OFFICE_ARCHIVE_TOO_LARGE')
      }

      const entryRatio = entryUncompressed / Math.max(actualCompressedSize, 1)
      if (entryUncompressed > 1024 * 1024 && entryRatio > OFFICE_ARCHIVE_MAX_COMPRESSION_RATIO) {
        throw new Error('OFFICE_ARCHIVE_SUSPICIOUS_COMPRESSION')
      }

      const actualRatio = totalUncompressed / Math.max(buffer.byteLength, 1)
      if (totalUncompressed > 1024 * 1024 && actualRatio > OFFICE_ARCHIVE_MAX_COMPRESSION_RATIO) {
        throw new Error('OFFICE_ARCHIVE_SUSPICIOUS_COMPRESSION')
      }
    }, signal)
  }

  return {
    zip,
    entryCount: entries.length,
    totalCompressed: buffer.byteLength,
    totalUncompressed,
  } satisfies OfficeArchiveStats & { zip: OfficeArchive }
}

export async function assertSafeOfficeArchive(buffer: ArrayBuffer, signal?: AbortSignal) {
  const archive = await loadSafeOfficeArchive(buffer, signal)
  return {
    entryCount: archive.entryCount,
    totalCompressed: archive.totalCompressed,
    totalUncompressed: archive.totalUncompressed,
  } satisfies OfficeArchiveStats
}
