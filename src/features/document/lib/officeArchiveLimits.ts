import JSZip from 'jszip'

export const OFFICE_ARCHIVE_MAX_ENTRIES = 2_000
export const OFFICE_ARCHIVE_MAX_UNCOMPRESSED_SIZE = 100 * 1024 * 1024
export const OFFICE_ARCHIVE_MAX_COMPRESSION_RATIO = 250

interface ZipEntryData {
  compressedSize?: number
  uncompressedSize?: number
}

function getEntrySizes(entry: unknown) {
  const data = (entry as unknown as { _data?: ZipEntryData })._data
  return {
    compressed: Math.max(0, data?.compressedSize ?? 0),
    uncompressed: Math.max(0, data?.uncompressedSize ?? 0),
  }
}

export async function assertSafeOfficeArchive(buffer: ArrayBuffer) {
  const zip = await new JSZip().loadAsync(buffer)
  const entries = Object.entries(zip.files)
    .filter(([name]) => !name.endsWith('/'))
    .map(([, entry]) => entry)

  if (entries.length > OFFICE_ARCHIVE_MAX_ENTRIES) {
    throw new Error('OFFICE_ARCHIVE_TOO_MANY_ENTRIES')
  }

  let totalCompressed = 0
  let totalUncompressed = 0
  for (const entry of entries) {
    const sizes = getEntrySizes(entry)
    totalCompressed += sizes.compressed
    totalUncompressed += sizes.uncompressed

    if (totalUncompressed > OFFICE_ARCHIVE_MAX_UNCOMPRESSED_SIZE) {
      throw new Error('OFFICE_ARCHIVE_TOO_LARGE')
    }
  }

  const ratio = totalUncompressed / Math.max(totalCompressed, 1)
  if (totalUncompressed > 1024 * 1024 && ratio > OFFICE_ARCHIVE_MAX_COMPRESSION_RATIO) {
    throw new Error('OFFICE_ARCHIVE_SUSPICIOUS_COMPRESSION')
  }
}
