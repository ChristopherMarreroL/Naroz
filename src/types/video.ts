export interface VideoItem {
  id: string
  file: File
  name: string
  size: number
  duration: number | null
  width: number | null
  height: number | null
  previewUrl: string
  type: string
  extension: 'mp4' | 'mkv'
  warnings: string[]
}

export interface MergeProgress {
  stage: 'idle' | 'loading' | 'processing' | 'finished' | 'error'
  percent: number
  message: string
}

export type MergeStrategy = 'fast' | 'compatible'

export interface MergeResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  mimeType: string
  strategy: MergeStrategy
}
