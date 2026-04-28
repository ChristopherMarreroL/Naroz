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
  extension: VideoOutputFormat
  warnings: string[]
}

export interface MergeProgress {
  stage: 'idle' | 'loading' | 'preparing' | 'converting' | 'merging' | 'finished' | 'error'
  percent: number
  message: string
  detail?: string
}

export type MergeStrategy = 'fast' | 'compatible'
export type VideoOutputFormat = 'mp4' | 'mkv' | 'mov'

export interface MergeResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  mimeType: string
  strategy: MergeStrategy
  outputFormat: VideoOutputFormat
}
