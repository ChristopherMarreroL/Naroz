export const VIDEO_MAX_FILE_SIZE = 500 * 1024 * 1024
export const VIDEO_MERGE_MAX_FILES = 20
export const VIDEO_MERGE_MAX_TOTAL_SIZE = 1024 * 1024 * 1024

export function validateVideoMergeSelection(
  currentFiles: Array<Pick<File, 'size'>>,
  nextFiles: Array<Pick<File, 'size'>>,
) {
  if (currentFiles.length + nextFiles.length > VIDEO_MERGE_MAX_FILES) {
    return 'TOO_MANY_FILES' as const
  }

  if (nextFiles.some((file) => file.size > VIDEO_MAX_FILE_SIZE)) {
    return 'FILE_TOO_LARGE' as const
  }

  const totalSize = [...currentFiles, ...nextFiles].reduce((sum, file) => sum + file.size, 0)
  if (totalSize > VIDEO_MERGE_MAX_TOTAL_SIZE) {
    return 'TOTAL_TOO_LARGE' as const
  }

  return null
}
