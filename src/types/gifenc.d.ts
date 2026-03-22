declare module 'gifenc' {
  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        transparent?: boolean
        transparentIndex?: number
        delay?: number
        palette?: number[][]
        repeat?: number
        colorDepth?: number
        dispose?: number
      },
    ): void
    finish(): void
    bytesView(): Uint8Array
  }

  export function quantize(data: Uint8Array, maxColors: number, options?: { format?: 'rgb565' | 'rgba4444' | 'rgb444' }): number[][]
  export function applyPalette(data: Uint8Array, palette: number[][], format?: 'rgb565' | 'rgba4444' | 'rgb444'): Uint8Array
}
