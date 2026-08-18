export interface BatchLimits {
  maxFiles: number
  maxTotalSize: number
}

export type BatchLimitError = 'TOO_MANY_FILES' | 'TOTAL_TOO_LARGE'

export const EXCEL_BATCH_LIMITS: BatchLimits = { maxFiles: 10, maxTotalSize: 100 * 1024 * 1024 }
export const IMAGE_BATCH_LIMITS: BatchLimits = { maxFiles: 20, maxTotalSize: 100 * 1024 * 1024 }
export const PDF_MERGE_LIMITS: BatchLimits = { maxFiles: 20, maxTotalSize: 200 * 1024 * 1024 }
export const DOCX_MERGE_LIMITS: BatchLimits = { maxFiles: 10, maxTotalSize: 100 * 1024 * 1024 }

export function validateBatchLimits(
  existingFiles: Array<Pick<File, 'size'>>,
  incomingFiles: Array<Pick<File, 'size'>>,
  limits: BatchLimits,
): BatchLimitError | null {
  if (existingFiles.length + incomingFiles.length > limits.maxFiles) {
    return 'TOO_MANY_FILES'
  }

  const totalSize = [...existingFiles, ...incomingFiles].reduce((sum, file) => sum + file.size, 0)
  return totalSize > limits.maxTotalSize ? 'TOTAL_TOO_LARGE' : null
}
