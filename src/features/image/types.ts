export type ImageOutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'ico'

export interface ImageUploadState {
  file: File
  previewUrl: string
  width: number
  height: number
}

export interface ConvertedImageResult {
  blob: Blob
  url: string
  fileName: string
  size: number
  format: ImageOutputFormat
}
