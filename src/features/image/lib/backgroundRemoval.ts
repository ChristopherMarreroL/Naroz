import { preload, removeBackground, type Config } from '@imgly/background-removal'

import type { ConvertedImageResult } from '../types'

let preloadPromise: Promise<void> | null = null

function getRemovalConfig(onProgress?: (message: string) => void): Config {
  return {
    model: 'isnet',
    device: 'cpu',
    output: {
      format: 'image/png',
      quality: 1,
    },
    progress: (key, current, total) => {
      if (!onProgress || total <= 0) {
        return
      }

      void key
      const percent = Math.min(100, Math.round((current / total) * 100))
      onProgress(`Cargando ${percent}%...`)
    },
  }
}

export function preloadBackgroundRemoval(onProgress?: (message: string) => void) {
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
  onProgress?: (message: string) => void,
): Promise<ConvertedImageResult> {
  try {
    onProgress?.('Preparando modelo de remocion de fondo...')
    await preloadBackgroundRemoval(onProgress)

    onProgress?.('Analizando imagen y separando sujeto del fondo...')
    const blob = await removeBackground(file, getRemovalConfig())

    return {
      blob,
      url: URL.createObjectURL(blob),
      fileName: createOutputName(file.name),
      size: blob.size,
      format: 'png',
    }
  } catch {
    throw new Error('No se pudo remover el fondo automaticamente con el motor actual del navegador.')
  }
}
