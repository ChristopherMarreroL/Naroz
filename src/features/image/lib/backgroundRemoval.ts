import { preload, removeBackground, type Config } from '@imgly/background-removal'

import type { ConvertedImageResult } from '../types'
import { isUniformBackgroundPassAllowed, removeUniformBackground } from './uniformBackgroundRemoval'

export type BackgroundRemovalMode = 'auto' | 'uniform' | 'ai'
export type BackgroundRemovalMethod = 'uniform' | 'ai'
export type BackgroundRemovalProgressStage = 'analyzing' | 'loading-model' | 'segmenting'

export interface BackgroundRemovalProgress {
  percent?: number
  stage: BackgroundRemovalProgressStage
}

export interface BackgroundRemovalOptions {
  height?: number
  mode?: BackgroundRemovalMode
  removeEnclosedAreas?: boolean
  sensitivity?: number
  width?: number
}

export interface BackgroundRemovalResult extends ConvertedImageResult {
  method: BackgroundRemovalMethod
}

let preloadPromise: Promise<void> | null = null

function getRemovalConfig(onProgress?: (progress: BackgroundRemovalProgress) => void): Config {
  return {
    model: 'isnet_fp16',
    device: 'cpu',
    output: {
      format: 'image/png',
      quality: 1,
    },
    progress: (_key: string, current: number, total: number) => {
      if (!onProgress || total <= 0) return
      onProgress({
        percent: Math.min(100, Math.round((current / total) * 100)),
        stage: 'loading-model',
      })
    },
  }
}

export function preloadBackgroundRemoval(onProgress?: (progress: BackgroundRemovalProgress) => void) {
  if (!preloadPromise) {
    preloadPromise = preload(getRemovalConfig(onProgress)).catch((error) => {
      preloadPromise = null
      throw error
    })
  }

  return preloadPromise
}

function createOutputName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'imagen'
  return `${baseName}-sin-fondo.png`
}

export async function removeBackgroundFromImage(
  file: File,
  options: BackgroundRemovalOptions = {},
  onProgress?: (progress: BackgroundRemovalProgress) => void,
): Promise<BackgroundRemovalResult> {
  const mode = options.mode ?? 'auto'
  const removeEnclosedAreas = options.removeEnclosedAreas ?? false
  const sensitivity = options.sensitivity ?? 55
  const uniformPassAllowed = options.width === undefined || options.height === undefined
    ? true
    : isUniformBackgroundPassAllowed(options.width, options.height)

  try {
    if (mode !== 'ai' && uniformPassAllowed) {
      onProgress?.({ stage: 'analyzing' })
      let uniformResult = null
      try {
        uniformResult = await removeUniformBackground(
          file,
          sensitivity,
          mode === 'uniform',
          removeEnclosedAreas,
        )
      } catch (error) {
        if (mode === 'uniform') throw error
      }
      if (uniformResult) {
        return {
          blob: uniformResult.blob,
          url: URL.createObjectURL(uniformResult.blob),
          fileName: createOutputName(file.name),
          size: uniformResult.blob.size,
          format: 'png',
          method: 'uniform',
        }
      }
    }

    onProgress?.({ stage: 'loading-model' })
    await preloadBackgroundRemoval(onProgress)

    onProgress?.({ stage: 'segmenting' })
    const blob = await removeBackground(file, getRemovalConfig())

    return {
      blob,
      url: URL.createObjectURL(blob),
      fileName: createOutputName(file.name),
      size: blob.size,
      format: 'png',
      method: 'ai',
    }
  } catch (error) {
    console.error('Background removal failed', error)
    throw new Error('BACKGROUND_REMOVAL_FAILED', {
      cause: error,
    })
  }
}
