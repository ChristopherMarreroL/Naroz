export type CompatibilityStatus = 'normal' | 'compatibility-required' | 'password-required' | 'unsupported' | 'corrupt'

export interface FilePreflightResult {
  detectedType: string
  status: CompatibilityStatus
  encrypted?: boolean
  protected?: boolean
  canProcessDirectly: boolean
  canNormalize: boolean
  warnings: string[]
  errorCode?: string
}

export class FileCompatibilityError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'FileCompatibilityError'
  }
}

export function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError')
}

export function hasPdfSignature(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  // PDF readers allow a short binary prefix before the PDF header.
  return /%PDF-\d\.\d/.test(new TextDecoder('latin1').decode(bytes.subarray(0, 1024)))
}

export function classifyPdfError(error: unknown): FileCompatibilityError {
  if (error instanceof FileCompatibilityError) return error
  return new FileCompatibilityError(
    error instanceof Error && error.name === 'PasswordException' ? 'PDF_PASSWORD_REQUIRED' : 'FILE_CORRUPT',
  )
}

export function compatibilityErrorKey(error: unknown) {
  const code = error instanceof FileCompatibilityError ? error.code
    : error instanceof Error && error.name === 'PasswordException' ? 'PDF_PASSWORD_REQUIRED'
      : error instanceof Error ? error.message : ''
  if (code === 'PDF_PASSWORD_REQUIRED') return 'compatibilityPdfPassword'
  if (error instanceof Error && error.name === 'InvalidPDFException') return 'compatibilityCorrupt'
  if (code === 'OFFICE_PASSWORD_REQUIRED') return 'compatibilityOfficePassword'
  if (code === 'FILE_TYPE_MISMATCH') return 'compatibilityTypeMismatch'
  if (code === 'FILE_UNSUPPORTED') return 'compatibilityUnsupported'
  if (code === 'FILE_CORRUPT' || code === 'OFFICE_ARCHIVE_INVALID') return 'compatibilityCorrupt'
  if (code === 'PDF_OUTPUT_INVALID') return 'compatibilityOutputInvalid'
  if (code === 'PDF_RASTER_LIMIT' || code === 'PDF_LINK_LIMIT' || code === 'PDF_TOO_MANY_PAGES' || code.startsWith('OFFICE_ARCHIVE_TOO_') || code === 'OFFICE_ARCHIVE_SUSPICIOUS_COMPRESSION') return 'compatibilityLimit'
  return null
}
