import { useState } from 'react'

import { generateQrPngDataUrl, generateQrSvg, type QrRenderOptions } from '../utils/qrUtils'

export interface QrResult {
  pngDataUrl: string
  svg: string
  content: string
  options: QrRenderOptions
}

export function useQrGenerator() {
  const [result, setResult] = useState<QrResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async (content: string, options: QrRenderOptions) => {
    setIsGenerating(true)
    setError(null)

    try {
      const [pngDataUrl, svg] = await Promise.all([
        generateQrPngDataUrl(content, options),
        generateQrSvg(content, options),
      ])

      const nextResult = {
        pngDataUrl,
        svg,
        content,
        options,
      }

      setResult(nextResult)
      return nextResult
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : 'QR_GENERATION_FAILED'
      setError(message)
      setResult(null)
      return null
    } finally {
      setIsGenerating(false)
    }
  }

  const clear = () => {
    setResult(null)
    setError(null)
  }

  return {
    result,
    isGenerating,
    error,
    generate,
    clear,
  }
}
