const COMMON_FONTS = [
  'Arial', 'Arial Black', 'Aptos', 'Aptos Display', 'Calibri', 'Cambria', 'Candara',
  'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New',
  'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Helvetica', 'Impact',
  'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype', 'Segoe UI',
  'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Book Antiqua',
  'Bookman Old Style', 'Century', 'Optima', 'Menlo', 'Monaco', 'San Francisco',
  'Noto Sans', 'Noto Serif', 'Roboto', 'Liberation Sans', 'Liberation Serif',
]

const GENERIC_FONTS = ['sans-serif', 'serif', 'monospace']

export function pdfFontFamily(name: string) {
  if (GENERIC_FONTS.includes(name)) return name
  // Font names remain data in both inline CSS and the canvas font property.
  return `"${name.replace(/["\\]/g, '\\$&')}", sans-serif`
}

export function availablePdfFonts(): string[] {
  const canvas = document.createElement('canvas')
  try {
    const context = canvas.getContext('2d')!
    const sample = 'mmmmWWWWiiii 0123456789'
    const baselines = ['monospace', 'serif'].map((fallback) => {
      context.font = `48px ${fallback}`
      return { fallback, width: context.measureText(sample).width }
    })
    return [...COMMON_FONTS.filter((name) => baselines.some(({ fallback, width }) => {
      context.font = `48px "${name}", ${fallback}`
      return Math.abs(context.measureText(sample).width - width) > .01
    })).sort((a, b) => a.localeCompare(b)), ...GENERIC_FONTS]
  } finally { canvas.width = canvas.height = 0 }
}

type LocalFontWindow = Window & { queryLocalFonts?: () => Promise<{ family: string }[]> }

export function canQueryPdfFonts() {
  return typeof (window as LocalFontWindow).queryLocalFonts === 'function'
}

/** Invoked only from a user click; the browser owns the permission prompt. */
export async function queryPdfFonts() {
  const query = (window as LocalFontWindow).queryLocalFonts
  if (!query) throw new Error('Local fonts unavailable')
  const result = await query.call(window)
  return [...new Set(result.map((entry) => entry.family).filter((family) =>
    typeof family === 'string' && family.length > 0 && family.length <= 120 && Array.from(family).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
  ))].slice(0, 2048).sort((a, b) => a.localeCompare(b))
}
